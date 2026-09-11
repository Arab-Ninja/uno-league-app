import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { SQUAD_RATING_INITIAL, squadRoleAtLeast } from "@uno/shared";
import { db } from "../src/db/client.js";
import { isDuplicateKeyError } from "../src/lib/errors.js";
import { createPlayer, resetDatabase } from "./helpers.js";

/**
 * Modèle de données du mode SQUAD (SQUAD-001).
 *
 * La spécification exige qu'un joueur n'appartienne qu'à un seul SQUAD, et
 * que la règle soit tenue **côté serveur** (AC02). Un contrôle applicatif n'y
 * suffirait pas : deux requêtes simultanées peuvent le franchir toutes les
 * deux, chacune lisant la base avant que l'autre n'écrive.
 *
 * Ces tests visent donc la base elle-même, en écrivant directement dedans —
 * là où les services ne sont pas encore là pour protéger quoi que ce soit.
 *
 * Les rejets se vérifient avec `isDuplicateKeyError` et non sur le texte du
 * message : Drizzle enveloppe l'erreur du pilote, et le libellé de surface ne
 * dit plus rien de la cause.
 */

/** Exécute une requête et rend l'erreur plutôt que de la laisser remonter. */
async function failureOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
    return null;
  } catch (error) {
    return error;
  }
}

async function makeSquad(name: string, founderId: number): Promise<number> {
  await db.execute(
    sql`INSERT INTO squads (name, slug, founder_player_id)
        VALUES (${name}, ${name.toLowerCase().replace(/\s+/g, "-")}, ${founderId})`,
  );
  const rows = await db.execute<{ id: number }>(
    sql`SELECT id FROM squads WHERE name = ${name}`,
  );
  return Number((rows[0] as unknown as { id: number }[])[0]!.id);
}

describe("modèle SQUAD (SQUAD-001)", () => {
  beforeEach(resetDatabase);

  it("AC02 — la base refuse une seconde affiliation active", async () => {
    const founder = await createPlayer();
    const player = await createPlayer();

    const first = await makeSquad("Les Loups", founder.identity.playerId);
    const second = await makeSquad("Les Aigles", founder.identity.playerId);

    await db.execute(
      sql`INSERT INTO squad_members (squad_id, player_id, role)
          VALUES (${first}, ${player.identity.playerId}, 'member')`,
    );

    // Deuxième club, même joueur : l'index unique sur la colonne générée
    // s'y oppose, quoi qu'ait vérifié le code applicatif.
    const refus = await failureOf(() =>
      db.execute(
        sql`INSERT INTO squad_members (squad_id, player_id, role)
            VALUES (${second}, ${player.identity.playerId}, 'member')`,
      ),
    );
    expect(isDuplicateKeyError(refus)).toBe(true);
  });

  it("AC15 — quitter un club libère la place sans effacer l'histoire", async () => {
    const founder = await createPlayer();
    const player = await createPlayer();
    const first = await makeSquad("Les Loups", founder.identity.playerId);
    const second = await makeSquad("Les Aigles", founder.identity.playerId);

    await db.execute(
      sql`INSERT INTO squad_members (squad_id, player_id, role)
          VALUES (${first}, ${player.identity.playerId}, 'member')`,
    );
    await db.execute(
      sql`UPDATE squad_members SET status = 'left', left_at = NOW(3)
          WHERE squad_id = ${first} AND player_id = ${player.identity.playerId}`,
    );

    // La place se libère…
    await db.execute(
      sql`INSERT INTO squad_members (squad_id, player_id, role)
          VALUES (${second}, ${player.identity.playerId}, 'member')`,
    );

    // …et le passage précédent reste inscrit : c'est sur lui que
    // s'adosseront les compositions et les transferts passés.
    const rows = await db.execute<{ total: number }>(
      sql`SELECT COUNT(*) AS total FROM squad_members
          WHERE player_id = ${player.identity.playerId}`,
    );
    expect(Number((rows[0] as unknown as { total: number }[])[0]!.total)).toBe(2);
  });

  it("SQUAD-002 — une seule demande d'adhésion en attente par club", async () => {
    const founder = await createPlayer();
    const player = await createPlayer();
    const squadId = await makeSquad("Les Loups", founder.identity.playerId);

    await db.execute(
      sql`INSERT INTO squad_join_requests (squad_id, player_id)
          VALUES (${squadId}, ${player.identity.playerId})`,
    );

    const refus = await failureOf(() =>
      db.execute(
        sql`INSERT INTO squad_join_requests (squad_id, player_id)
            VALUES (${squadId}, ${player.identity.playerId})`,
      ),
    );
    expect(isDuplicateKeyError(refus)).toBe(true);

    // Une demande tranchée ne bloque plus : le joueur peut retenter sa chance.
    await db.execute(
      sql`UPDATE squad_join_requests SET status = 'rejected', decided_at = NOW(3)
          WHERE squad_id = ${squadId} AND player_id = ${player.identity.playerId}`,
    );
    await expect(
      db.execute(
        sql`INSERT INTO squad_join_requests (squad_id, player_id)
            VALUES (${squadId}, ${player.identity.playerId})`,
      ),
    ).resolves.toBeTruthy();
  });

  it("SQUAD-003 — une trésorerie ne peut pas devenir négative", async () => {
    const founder = await createPlayer();
    const squadId = await makeSquad("Les Loups", founder.identity.playerId);

    await expect(
      db.execute(sql`UPDATE squads SET treasury_available = -1 WHERE id = ${squadId}`),
    ).rejects.toThrow();

    await expect(
      db.execute(sql`UPDATE squads SET treasury_locked = -1 WHERE id = ${squadId}`),
    ).rejects.toThrow();
  });

  it("SQUAD-007 — un club neuf démarre à la cote de départ", async () => {
    const founder = await createPlayer();
    const squadId = await makeSquad("Les Loups", founder.identity.playerId);

    const rows = await db.execute<{ rating: number }>(
      sql`SELECT rating FROM squads WHERE id = ${squadId}`,
    );
    expect(Number((rows[0] as unknown as { rating: number }[])[0]!.rating)).toBe(
      SQUAD_RATING_INITIAL,
    );
  });

  it("la hiérarchie des rôles se lit dans un seul sens", () => {
    expect(squadRoleAtLeast("founder", "captain")).toBe(true);
    expect(squadRoleAtLeast("captain", "captain")).toBe(true);
    expect(squadRoleAtLeast("member", "captain")).toBe(false);
    expect(squadRoleAtLeast("captain", "founder")).toBe(false);
  });
});
