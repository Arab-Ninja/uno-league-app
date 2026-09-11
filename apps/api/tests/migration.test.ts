import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Compatibilité TiDB du SQL généré.
 *
 * TiDB parle le protocole MySQL sans en accepter toute la syntaxe. Ces écarts
 * ne se voient pas en développement sur MySQL : ils n'apparaissent qu'au
 * moment de migrer la base de production, migration à moitié appliquée à la
 * clé. Ce test lit le SQL généré et refuse les constructions concernées.
 *
 * Cas déjà rencontré en production : `json NOT NULL DEFAULT ('[]')`, accepté
 * par MySQL 8.0.13+, refusé par TiDB. Puis l'ajout d'une colonne générée
 * stockée par `ALTER TABLE` — erreur 3106 — qui a fait échouer la migration
 * du mode SQUAD deux fois de suite avant d'être comprise.
 */

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
);

function migrationFiles(): { name: string; sql: string }[] {
  return readdirSync(migrationsFolder)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({
      name,
      sql: readFileSync(join(migrationsFolder, name), "utf8"),
    }));
}

/** Constructions valides en MySQL mais refusées par TiDB. */
const UNSUPPORTED: { pattern: RegExp; label: string; remedy: string }[] = [
  {
    pattern: /\bDEFAULT\s*\(/i,
    label: "valeur par défaut sous forme d'expression, ex. DEFAULT ('[]')",
    remedy:
      "Retirez le .default() de la colonne et fournissez la valeur à l'écriture.",
  },
  {
    pattern: /\b(json|text|blob|tinytext|mediumtext|longtext)\b[^,\n]*\bDEFAULT\b/i,
    label: "valeur par défaut sur une colonne JSON, TEXT ou BLOB",
    remedy: "TiDB ne les accepte pas : rendez la colonne nullable ou explicite.",
  },
  {
    pattern: /\bALTER\s+TABLE\b.*\bADD\s+CONSTRAINT\b.*\bCHECK\b/i,
    label: "ajout d'une contrainte CHECK par ALTER TABLE",
    remedy:
      "TiDB refuse cette forme sur une table existante. Retirez le .check() ou " +
      "recréez la table.",
  },
  {
    // Rencontré en développement : `ALTER TABLE shop_items ADD sizes json NOT
    // NULL` s'applique sans erreur, puis MySQL laisse NULL dans les lignes
    // existantes — une colonne NOT NULL qui contient des NULL. Aucune valeur
    // par défaut n'est possible sur JSON/TEXT/BLOB, donc la seule forme sûre
    // est une colonne nullable normalisée à la lecture.
    pattern:
      /\bALTER\s+TABLE\b[^;]*\bADD\b[^;]*\b(json|text|blob|tinytext|mediumtext|longtext)\b[^;]*\bNOT\s+NULL\b/i,
    label: "colonne JSON, TEXT ou BLOB ajoutée en NOT NULL par ALTER TABLE",
    remedy:
      "Elle ne peut pas être renseignée pour les lignes existantes : rendez-la " +
      "nullable et normalisez la valeur à la lecture.",
  },
  {
    pattern: /\bSPATIAL\s+INDEX\b/i,
    label: "index spatial",
    remedy: "Non supporté par TiDB.",
  },
  {
    pattern: /\bFULLTEXT\b/i,
    label: "index plein texte",
    remedy: "Non supporté par TiDB : passez par un index applicatif.",
  },
];

/** Le corps des instructions, commentaires ôtés. */
function statementsOf(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) =>
      statement
        .split(/\r?\n/)
        // Les commentaires décrivent les pièges, jusqu'à les citer mot pour
        // mot : les analyser reviendrait à signaler la mise en garde.
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((statement) => statement.length > 0);
}

describe("compatibilité TiDB des migrations", () => {
  it("génère au moins un fichier de migration", () => {
    expect(migrationFiles().length).toBeGreaterThan(0);
  });

  it("n'utilise aucune construction refusée par TiDB", () => {
    const problems: string[] = [];

    for (const file of migrationFiles()) {
      for (const line of file.sql.split(/\r?\n/)) {
        // Les lignes de séparation d'instructions ne portent pas de schéma.
        if (line.trim().startsWith("--") || line.includes("statement-breakpoint")) {
          continue;
        }
        for (const rule of UNSUPPORTED) {
          if (rule.pattern.test(line)) {
            problems.push(
              `${file.name} — ${rule.label}\n    ${line.trim()}\n    ${rule.remedy}`,
            );
          }
        }
      }
    }

    expect(problems, `\n${problems.join("\n\n")}\n`).toEqual([]);
  });

  it("n'ajoute jamais de colonne générée stockée par ALTER TABLE", () => {
    /**
     * TiDB accepte une colonne générée posée dans le `CREATE TABLE`, et
     * refuse la même colonne ajoutée ensuite (erreur 3106,
     * ER_UNSUPPORTED_ACTION_ON_GENERATED_COLUMN). La règle se lit donc sur
     * l'instruction entière, et non ligne à ligne : la forme fautive tient
     * parfois dans une chaîne passée à PREPARE.
     */
    const faulty: string[] = [];

    for (const file of migrationFiles()) {
      for (const statement of statementsOf(file.sql)) {
        const flat = statement.replace(/\s+/g, " ");
        if (!/\bALTER\s+TABLE\b/i.test(flat)) continue;
        if (!/\bADD\b/i.test(flat)) continue;
        if (!/\bGENERATED\s+ALWAYS\s+AS\b/i.test(flat)) continue;
        faulty.push(`${file.name}\n    ${flat.slice(0, 160)}`);
      }
    }

    expect(
      faulty,
      "\nUne colonne générée doit naître avec sa table : posez-la dans le " +
        "CREATE TABLE, ou faites-en une colonne ordinaire tenue par le " +
        `service.\n\n${faulty.join("\n\n")}\n`,
    ).toEqual([]);
  });

  it("crée les 20 tables du modèle de données", () => {
    const sql = migrationFiles()
      .map((file) => file.sql)
      .join("\n");

    const expected = [
      "users", "sessions", "players", "proposals", "proposal_participants",
      "payments", "teams", "team_members", "matches", "match_stats",
      "transactions", "shop_items", "orders", "order_items", "announcements",
      "announcement_reads", "device_tokens", "notification_deliveries",
      "audit_logs", "seasons",
    ];

    for (const table of expected) {
      expect(sql, `table ${table} absente des migrations`).toContain(
        `CREATE TABLE \`${table}\``,
      );
    }
  });
});
