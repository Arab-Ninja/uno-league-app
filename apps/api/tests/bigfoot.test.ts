import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { proposalParticipants } from "../src/db/schema.js";
import {
  createFundedPlayer as createPlayer,
  daysFromNow,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Le mode Grand Foot au calendrier (MODE-003).
 *
 * Trois règles le distinguent des autres modes, et chacune se vérifie ici :
 * l'effectif se choisit, le camp aussi, et la séance se confirme sans
 * paiement. La quatrième — qu'il ne rapporte rien — vit dans le mode et ses
 * tests partagés.
 */

/** Ouvre une proposition de grand foot et rend son identifiant. */
async function ouvrir(
  auteur: TestPlayer,
  playersPerTeam: number,
  overrides: { date?: string; slotStartHour?: number } = {},
): Promise<number> {
  const { proposal } = await auteur.caller.proposals.create({
    date: overrides.date ?? daysFromNow(3),
    slotStartHour: overrides.slotStartHour ?? 18,
    venueId: "londerzeel",
    modeId: "bigfoot",
    playersPerTeam,
  });
  return proposal.id;
}

async function sideOf(proposalId: number, playerId: number) {
  const [row] = await db
    .select({ side: proposalParticipants.side })
    .from(proposalParticipants)
    .where(eq(proposalParticipants.proposalId, proposalId));
  void row;

  const rows = await db
    .select({
      playerId: proposalParticipants.playerId,
      side: proposalParticipants.side,
    })
    .from(proposalParticipants)
    .where(eq(proposalParticipants.proposalId, proposalId));

  return rows.find((r) => r.playerId === playerId)?.side ?? null;
}

describe("Grand Foot (MODE-003)", () => {
  beforeEach(resetDatabase);

  it("MODE-003 — l'effectif choisi fixe le quota", async () => {
    const auteur = await createPlayer();
    const id = await ouvrir(auteur, 7);

    const detail = await auteur.caller.proposals.get({ proposalId: id });
    // Sept contre sept : quatorze joueurs, pas le minimum du mode.
    expect(detail.minParticipants).toBe(14);
    expect(detail.priceUno).toBe(0);
  });

  it("MODE-003 — un effectif hors bornes est refusé", async () => {
    const auteur = await createPlayer();

    await expect(ouvrir(auteur, 5)).rejects.toThrow(/entre 7 et 11/i);
    await expect(ouvrir(auteur, 12)).rejects.toThrow(/entre 7 et 11/i);
  });

  it("MODE-003 — un mode à format fixe refuse qu'on lui impose un effectif", async () => {
    /*
     * Refuser plutôt qu'ignorer : un effectif accepté en silence puis sans
     * effet est la pire des réponses — le joueur croit avoir ouvert un
     * dix contre dix et se retrouve à quinze.
     */
    const auteur = await createPlayer();

    await expect(
      auteur.caller.proposals.create({
        date: daysFromNow(3),
        slotStartHour: 19,
        venueId: "city-five",
        modeId: "friendly",
        playersPerTeam: 8,
      }),
    ).rejects.toThrow(/format fixe/i);
  });

  it("MODE-003 — le terrain de Londerzeel n'accueille que le grand foot", async () => {
    const auteur = await createPlayer();

    await expect(
      auteur.caller.proposals.create({
        date: daysFromNow(3),
        slotStartHour: 19,
        venueId: "londerzeel",
        modeId: "friendly",
      }),
    ).rejects.toThrow(/n'accueille pas ce mode/i);
  });

  it("MODE-003 — l'auteur prend le camp A, les suivants choisissent", async () => {
    const auteur = await createPlayer();
    const second = await createPlayer();
    const id = await ouvrir(auteur, 7);

    expect(await sideOf(id, auteur.identity.playerId)).toBe("A");

    await second.caller.proposals.join({ proposalId: id, side: "B" });
    expect(await sideOf(id, second.identity.playerId)).toBe("B");
  });

  it("MODE-003 — sans camp demandé, le moins rempli l'emporte", async () => {
    // Le cas de l'administration qui complète un plateau sans se soucier des
    // couleurs : le résultat doit rester jouable.
    const auteur = await createPlayer();
    const second = await createPlayer();
    const id = await ouvrir(auteur, 7);

    await second.caller.proposals.join({ proposalId: id });
    expect(await sideOf(id, second.identity.playerId)).toBe("B");
  });

  it("MODE-003 — une équipe complète renvoie vers l'autre", async () => {
    /*
     * Le plafond par côté est la règle qui fait tenir le mode : sans lui,
     * quatorze personnes choisissent la même équipe et personne ne joue.
     */
    const auteur = await createPlayer();
    const id = await ouvrir(auteur, 7);

    // Six de plus en A : l'équipe est pleine à sept, l'auteur compris.
    for (let index = 0; index < 6; index++) {
      const joueur = await createPlayer();
      await joueur.caller.proposals.join({ proposalId: id, side: "A" });
    }

    const refuse = await createPlayer();
    await expect(
      refuse.caller.proposals.join({ proposalId: id, side: "A" }),
    ).rejects.toThrow(/équipe B/i);
  });

  it("MODE-003 — le plateau complet confirme la séance, sans rien à régler", async () => {
    const auteur = await createPlayer();
    const id = await ouvrir(auteur, 7);

    for (let index = 0; index < 13; index++) {
      const joueur = await createPlayer();
      await joueur.caller.proposals.join({ proposalId: id });
    }

    const detail = await auteur.caller.proposals.get({ proposalId: id });
    // Ni réservation, ni échéance : la réservation n'existe que pour attendre
    // de l'argent.
    expect(detail.status).toBe("session");
    expect(detail.paymentDeadline).toBeNull();
  });

  it("MODE-003 — on peut partir d'une séance confirmée, qui rouvre", async () => {
    const auteur = await createPlayer();
    const id = await ouvrir(auteur, 7);

    const joueurs: TestPlayer[] = [];
    for (let index = 0; index < 13; index++) {
      const joueur = await createPlayer();
      joueurs.push(joueur);
      await joueur.caller.proposals.join({ proposalId: id });
    }

    const apres = await joueurs[0]!.caller.proposals.leave({ proposalId: id });

    // Rien n'était engagé : retenir quelqu'un sur un match gratuit n'aurait
    // aucun sens, et la séance redevient ce qu'elle est — incomplète.
    expect(apres.status).toBe("proposal");
    expect(apres.participantCount).toBe(13);
  });

  it("MODE-003 — changer de camp reste possible, dans la limite du plafond", async () => {
    const auteur = await createPlayer();
    const second = await createPlayer();
    const id = await ouvrir(auteur, 7);

    await second.caller.proposals.join({ proposalId: id, side: "B" });
    await second.caller.proposals.chooseSide({ proposalId: id, side: "A" });

    expect(await sideOf(id, second.identity.playerId)).toBe("A");
  });

  it("MODE-003 — un mode sans camps refuse qu'on en choisisse un", async () => {
    const auteur = await createPlayer();
    const { proposal } = await auteur.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 19,
      venueId: "city-five",
      modeId: "friendly",
    });

    await expect(
      auteur.caller.proposals.chooseSide({
        proposalId: proposal.id,
        side: "A",
      }),
    ).rejects.toThrow(/composées à la clôture/i);
  });

  it("MODE-003 — quelques heures suffisent, là où deux jours sont exigés ailleurs", async () => {
    const auteur = await createPlayer();

    // Demain : refusé pour un amical, accepté pour un grand foot.
    await expect(
      auteur.caller.proposals.create({
        date: daysFromNow(1),
        slotStartHour: 19,
        venueId: "city-five",
        modeId: "friendly",
      }),
    ).rejects.toThrow(/2 jours à l'avance/i);

    const id = await ouvrir(auteur, 7, { date: daysFromNow(1) });
    expect(id).toBeGreaterThan(0);
  });

  it("MODE-003 — l'administration n'échappe pas aux règles du format", async () => {
    // `skipLeadTime` contourne le délai, pas le reste : un effectif hors
    // bornes reste hors bornes.
    const admin = await promoteToAdmin(await createPlayer());

    await expect(
      admin.caller.admin.createProposal({
        date: daysFromNow(1),
        slotStartHour: 18,
        venueId: "londerzeel",
        modeId: "bigfoot",
        playersPerTeam: 3,
      }),
    ).rejects.toThrow(/entre 7 et 11/i);
  });
});
