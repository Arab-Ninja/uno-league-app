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
 * par MySQL 8.0.13+, refusé par TiDB.
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
