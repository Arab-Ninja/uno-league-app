import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * Relève dans le code tous les messages d'erreur qu'un joueur peut lire
 * (I18N-002).
 *
 * **Pourquoi lire le code plutôt que tenir une liste.** Un message ajouté
 * sans traduction s'afficherait en français à un joueur anglophone, sans que
 * rien ne le signale : c'est exactement ce qui s'est produit pendant des mois.
 * Le catalogue est donc confronté au code lui-même, à chaque exécution des
 * tests — un message oublié fait échouer la suite, pas l'expérience d'un
 * joueur.
 *
 * Ce qui est relevé :
 *  - le message de chaque `new AppError(...)`, et les textes de ses champs ;
 *  - le message de chaque `new TRPCError({ message })` ;
 *  - les messages par défaut de chaque code (`ERROR_MESSAGES`) ;
 *  - les gabarits des alertes de la saisie vidéo, qui deviennent des refus à
 *    la publication ;
 *  - les textes écrits en toutes lettres dans un `traduireErreur(locale,
 *    "…")`, là où une route répond sans passer par tRPC.
 *
 * Un message se **plie** avant d'être comparé : les concaténations de
 * littéraux sont recollées, les deux branches d'une condition relevées, et
 * `gabarit("…", {…})` réduit à son texte. Ce qui ne se plie pas — une
 * variable — est rendu à part, pour qu'on sache où regarder.
 */

const ICI = dirname(fileURLToPath(import.meta.url));
const DEPOT = join(ICI, "..", "..", "..");

export interface Releve {
  /** Les textes français trouvés, dédoublonnés. */
  textes: Map<string, string>; // texte → premier emplacement
  /** Les messages qui ne se plient pas en texte : `fichier:ligne`. */
  inconnus: string[];
}

function fichiers(dossier: string): string[] {
  const tous: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) tous.push(...fichiers(chemin));
    else if (chemin.endsWith(".ts") && !chemin.includes(".test."))
      tous.push(chemin);
  }
  return tous;
}

/**
 * Les relais : des fonctions qui reçoivent un message déjà écrit et le
 * transmettent. Le texte est relevé chez leur appelant, pas chez eux.
 */
const RELAIS = new Set(["apps/api/src/lib/errors.ts"]);

/** Les textes qu'une expression peut produire, ou `null` si elle échappe. */
function plier(n: ts.Expression): string[] | null {
  // `new AppError(code, undefined, champs)` : le message par défaut du code,
  // relevé avec `ERROR_MESSAGES`.
  if (ts.isIdentifier(n) && n.text === "undefined") return [];
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
    return [n.text];
  if (ts.isParenthesizedExpression(n)) return plier(n.expression);
  if (ts.isConditionalExpression(n)) {
    const a = plier(n.whenTrue);
    const b = plier(n.whenFalse);
    return a && b ? [...a, ...b] : null;
  }
  if (
    ts.isBinaryExpression(n) &&
    n.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const a = plier(n.left);
    const b = plier(n.right);
    if (!a || !b || a.length !== 1 || b.length !== 1) return null;
    return [a[0]! + b[0]!];
  }
  if (
    ts.isCallExpression(n) &&
    ts.isIdentifier(n.expression) &&
    n.expression.text === "gabarit" &&
    n.arguments[0]
  ) {
    return plier(n.arguments[0]);
  }
  return null;
}

export function releverMessages(): Releve {
  const textes = new Map<string, string>();
  const inconnus: string[] = [];

  const noter = (liste: string[] | null, ou: string) => {
    if (!liste) {
      inconnus.push(ou);
      return;
    }
    for (const texte of liste) if (!textes.has(texte)) textes.set(texte, ou);
  };

  const sources = [
    ...fichiers(join(DEPOT, "apps/api/src")),
    ...fichiers(join(DEPOT, "packages/shared/src")),
  ];

  for (const chemin of sources) {
    const texte = readFileSync(chemin, "utf8");
    const src = ts.createSourceFile(
      chemin,
      texte,
      ts.ScriptTarget.Latest,
      true,
    );
    const rel = relative(DEPOT, chemin);
    if (RELAIS.has(rel)) continue;

    const visite = (n: ts.Node): void => {
      const ou = () =>
        `${rel}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;

      if (ts.isNewExpression(n) && ts.isIdentifier(n.expression)) {
        const [, message, champs] = n.arguments ?? [];

        if (n.expression.text === "AppError" && message) {
          // Un gabarit déjà construit ailleurs (une alerte de saisie) :
          // ses textes sont relevés là où il est écrit.
          const texteMessage = message.getText();
          if (!/\.modele$/.test(texteMessage)) noter(plier(message), ou());
          if (champs && ts.isObjectLiteralExpression(champs)) {
            for (const p of champs.properties) {
              if (ts.isPropertyAssignment(p)) noter(plier(p.initializer), ou());
            }
          }
        }

        if (n.expression.text === "TRPCError") {
          const options = n.arguments?.[0];
          if (options && ts.isObjectLiteralExpression(options)) {
            for (const p of options.properties) {
              if (
                ts.isPropertyAssignment(p) &&
                p.name.getText() === "message"
              ) {
                noter(plier(p.initializer), ou());
              }
            }
          }
        }
      }

      // Tout gabarit écrit dans le code, où qu'il serve — y compris les
      // libellés d'écriture, traduits à la lecture du relevé.
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        (n.expression.text === "gabarit" ||
          n.expression.text === "ecriture") &&
        n.arguments[0]
      ) {
        noter(plier(n.arguments[0]), ou());
      }

      // Un texte traduit sur place, hors erreur métier : `traduireErreur(
      // locale, "…")` dans une route Express, par exemple.
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === "traduireErreur" &&
        n.arguments[1] &&
        (ts.isStringLiteral(n.arguments[1]) ||
          ts.isNoSubstitutionTemplateLiteral(n.arguments[1]))
      ) {
        noter(plier(n.arguments[1]), ou());
      }

      // Les messages par défaut de chaque code.
      if (
        ts.isVariableDeclaration(n) &&
        n.name.getText() === "ERROR_MESSAGES" &&
        n.initializer &&
        ts.isObjectLiteralExpression(n.initializer)
      ) {
        for (const p of n.initializer.properties) {
          if (ts.isPropertyAssignment(p)) noter(plier(p.initializer), ou());
        }
      }

      ts.forEachChild(n, visite);
    };
    visite(src);
  }

  return { textes, inconnus };
}

/**
 * Les méthodes de Zod qui acceptent un message : `.min(3, "…")`,
 * `.refine(test, { message: "…" })`, `z.email("…")`…
 */
const REGLES_ZOD = new Set([
  "min",
  "max",
  "length",
  "regex",
  "refine",
  "superRefine",
  "email",
  "url",
  "nonempty",
  "startsWith",
  "endsWith",
  "int",
  "positive",
  "nonnegative",
  "negative",
  "gt",
  "gte",
  "lt",
  "lte",
  "multipleOf",
]);

/**
 * Relève les messages écrits à côté d'une règle de validation (I18N-002).
 *
 * Un message peut être un littéral, une constante du même fichier, ou
 * `remplirGabarit("… {max} …", {…})` quand il porte une valeur — éventuellement
 * derrière une petite fonction locale (`auMaximum(80)`). Un gabarit littéral
 * JavaScript (`` `Au maximum ${max}` ``) ne se relève pas : il est signalé,
 * pour être réécrit.
 */
export function releverValidation(): Releve {
  const textes = new Map<string, string>();
  const inconnus: string[] = [];

  const sources = [
    ...fichiers(join(DEPOT, "packages/shared/src")),
    ...fichiers(join(DEPOT, "apps/api/src/trpc")),
  ];

  for (const chemin of sources) {
    const texte = readFileSync(chemin, "utf8");
    if (!/from "zod"/.test(texte)) continue;
    const src = ts.createSourceFile(
      chemin,
      texte,
      ts.ScriptTarget.Latest,
      true,
    );
    const rel = relative(DEPOT, chemin);
    if (rel.endsWith("validation-i18n.ts")) continue;

    // Les constantes textuelles et les fonctions à gabarit du fichier.
    const constantes = new Map<string, string>();
    const fonctionsAGabarit = new Set<string>();
    const repere = (n: ts.Node): void => {
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.initializer &&
        ts.isStringLiteral(n.initializer)
      ) {
        constantes.set(n.name.text, n.initializer.text);
      }
      if (
        ts.isFunctionDeclaration(n) &&
        n.name &&
        n.body?.getText().includes("remplirGabarit(")
      ) {
        fonctionsAGabarit.add(n.name.text);
      }
      ts.forEachChild(n, repere);
    };
    repere(src);

    const noter = (n: ts.Expression, ou: string): void => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
        if (!textes.has(n.text)) textes.set(n.text, ou);
        return;
      }
      if (ts.isIdentifier(n)) {
        const valeur = constantes.get(n.text);
        if (valeur !== undefined) {
          if (!textes.has(valeur)) textes.set(valeur, ou);
        } else {
          inconnus.push(ou);
        }
        return;
      }
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        // Relevé par la visite des `remplirGabarit(…)` ci-dessous.
        if (
          n.expression.text === "remplirGabarit" ||
          fonctionsAGabarit.has(n.expression.text)
        ) {
          return;
        }
      }
      inconnus.push(ou);
    };

    const visite = (n: ts.Node): void => {
      const ou = () =>
        `${rel}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;

      if (ts.isCallExpression(n)) {
        const nom = ts.isPropertyAccessExpression(n.expression)
          ? n.expression.name.text
          : undefined;
        if (nom && REGLES_ZOD.has(nom)) {
          for (const argument of n.arguments) {
            if (
              ts.isStringLiteral(argument) ||
              ts.isNoSubstitutionTemplateLiteral(argument) ||
              ts.isTemplateExpression(argument) ||
              (ts.isIdentifier(argument) && constantes.has(argument.text)) ||
              ts.isCallExpression(argument)
            ) {
              if (!ts.isCallExpression(argument) || argument.arguments.length) {
                noter(argument, ou());
              }
            }
            if (ts.isObjectLiteralExpression(argument)) {
              for (const p of argument.properties) {
                if (
                  ts.isPropertyAssignment(p) &&
                  (p.name.getText() === "message" ||
                    p.name.getText() === "error")
                ) {
                  noter(p.initializer, ou());
                }
              }
            }
          }
        }

        if (
          ts.isIdentifier(n.expression) &&
          n.expression.text === "remplirGabarit" &&
          n.arguments[0]
        ) {
          noter(n.arguments[0], ou());
        }
      }
      ts.forEachChild(n, visite);
    };
    visite(src);
  }

  return { textes, inconnus };
}

// Exécuté seul, il affiche la liste : c'est ainsi qu'on voit ce qui manque.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const erreurs = releverMessages();
  const validation = releverValidation();
  console.log(
    JSON.stringify(
      {
        erreurs: {
          textes: [...erreurs.textes.entries()],
          inconnus: erreurs.inconnus,
        },
        validation: {
          textes: [...validation.textes.entries()],
          inconnus: validation.inconnus,
        },
      },
      null,
      1,
    ),
  );
}
