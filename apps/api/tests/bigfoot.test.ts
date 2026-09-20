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
    /*
     * La UNO League, et non plus l'amical : depuis MODE-004, l'amical laisse
     * lui aussi choisir son camp. Le mode où le camp ne se choisit pas est
     * désormais celui où les équipes se tirent au sort — et c'est ce tirage
     * qui donne sa valeur au classement.
     */
    const auteur = await createPlayer();
    const { proposal } = await auteur.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 18,
      venueId: "city-five",
      modeId: "league",
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

describe("déplacer une séance gratuite (MODE-003)", () => {
  beforeEach(resetDatabase);

  it("MODE-003 — l'administration change la date et l'heure", async () => {
    const auteur = await createPlayer();
    const admin = await promoteToAdmin(await createPlayer());
    const id = await ouvrir(auteur, 7, {
      date: daysFromNow(3),
      slotStartHour: 18,
    });

    const apres = await admin.caller.admin.rescheduleProposal({
      proposalId: id,
      date: daysFromNow(5),
      slotStartHour: 20,
    });

    expect(apres.localDate).toBe(daysFromNow(5));
    expect(apres.localTimeLabel).toContain("20:00");
  });

  it("MODE-003 — une séance payante ne se déplace pas ici", async () => {
    /*
     * La limite est assumée : déplacer une séance payée pose des questions
     * d'argent — l'échéance qui court, ceux qui ont réglé et ne peuvent plus
     * venir — auxquelles cette route ne répond pas. Étendre par commodité
     * serait le meilleur moyen de perdre de l'argent en silence.
     */
    const auteur = await createPlayer();
    const admin = await promoteToAdmin(await createPlayer());
    const { proposal } = await auteur.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 19,
      venueId: "city-five",
      modeId: "friendly",
    });

    await expect(
      admin.caller.admin.rescheduleProposal({
        proposalId: proposal.id,
        date: daysFromNow(4),
        slotStartHour: 20,
      }),
    ).rejects.toThrow(/sans participation/i);
  });

  it("MODE-003 — le terrain ne se dédouble pas sur un même créneau", async () => {
    const premier = await createPlayer();
    const second = await createPlayer();
    const admin = await promoteToAdmin(await createPlayer());

    const a = await ouvrir(premier, 7, {
      date: daysFromNow(3),
      slotStartHour: 18,
    });
    void a;
    const b = await ouvrir(second, 7, {
      date: daysFromNow(4),
      slotStartHour: 18,
    });

    // Déplacer la seconde sur le créneau de la première : le terrain est pris.
    await expect(
      admin.caller.admin.rescheduleProposal({
        proposalId: b,
        date: daysFromNow(3),
        slotStartHour: 18,
      }),
    ).rejects.toThrow(/occupe déjà ce terrain/i);
  });

  it("MODE-003 — un joueur ordinaire ne déplace rien", async () => {
    const auteur = await createPlayer();
    const id = await ouvrir(auteur, 7);

    await expect(
      auteur.caller.admin.rescheduleProposal({
        proposalId: id,
        date: daysFromNow(5),
        slotStartHour: 20,
      }),
    ).rejects.toThrow();
  });
});

/**
 * Le terrain d'une séance de Grand Foot (MODE-003).
 *
 * Le camp disait avec qui l'on joue, pas ce qu'on y fait. Ces tests portent
 * sur la place — et surtout sur ce qu'elle ne permet pas : prendre celle d'un
 * autre, en occuper une qui n'existe pas dans ce format, ou en garder une en
 * passant dans l'équipe d'en face.
 */
describe("se placer sur le terrain (MODE-003)", () => {
  beforeEach(resetDatabase);

  async function slotOf(proposalId: number, playerId: number) {
    const rows = await db
      .select({
        playerId: proposalParticipants.playerId,
        pitchSlot: proposalParticipants.pitchSlot,
      })
      .from(proposalParticipants)
      .where(eq(proposalParticipants.proposalId, proposalId));
    return rows.find((row) => row.playerId === playerId)?.pitchSlot ?? null;
  }

  it("MODE-003 — un joueur prend une place et la quitte", async () => {
    const auteur = await createPlayer();
    const id = await ouvrir(auteur, 7);

    await auteur.caller.proposals.choosePitchSlot({
      proposalId: id,
      slot: "GB",
    });
    expect(await slotOf(id, auteur.identity.playerId)).toBe("GB");

    // Libérer sa place ne fait pas quitter la séance : on joue sans poste
    // assigné, et se déplacer suppose de pouvoir d'abord se retirer.
    await auteur.caller.proposals.choosePitchSlot({
      proposalId: id,
      slot: null,
    });
    expect(await slotOf(id, auteur.identity.playerId)).toBeNull();

    const detail = await auteur.caller.proposals.get({ proposalId: id });
    expect(detail.viewer?.isParticipant).toBe(true);
  });

  it("MODE-003 — une place déjà prise dans son camp est refusée", async () => {
    const auteur = await createPlayer();
    const autre = await createPlayer();
    const id = await ouvrir(auteur, 7);

    await auteur.caller.proposals.choosePitchSlot({
      proposalId: id,
      slot: "GB",
    });
    await autre.caller.proposals.join({ proposalId: id, side: "A" });

    await expect(
      autre.caller.proposals.choosePitchSlot({ proposalId: id, slot: "GB" }),
    ).rejects.toThrow(/déjà prise/i);
  });

  it("MODE-003 — la même place reste libre dans l'autre camp", async () => {
    const auteur = await createPlayer();
    const adverse = await createPlayer();
    const id = await ouvrir(auteur, 7);

    await auteur.caller.proposals.choosePitchSlot({
      proposalId: id,
      slot: "GB",
    });
    await adverse.caller.proposals.join({ proposalId: id, side: "B" });
    await adverse.caller.proposals.choosePitchSlot({
      proposalId: id,
      slot: "GB",
    });

    expect(await slotOf(id, adverse.identity.playerId)).toBe("GB");
  });

  it("MODE-003 — une place absente de la formation est refusée", async () => {
    const auteur = await createPlayer();
    const id = await ouvrir(auteur, 7);

    // Une formation à sept n'a que trois défenseurs : le quatrième
    // n'appartient qu'aux plateaux plus larges.
    await expect(
      auteur.caller.proposals.choosePitchSlot({ proposalId: id, slot: "DEF4" }),
    ).rejects.toThrow(/formation à 7/i);

    const large = await ouvrir(auteur, 9, { slotStartHour: 20 });
    await auteur.caller.proposals.choosePitchSlot({
      proposalId: large,
      slot: "DEF4",
    });
    expect(await slotOf(large, auteur.identity.playerId)).toBe("DEF4");
  });

  it("MODE-003 — changer de camp libère sa place", async () => {
    const auteur = await createPlayer();
    const id = await ouvrir(auteur, 7);

    await auteur.caller.proposals.choosePitchSlot({
      proposalId: id,
      slot: "GB",
    });
    await auteur.caller.proposals.chooseSide({ proposalId: id, side: "B" });

    // Sans cela, on aurait deux gardiens d'un côté et aucun de l'autre.
    expect(await slotOf(id, auteur.identity.playerId)).toBeNull();
  });

  it("MODE-003 — un non-inscrit ne se place pas", async () => {
    const auteur = await createPlayer();
    const curieux = await createPlayer();
    const id = await ouvrir(auteur, 7);

    await expect(
      curieux.caller.proposals.choosePitchSlot({ proposalId: id, slot: "GB" }),
    ).rejects.toThrow();
  });

  it("MODE-005 — en UNO League, la place attend qu'on ait choisi son équipe", async () => {
    /*
     * En UNO League, la place appartient à l'équipe — et les trois équipes
     * existent désormais dès la proposition (MODE-005). Ce qui manque n'est
     * donc plus le terrain, c'est le choix : le refus dit lequel, plutôt que
     * de laisser chercher.
     */
    const auteur = await createPlayer();
    const { proposal } = await auteur.caller.proposals.create({
      date: daysFromNow(5),
      slotStartHour: 18,
      venueId: "arena",
      modeId: "league",
    });

    await expect(
      auteur.caller.proposals.choosePitchSlot({
        proposalId: proposal.id,
        slot: "GB",
      }),
    ).rejects.toThrow(/choisissez d'abord votre équipe/i);

    // Et l'équipe choisie, la même place est acceptée.
    await auteur.caller.proposals.choosePitchSlot({
      proposalId: proposal.id,
      slot: "GB",
      teamIndex: 0,
    });
  });

  it("MODE-003 — la place figure sur la fiche de la séance", async () => {
    const auteur = await createPlayer();
    const id = await ouvrir(auteur, 8);

    await auteur.caller.proposals.choosePitchSlot({
      proposalId: id,
      slot: "MIL2",
    });

    const detail = await auteur.caller.proposals.get({ proposalId: id });
    const moi = detail.participants.find(
      (row) => row.player.id === auteur.identity.playerId,
    );
    expect(moi?.pitchSlot).toBe("MIL2");
    expect(moi?.side).toBe("A");
  });
});
