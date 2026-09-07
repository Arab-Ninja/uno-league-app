import { sql } from "drizzle-orm";
import { closeDatabase, db } from "./client.js";
import { readFileSync } from "node:fs";
import { env, loadedEnvFiles } from "../env.js";

/**
 * Diagnostic de connexion et de compatibilité de la base.
 *
 * TiDB est compatible avec le protocole MySQL, mais pas avec la totalité de
 * son comportement. Deux différences touchent directement ce schéma :
 *
 *  - les contraintes CHECK sont analysées puis IGNORÉES par défaut, à moins
 *    que `tidb_enable_check_constraint` ne soit activé ;
 *  - les clés étrangères ne sont réellement appliquées qu'à partir des
 *    versions récentes, avec `foreign_key_checks` actif.
 *
 * Ces deux mécanismes sont notre seconde ligne de défense : la première reste
 * le code applicatif, qui refuse déjà un solde négatif ou une référence
 * inexistante. Mais il vaut mieux savoir laquelle des deux est en place.
 */

type Row = Record<string, unknown>;

async function query(statement: ReturnType<typeof sql>): Promise<Row[]> {
  const result = await db.execute(statement);
  return (result[0] as unknown as Row[]) ?? [];
}

/** Lit une variable serveur, ou null si elle n'existe pas sur ce moteur. */
async function readVariable(name: string): Promise<string | null> {
  try {
    const rows = await query(
      sql`SHOW VARIABLES LIKE ${name}`,
    );
    const value = rows[0]?.["Value"];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

const OK = "  ✓";
const WARN = "  !";
const FAIL = "  ✗";

async function main(): Promise<void> {
  const target = env.DATABASE_URL.replace(/\/\/([^:]+):[^@]*@/, "//$1:***@");
  console.log(`\nBase cible : ${target}`);
  console.log(`TLS demandé : ${env.DATABASE_SSL ? "oui" : "non"}\n`);

  // --- Connexion ---------------------------------------------------------
  const versionRows = await query(sql`SELECT VERSION() AS version`);
  const version = String(versionRows[0]?.["version"] ?? "inconnue");
  const isTiDB = version.toLowerCase().includes("tidb");
  console.log(`${OK} Connexion établie — ${version}`);
  console.log(`${OK} Moteur détecté : ${isTiDB ? "TiDB" : "MySQL"}`);

  // --- Chiffrement de la liaison ----------------------------------------
  const cipherRows = await query(sql`SHOW STATUS LIKE 'Ssl_cipher'`);
  const cipher = String(cipherRows[0]?.["Value"] ?? "");
  if (cipher) {
    console.log(`${OK} Liaison chiffrée (${cipher})`);
  } else if (env.DATABASE_SSL) {
    console.log(`${FAIL} DATABASE_SSL=true mais la liaison n'est pas chiffrée`);
  } else {
    console.log(
      `${WARN} Liaison NON chiffrée — acceptable en local uniquement.` +
        " Sur un point d'accès public, mettez DATABASE_SSL=true.",
    );
  }

  // --- Base sélectionnée -------------------------------------------------
  const dbRows = await query(sql`SELECT DATABASE() AS name`);
  const database = String(dbRows[0]?.["name"] ?? "");
  if (!database || database === "sys" || database === "test") {
    console.log(
      `${FAIL} Base sélectionnée : « ${database || "aucune" } ».` +
        " L'URL doit se terminer par /uno_league.",
    );
  } else {
    console.log(`${OK} Base sélectionnée : ${database}`);
  }

  // --- Schéma appliqué ---------------------------------------------------
  const tableRows = await query(sql`
    SELECT table_name AS name
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
  `);
  const tables = new Set(tableRows.map((row) => String(row["name"])));
  const expected = [
    "users", "sessions", "players", "proposals", "proposal_participants",
    "payments", "teams", "team_members", "matches", "match_stats",
    "transactions", "shop_items", "orders", "order_items", "announcements",
    "announcement_reads", "device_tokens", "notification_deliveries",
    "audit_logs", "seasons",
  ];
  const missing = expected.filter((name) => !tables.has(name));

  if (missing.length === 0) {
    console.log(`${OK} Schéma complet (${expected.length} tables)`);
  } else {
    console.log(
      `${FAIL} ${missing.length} table(s) manquante(s) : ${missing.join(", ")}`,
    );
    console.log("      Lancez : pnpm db:migrate");
  }

  // --- Migrations appliquées ----------------------------------------------
  //
  // Une table présente ne suffit pas : une migration ultérieure peut avoir
  // ajouté des colonnes. Sans elles, la lecture comme l'écriture échouent, et
  // l'application n'affiche qu'un « une erreur est survenue » peu parlant.
  if (missing.length === 0) {
    const columnRows = await query(sql`
      SELECT table_name AS t, column_name AS c
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
    `);
    const present = new Set(
      columnRows.map((row) => `${String(row["t"])}.${String(row["c"])}`),
    );

    // Colonnes introduites après la migration initiale.
    const expectedColumns = [
      "players.position",
      "players.matches_played",
    ];
    const missingColumns = expectedColumns.filter(
      (column) => !present.has(column),
    );

    if (missingColumns.length === 0) {
      console.log(`${OK} Migrations à jour`);
    } else {
      console.log(
        `${FAIL} Migration en attente — colonne(s) manquante(s) : ${missingColumns.join(", ")}`,
      );
      console.log("      Lancez : pnpm db:migrate");
    }

    // Nombre de migrations enregistrées, utile pour repérer un écart.
    try {
      const appliedRows = await query(
        sql`SELECT COUNT(*) AS total FROM __drizzle_migrations`,
      );
      const applied = Number(appliedRows[0]?.["total"] ?? 0);
      console.log(`${OK} ${applied} migration(s) enregistrée(s)`);
    } catch {
      console.log(`${WARN} Aucun journal de migration trouvé`);
    }
  }

  // --- Contraintes CHECK --------------------------------------------------
  if (tables.has("players")) {
    let checksEnforced = false;
    try {
      // On tente d'écrire un solde négatif dans une transaction annulée.
      await db.transaction(async (tx) => {
        await tx.execute(sql`
          INSERT INTO players
            (user_id, first_name, last_name, display_name, nationality,
             date_of_birth, uno_points)
          VALUES (0, 'diag', 'diag', 'diag', 'BE', '2000-01-01', -1)
        `);
        // Si l'insertion passe, la contrainte n'est pas appliquée.
        throw new Error("__rollback__");
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      checksEnforced = !message.includes("__rollback__");
    }

    if (checksEnforced) {
      console.log(`${OK} Contraintes CHECK appliquées (solde négatif refusé)`);
    } else {
      const setting = await readVariable("tidb_enable_check_constraint");
      console.log(
        `${WARN} Contraintes CHECK NON appliquées par ce moteur.` +
          (setting !== null
            ? `\n      tidb_enable_check_constraint = ${setting}. Pour les activer :` +
              "\n      SET GLOBAL tidb_enable_check_constraint = ON;"
            : ""),
      );
      console.log(
        "      Sans conséquence sur le fonctionnement : le registre UNO refuse",
      );
      console.log(
        "      déjà tout débit excédentaire. C'est un filet de sécurité en moins.",
      );
    }
  }

  // --- Clés étrangères ----------------------------------------------------
  const fkChecks = await readVariable("foreign_key_checks");
  if (fkChecks === "ON" || fkChecks === "1") {
    console.log(`${OK} Clés étrangères appliquées`);
  } else if (fkChecks !== null) {
    console.log(`${WARN} foreign_key_checks = ${fkChecks}`);
  }

  // --- Cohérence du registre financier (WAL-006) -------------------------
  if (tables.has("transactions") && tables.has("players")) {
    const driftRows = await query(sql`
      SELECT COUNT(*) AS total
      FROM players p
      LEFT JOIN (
        SELECT player_id, SUM(amount) AS ledger_sum
        FROM transactions GROUP BY player_id
      ) t ON t.player_id = p.id
      WHERE p.uno_points <> COALESCE(t.ledger_sum, 0)
    `);
    const drift = Number(driftRows[0]?.["total"] ?? 0);
    console.log(
      drift === 0
        ? `${OK} Registre financier cohérent`
        : `${FAIL} ${drift} solde(s) incohérent(s) avec le registre`,
    );
  }

  // --- Comptes ------------------------------------------------------------
  if (tables.has("users")) {
    const countRows = await query(sql`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM users WHERE role = 'admin') AS admins
    `);
    const users = Number(countRows[0]?.["users"] ?? 0);
    const admins = Number(countRows[0]?.["admins"] ?? 0);
    console.log(`${OK} ${users} compte(s), dont ${admins} administrateur(s)`);
    if (admins === 0) {
      console.log(
        `${WARN} Aucun administrateur. Renseignez ADMIN_EMAIL et ADMIN_PASSWORD,`,
      );
      console.log("      puis redémarrez l'API : le compte sera créé.");
    }
  }

  console.log("");
  await closeDatabase();
}

/**
 * Cherche un mot de passe silencieusement tronqué dans le fichier `.env`.
 *
 * dotenv traite `#` comme un début de commentaire, y compris au milieu d'une
 * valeur : `DATABASE_PASSWORD=abc#def` est lu comme « abc ». Les mots de
 * passe générés par TiDB Cloud contiennent régulièrement ce caractère. Le
 * serveur répond alors « accès refusé » sur un mot de passe pourtant
 * correctement copié — sans que rien n'indique qu'il a été coupé.
 *
 * Les espaces de fin de ligne sont eux aussi supprimés, ce qui produit le
 * même symptôme.
 */
function inspectPasswordLine(): string[] {
  const notes: string[] = [];

  for (const file of loadedEnvFiles) {
    let lines: string[];
    try {
      lines = readFileSync(file, "utf8").split(/\r?\n/);
    } catch {
      continue;
    }

    for (const line of lines) {
      const match = /^\s*DATABASE_PASSWORD\s*=\s*(.*)$/.exec(line);
      if (!match) continue;

      const value = match[1] ?? "";
      const quoted = /^".*"\s*$/.test(value) || /^'.*'\s*$/.test(value);
      if (quoted) continue;

      if (value.includes("#")) {
        notes.push(
          "Le mot de passe contient un « # », que dotenv interprète comme un",
          "  début de commentaire : seul le début est lu. Encadrez-le de",
          "  guillemets droits dans le fichier .env :",
          '    DATABASE_PASSWORD="votre#mot#de#passe"',
        );
      } else if (value !== value.trimEnd()) {
        notes.push(
          "Le mot de passe se termine par un ou plusieurs espaces, supprimés",
          "  à la lecture. Encadrez-le de guillemets droits :",
          '    DATABASE_PASSWORD="votre mot de passe "',
        );
      }
    }
  }

  return notes;
}

/**
 * Drizzle enveloppe l'erreur du pilote : le motif exploitable (hôte
 * introuvable, accès refusé, base inconnue) se trouve dans la cause, pas dans
 * le message de premier niveau. On parcourt donc toute la chaîne.
 */
function collectMessages(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth++) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = (current as { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(" | ");
}

main().catch((error: unknown) => {
  const message = collectMessages(error);
  console.error(`\n${FAIL} Échec du diagnostic\n`);

  // Les erreurs de connexion les plus fréquentes, traduites en actions.
  const hints: [RegExp, string][] = [
    [/ENOTFOUND|EAI_AGAIN/, "Hôte introuvable : vérifiez la valeur HOST de l'URL."],
    [/ETIMEDOUT|ECONNREFUSED/, "Connexion refusée : vérifiez le port (4000 pour TiDB Cloud) et que votre adresse IP est autorisée dans la console."],
    [/Access denied/i, "Identifiants refusés : vérifiez l'utilisateur et le mot de passe. Si le mot de passe contient @ : / ? # ou %, il doit être encodé dans l'URL (voir docs/DEPLOIEMENT.md)."],
    [/Unknown database/i, "Base inexistante : créez-la avec CREATE DATABASE uno_league; depuis l'éditeur SQL de la console."],
    [/SSL|TLS|certificate|self.signed/i, "Problème TLS : TiDB Cloud impose DATABASE_SSL=true."],
    [/ER_NOT_SUPPORTED_AUTH_MODE/, "Mode d'authentification non supporté par le pilote."],
  ];

  const hint = hints.find(([pattern]) => pattern.test(message));
  console.error(`  ${message}\n`);
  if (hint) console.error(`  → ${hint[1]}\n`);

  // Un « accès refusé » vient souvent d'un mot de passe tronqué à la lecture
  // du fichier, pas d'une erreur de saisie : on le vérifie explicitement.
  if (/Access denied/i.test(message)) {
    const notes = inspectPasswordLine();
    if (notes.length > 0) {
      console.error(`  → ${notes.join("\n  ")}\n`);
    } else {
      console.error(
        "  → Le mot de passe lu depuis .env ne présente aucun caractère\n" +
          "    problématique. Vérifiez qu'il correspond bien au dernier mot de\n" +
          "    passe généré : en régénérer un invalide le précédent.\n",
      );
    }
  }

  process.exitCode = 1;
});
