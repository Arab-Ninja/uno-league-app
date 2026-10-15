import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/client.js";
import { adminEvents } from "../src/db/schema.js";
import { createPlayer, resetDatabase } from "./helpers.js";

/**
 * L'administration est prévenue de chaque inscription (ADMIN-014).
 *
 * Une ligne dans son flux, et le push qui l'accompagne : le nom du nouveau
 * compte, son type s'il est arbitre, et son parrain s'il en a un.
 */

async function inscriptions() {
  return db
    .select({
      body: adminEvents.body,
      title: adminEvents.title,
      playerId: adminEvents.playerId,
    })
    .from(adminEvents)
    .where(eq(adminEvents.type, "player.registered"));
}

describe("inscription annoncée à l'administration (ADMIN-014)", () => {
  beforeEach(resetDatabase);

  it("ADMIN-014 — chaque nouveau joueur apparaît dans le flux, à son nom", async () => {
    const joueur = await createPlayer({
      firstName: "Inès",
      lastName: "Martin",
    });

    const lignes = await inscriptions();
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({
      title: "Nouvelle inscription",
      playerId: joueur.identity.playerId,
    });
    expect(lignes[0]!.body).toBe("Inès Martin vient de s'inscrire.");
  });

  it("ADMIN-014 — un compte arbitre et un parrain sont précisés", async () => {
    const parrain = await createPlayer({
      firstName: "Karim",
      lastName: "Bensaïd",
    });
    const code = (await parrain.caller.referrals.mine()).code;

    await createPlayer({
      firstName: "Lucas",
      lastName: "Peeters",
      referralCode: code,
    });
    await createPlayer({
      firstName: "Emma",
      lastName: "Dubois",
      accountType: "referee",
    });

    const corps = (await inscriptions()).map((ligne) => ligne.body);
    expect(corps).toContain(
      "Lucas Peeters vient de s'inscrire, parrainé par Karim Bensaïd.",
    );
    expect(corps).toContain(
      "Emma Dubois vient de s'inscrire, en compte arbitre.",
    );
  });
});
