import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/client.js";
import {
  auditLogs,
  notificationDeliveries,
  payments,
  proposalParticipants,
  proposals,
} from "../src/db/schema.js";
import {
  balanceOf,
  // Les joueurs de ce fichier ont de quoi payer : voir `createFundedPlayer`.
  createFundedPlayer as createPlayer,
  daysFromNow,
  grantUno,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Composition d'une session par l'administration (ADMIN-008).
 *
 * Ce que ces tests protègent tient en une phrase : **l'administration agit au
 * nom d'un joueur, elle ne se substitue pas aux règles**. Inscrire d'ici doit
 * échouer exactement là où l'inscription ordinaire échoue — division, compte
 * arbitre, plateau complet — et prélever la caisse pour de bon lorsqu'on
 * demande le règlement.
 *
 * La seule dérogation est le préavis de deux jours, et elle est testée comme
 * telle.
 */

/** Force la division d'un joueur, pour composer des cas de ligue. */
async function setDivision(playerId: number, division: string): Promise<void> {
  await db.execute(
    sql`UPDATE players SET division = ${division} WHERE id = ${playerId}`,
  );
}

async function openFriendly(admin: TestPlayer, date = daysFromNow(3)) {
  const created = await admin.caller.admin.createProposal({
    date,
    slotStartHour: 18,
    venueId: "arena",
    modeId: "friendly",
  });
  return created.proposal;
}

describe("composition d'une session par l'administration (ADMIN-008)", () => {
  beforeEach(resetDatabase);

  it("ADMIN-008 — l'administration ouvre une session pour aujourd'hui", async () => {
    const admin = await promoteToAdmin(await createPlayer());

    // Le joueur ordinaire reste tenu par le préavis de deux jours.
    await expect(
      admin.caller.proposals.create({
        date: daysFromNow(0),
        slotStartHour: 18,
        venueId: "arena",
        modeId: "friendly",
      }),
    ).rejects.toThrow(/à l'avance/);

    // L'administration, non : une séance jouée ce soir doit pouvoir entrer.
    const today = await openFriendly(admin, daysFromNow(0));
    expect(today.localDate).toBe(daysFromNow(0));
    expect(today.status).toBe("proposal");
    // CAL-003 tient toujours : le créateur est inscrit.
    expect(today.participantCount).toBe(1);
  });

  it("ADMIN-008 — inscrire d'abord, régler ensuite", async () => {
    /*
     * Les deux gestes sont séparés parce que le domaine l'impose : on ne paie
     * qu'une réservation, donc qu'un plateau déjà complet (CAL-009). Régler
     * avant est refusé, et le message le dit.
     */
    const admin = await promoteToAdmin(await createPlayer());
    const proposal = await openFriendly(admin);

    const joueur = await createPlayer();
    await admin.caller.admin.addParticipant({
      proposalId: proposal.id,
      playerId: joueur.identity.playerId,
    });

    const detail = await admin.caller.proposals.get({
      proposalId: proposal.id,
    });
    const ajoute = detail.participants.find(
      (row) => row.player.id === joueur.identity.playerId,
    );
    expect(ajoute).toBeDefined();
    expect(ajoute?.hasPaid).toBe(false);

    // Plateau incomplet : le règlement n'est pas encore ouvert.
    await expect(
      admin.caller.admin.settleProposal({ proposalId: proposal.id }),
    ).rejects.toThrow(/pas complet/i);
  });

  it("ADMIN-008 — les règles d'inscription tiennent toujours", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    await setDivision(admin.identity.playerId, "D3");

    const league = await admin.caller.admin.createProposal({
      date: daysFromNow(3),
      slotStartHour: 18,
      venueId: "arena",
      modeId: "league",
    });

    // CAL-002 : la session prend la division de son créateur, et n'accueille
    // qu'elle. L'administration n'y change rien.
    const autreDivision = await createPlayer();
    await setDivision(autreDivision.identity.playerId, "D1");
    await expect(
      admin.caller.admin.addParticipant({
        proposalId: league.proposal.id,
        playerId: autreDivision.identity.playerId,
      }),
    ).rejects.toThrow(/division/i);

    // ROLE-003 : un arbitre ne prend pas de place de joueur.
    const arbitre = await createPlayer({ accountType: "referee" });
    await expect(
      admin.caller.admin.addParticipant({
        proposalId: league.proposal.id,
        playerId: arbitre.identity.playerId,
      }),
    ).rejects.toThrow(/arbitre/i);

    // Et ni l'un ni l'autre n'est proposé à l'écran : la liste des éligibles
    // ne montre que ce qui passerait.
    const eligibles = await admin.caller.admin.eligiblePlayers({
      proposalId: league.proposal.id,
    });
    const ids = eligibles.map((row) => row.id);
    expect(ids).not.toContain(autreDivision.identity.playerId);
    expect(ids).not.toContain(arbitre.identity.playerId);
    // L'administrateur non plus : il est déjà inscrit comme créateur.
    expect(ids).not.toContain(admin.identity.playerId);
  });

  it("ADMIN-008 — compléter puis régler fait basculer la session", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const proposal = await openFriendly(admin);

    // Assez de joueurs solvables pour remplir le plateau.
    for (let i = 0; i < proposal.minParticipants; i++) {
      const joueur = await createPlayer();
      await grantUno(joueur.identity.playerId, 500);
    }

    const rempli = await admin.caller.admin.fillProposal({
      proposalId: proposal.id,
    });
    expect(rempli.added).toBe(proposal.minParticipants - 1);
    expect(rempli.failed).toEqual([]);

    // Le plateau complet ouvre le paiement, pas avant.
    let rows = await admin.caller.admin.manageableProposals();
    expect(rows.find((row) => row.id === proposal.id)?.status).toBe(
      "reservation",
    );

    const avant = await balanceOf(admin.identity.playerId);
    const regle = await admin.caller.admin.settleProposal({
      proposalId: proposal.id,
    });
    expect(regle.settled).toBe(proposal.minParticipants);
    expect(regle.failed).toEqual([]);

    // Régler prélève réellement : c'est un paiement, pas une case cochée.
    expect(await balanceOf(admin.identity.playerId)).toBe(
      avant - proposal.priceUno,
    );

    // Tout le monde a payé : la session est confirmée, prête pour la saisie.
    rows = await admin.caller.admin.manageableProposals();
    const composed = rows.find((row) => row.id === proposal.id);
    expect(composed?.status).toBe("session");
    expect(composed?.paidCount).toBe(proposal.minParticipants);
  });

  it("ADMIN-008 — une caisse vide n'arrête pas le règlement des autres", async () => {
    /*
     * Un jeu d'essai compte des comptes neufs et des comptes dépensés. Tout
     * annuler pour un solde insuffisant rendrait l'outil inutilisable la
     * moitié du temps : on règle ce qui peut l'être et on nomme le reste.
     */
    const admin = await promoteToAdmin(await createPlayer());
    const proposal = await openFriendly(admin);

    const fauche = await createPlayer();
    for (let i = 0; i < proposal.minParticipants; i++) {
      const joueur = await createPlayer();
      await grantUno(joueur.identity.playerId, 500);
    }
    await db.execute(
      sql`UPDATE players SET uno_points = 0 WHERE id = ${fauche.identity.playerId}`,
    );

    await admin.caller.admin.fillProposal({ proposalId: proposal.id });
    await admin.caller.admin
      .addParticipant({
        proposalId: proposal.id,
        playerId: fauche.identity.playerId,
      })
      .catch(() => undefined);

    const regle = await admin.caller.admin.settleProposal({
      proposalId: proposal.id,
    });

    // Des places ont été réglées, et l'échec éventuel est nommé plutôt que tu.
    expect(regle.settled).toBeGreaterThan(0);
    for (const echec of regle.failed) {
      expect(echec.reason.length).toBeGreaterThan(0);
    }
  });

  it("ADMIN-008 — l'audit nomme l'administrateur, pas le joueur inscrit", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const proposal = await openFriendly(admin);
    const joueur = await createPlayer();

    await admin.caller.admin.addParticipant({
      proposalId: proposal.id,
      playerId: joueur.identity.playerId,
    });

    const rows = await db
      .select()
      .from(auditLogs)
      .where(sql`action = 'proposal.participant.add'`);

    expect(rows).toHaveLength(1);
    // C'est l'administrateur qui a agi ; le joueur est le bénéficiaire.
    expect(rows[0]?.actorUserId).toBe(admin.identity.userId);
    expect(rows[0]?.actorUserId).not.toBe(joueur.identity.userId);
    expect(JSON.stringify(rows[0]?.afterJson)).toContain(
      String(joueur.identity.playerId),
    );
  });

  it("ADMIN-008 — un joueur ordinaire n'accède à aucune de ces routes", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const proposal = await openFriendly(admin);
    const intrus = await createPlayer();
    const cible = await createPlayer();

    await expect(intrus.caller.admin.manageableProposals()).rejects.toThrow(
      /droits nécessaires/i,
    );
    await expect(
      intrus.caller.admin.eligiblePlayers({ proposalId: proposal.id }),
    ).rejects.toThrow(/droits nécessaires/i);
    await expect(
      intrus.caller.admin.addParticipant({
        proposalId: proposal.id,
        playerId: cible.identity.playerId,
      }),
    ).rejects.toThrow(/droits nécessaires/i);
    await expect(
      intrus.caller.admin.fillProposal({ proposalId: proposal.id }),
    ).rejects.toThrow(/droits nécessaires/i);
    await expect(
      intrus.caller.admin.createProposal({
        date: daysFromNow(0),
        slotStartHour: 18,
        venueId: "arena",
        modeId: "friendly",
      }),
    ).rejects.toThrow(/droits nécessaires/i);
  });

  it("ADMIN-008 — retirer un joueur le sort de la session", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const proposal = await openFriendly(admin);
    const joueur = await createPlayer();

    await admin.caller.admin.addParticipant({
      proposalId: proposal.id,
      playerId: joueur.identity.playerId,
    });
    await admin.caller.admin.removeParticipant({
      proposalId: proposal.id,
      playerId: joueur.identity.playerId,
    });

    const detail = await admin.caller.proposals.get({
      proposalId: proposal.id,
    });
    expect(
      detail.participants.some(
        (row) => row.player.id === joueur.identity.playerId,
      ),
    ).toBe(false);

    // Et il redevient inscriptible : le retrait n'a rien laissé derrière lui.
    const eligibles = await admin.caller.admin.eligiblePlayers({
      proposalId: proposal.id,
    });
    expect(eligibles.map((row) => row.id)).toContain(joueur.identity.playerId);
  });

  // --- Places offertes par la ligue (ADMIN-013) ----------------------------

  /** Une réservation d'amical complète, dont chaque inscrit a de quoi payer. */
  async function fullFriendly(admin: TestPlayer) {
    const proposal = await openFriendly(admin);
    for (let i = 0; i < proposal.minParticipants; i++) {
      const joueur = await createPlayer();
      await grantUno(joueur.identity.playerId, 500);
    }
    await admin.caller.admin.fillProposal({ proposalId: proposal.id });
    const detail = await admin.caller.proposals.get({
      proposalId: proposal.id,
    });
    return { proposal, detail };
  }

  it("ADMIN-013 — offrir les places confirme la session sans toucher aux caisses", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const { proposal, detail } = await fullFriendly(admin);
    const inscrits = detail.participants.map((p) => p.player.id);

    const avant = new Map<number, number>();
    for (const id of inscrits) avant.set(id, await balanceOf(id));

    const offert = await admin.caller.admin.offerSeats({
      proposalId: proposal.id,
    });
    expect(offert).toEqual({ offered: proposal.minParticipants, failed: [] });

    // La ligue paie : aucune caisse n'a bougé.
    for (const id of inscrits) {
      expect(await balanceOf(id)).toBe(avant.get(id));
    }

    // La session est confirmée, comme après un vrai règlement.
    const rows = await admin.caller.admin.manageableProposals();
    const confirmed = rows.find((row) => row.id === proposal.id);
    expect(confirmed?.status).toBe("session");
    expect(confirmed?.paidCount).toBe(proposal.minParticipants);

    // Des paiements à zéro, « offered » : le parrainage ne compte que ce qui
    // a été réellement payé.
    const lignes = await db
      .select({ method: payments.method, uno: payments.amountUno })
      .from(payments)
      .where(sql`proposal_id = ${proposal.id}`);
    expect(lignes).toHaveLength(proposal.minParticipants);
    for (const ligne of lignes) {
      expect(ligne).toEqual({ method: "offered", uno: 0 });
    }

    // Chaque joueur sait que sa place est offerte.
    const prevenus = await db
      .select({ playerId: notificationDeliveries.playerId })
      .from(notificationDeliveries)
      .where(
        sql`event_key = ${`proposal:${proposal.id}:offered`} AND channel = 'inapp'`,
      );
    expect(prevenus.map((row) => row.playerId).sort((a, b) => a - b)).toEqual(
      [...inscrits].sort((a, b) => a - b),
    );

    const audit = await db
      .select()
      .from(auditLogs)
      .where(sql`action = 'proposal.seats.offer'`);
    expect(audit[0]?.actorUserId).toBe(admin.identity.userId);
  });

  it("ADMIN-013 — une place déjà réglée reste à son joueur", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const { proposal, detail } = await fullFriendly(admin);
    const payeur = detail.participants[0]?.player.id;
    expect(payeur).toBeDefined();

    // L'admin est inscrit lui aussi (il a ouvert la séance) : il paie la sienne.
    await admin.caller.proposals.pay({
      proposalId: proposal.id,
      method: "uno",
      idempotencyKey: "admin-paie-sa-place",
    });

    const offert = await admin.caller.admin.offerSeats({
      proposalId: proposal.id,
    });
    expect(offert.offered).toBe(proposal.minParticipants - 1);
  });

  it("ADMIN-013 — une place offerte ne se rembourse pas", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const { proposal, detail } = await fullFriendly(admin);
    const inscrits = detail.participants.map((p) => p.player.id);
    await admin.caller.admin.offerSeats({ proposalId: proposal.id });

    const avant = new Map<number, number>();
    for (const id of inscrits) avant.set(id, await balanceOf(id));

    // Supprimer la séance rembourse les places réglées… sauf celles qui
    // n'ont rien coûté : sinon chaque joueur repartirait avec le prix.
    const suppression = await admin.caller.admin.deleteProposal({
      proposalId: proposal.id,
      reason: "Séance d'essai",
    });
    expect(suppression.unoRefunded).toBe(0);
    for (const id of inscrits) {
      expect(await balanceOf(id)).toBe(avant.get(id));
    }
  });

  it("ADMIN-013 — seulement une réservation, et seulement par l'administration", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const proposal = await openFriendly(admin);

    await expect(
      admin.caller.admin.offerSeats({ proposalId: proposal.id }),
    ).rejects.toThrow(/pas complet/);

    const joueur = await createPlayer();
    await expect(
      joueur.caller.admin.offerSeats({ proposalId: proposal.id }),
    ).rejects.toThrow();
  });

  // --- Remplacer ou retirer un inscrit d'une séance complète (ADMIN-016) ---

  /** Une séance d'amical complète et entièrement réglée : confirmée. */
  async function confirmedFriendly(admin: TestPlayer) {
    const { proposal } = await fullFriendly(admin);
    await grantUno(admin.identity.playerId, 500);
    await admin.caller.admin.settleProposal({ proposalId: proposal.id });
    const detail = await admin.caller.proposals.get({
      proposalId: proposal.id,
    });
    const status = (await admin.caller.admin.manageableProposals()).find(
      (row) => row.id === proposal.id,
    )?.status;
    expect(status).toBe("session");
    // Le sortant n'est pas l'administrateur : il a ouvert la séance.
    const sortant = detail.participants.find(
      (row) => row.player.id !== admin.identity.playerId,
    )!.player.id;
    return { proposal, detail, sortant };
  }

  async function seatRow(proposalId: number, playerId: number) {
    const [row] = await db
      .select({
        side: proposalParticipants.side,
        hasPaid: proposalParticipants.hasPaid,
        replacedPlayerId: proposalParticipants.replacedPlayerId,
      })
      .from(proposalParticipants)
      .where(sql`proposal_id = ${proposalId} AND player_id = ${playerId}`);
    return row;
  }

  it("ADMIN-016 — remplacer un inscrit d'une séance confirmée garde la place réglée", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const { proposal, sortant } = await confirmedFriendly(admin);
    const avant = await seatRow(proposal.id, sortant);
    const caisseSortant = await balanceOf(sortant);

    const entrant = await createPlayer();
    const caisseEntrant = await balanceOf(entrant.identity.playerId);
    const result = await admin.caller.admin.replaceParticipant({
      proposalId: proposal.id,
      outPlayerId: sortant,
      inPlayerId: entrant.identity.playerId,
    });
    expect(result).toEqual({ refundedUno: 0, seatPaid: true });

    // La place a changé de titulaire, rien d'autre : même camp, réglée, et
    // la séance reste confirmée et complète.
    const apres = await seatRow(proposal.id, entrant.identity.playerId);
    expect(apres).toEqual({
      side: avant?.side ?? null,
      hasPaid: true,
      replacedPlayerId: sortant,
    });
    expect(await seatRow(proposal.id, sortant)).toBeUndefined();
    const row = (await admin.caller.admin.manageableProposals()).find(
      (candidate) => candidate.id === proposal.id,
    );
    expect(row?.status).toBe("session");
    expect(row?.participantCount).toBe(proposal.minParticipants);
    expect(row?.paidCount).toBe(proposal.minParticipants);

    // Aucun argent ne bouge : les joueurs s'arrangent entre eux.
    expect(await balanceOf(sortant)).toBe(caisseSortant);
    expect(await balanceOf(entrant.identity.playerId)).toBe(caisseEntrant);

    // Les deux sont prévenus, et seulement eux : les autres inscrits ne
    // reçoivent pas d'avis « séance incomplète ».
    const prevenus = await db
      .select({ playerId: notificationDeliveries.playerId })
      .from(notificationDeliveries)
      .where(
        sql`(event_key LIKE ${`proposal:${proposal.id}:replaced:%`} OR event_key LIKE ${`proposal:${proposal.id}:seat-taken:%`} OR event_key = ${`proposal:${proposal.id}:unconfirmed`}) AND channel = 'inapp'`,
      );
    expect(
      [...new Set(prevenus.map((r) => r.playerId))].sort((a, b) => a - b),
    ).toEqual([sortant, entrant.identity.playerId].sort((a, b) => a - b));

    const audit = await db
      .select()
      .from(auditLogs)
      .where(sql`action = 'proposal.participant.replace'`);
    expect(audit[0]?.actorUserId).toBe(admin.identity.userId);

    // Le sortant redevient inscriptible ailleurs comme ici.
    const eligibles = await admin.caller.admin.eligiblePlayers({
      proposalId: proposal.id,
    });
    expect(eligibles.map((r) => r.id)).toContain(sortant);
  });

  it("ADMIN-016 — remplacer en remboursant le sortant rouvre le paiement", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const { proposal, sortant } = await confirmedFriendly(admin);
    const caisseSortant = await balanceOf(sortant);

    const entrant = await createPlayer();
    const result = await admin.caller.admin.replaceParticipant({
      proposalId: proposal.id,
      outPlayerId: sortant,
      inPlayerId: entrant.identity.playerId,
      refund: true,
    });
    expect(result).toEqual({
      refundedUno: proposal.priceUno,
      seatPaid: false,
    });
    expect(await balanceOf(sortant)).toBe(caisseSortant + proposal.priceUno);
    expect(
      (await seatRow(proposal.id, entrant.identity.playerId))?.hasPaid,
    ).toBe(false);

    // La place est due : la séance repasse en réservation, toujours complète.
    const row = (await admin.caller.admin.manageableProposals()).find(
      (candidate) => candidate.id === proposal.id,
    );
    expect(row?.status).toBe("reservation");
    expect(row?.participantCount).toBe(proposal.minParticipants);

    // Et le remplaçant peut régler pour la reconfirmer.
    await entrant.caller.proposals.pay({
      proposalId: proposal.id,
      method: "uno",
      idempotencyKey: "remplacant-paie",
    });
    const confirmed = (await admin.caller.admin.manageableProposals()).find(
      (candidate) => candidate.id === proposal.id,
    );
    expect(confirmed?.status).toBe("session");
  });

  it("ADMIN-016 — retirer un inscrit d'une séance confirmée le rembourse", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const { proposal, sortant } = await confirmedFriendly(admin);
    const caisse = await balanceOf(sortant);

    const result = await admin.caller.admin.removeParticipant({
      proposalId: proposal.id,
      playerId: sortant,
    });
    expect(result.refundedUno).toBe(proposal.priceUno);
    expect(await balanceOf(sortant)).toBe(caisse + proposal.priceUno);
    expect(await seatRow(proposal.id, sortant)).toBeUndefined();

    // Il manque un joueur : la séance rouvre, et l'on peut en inscrire un.
    const row = (await admin.caller.admin.manageableProposals()).find(
      (candidate) => candidate.id === proposal.id,
    );
    expect(row?.status).toBe("proposal");
    expect(row?.participantCount).toBe(proposal.minParticipants - 1);

    const nouveau = await createPlayer();
    await admin.caller.admin.addParticipant({
      proposalId: proposal.id,
      playerId: nouveau.identity.playerId,
    });
  });

  it("ADMIN-016 — retirer sans rembourser, pour un forfait", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const { proposal, sortant } = await confirmedFriendly(admin);
    const caisse = await balanceOf(sortant);

    const result = await admin.caller.admin.removeParticipant({
      proposalId: proposal.id,
      playerId: sortant,
      refund: false,
    });
    expect(result.refundedUno).toBe(0);
    expect(await balanceOf(sortant)).toBe(caisse);
  });

  it("ADMIN-016 — les règles d'éligibilité tiennent au remplacement", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const { proposal, detail, sortant } = await confirmedFriendly(admin);

    // Déjà inscrit : on ne prend pas deux places.
    const autreInscrit = detail.participants.find(
      (row) =>
        row.player.id !== sortant && row.player.id !== admin.identity.playerId,
    )!.player.id;
    await expect(
      admin.caller.admin.replaceParticipant({
        proposalId: proposal.id,
        outPlayerId: sortant,
        inPlayerId: autreInscrit,
      }),
    ).rejects.toThrow(/déjà inscrit/);

    // ROLE-003 : un arbitre ne prend pas de place de joueur.
    const arbitre = await createPlayer({ accountType: "referee" });
    await expect(
      admin.caller.admin.replaceParticipant({
        proposalId: proposal.id,
        outPlayerId: sortant,
        inPlayerId: arbitre.identity.playerId,
      }),
    ).rejects.toThrow(/arbitre/i);

    // Seule l'administration remplace.
    const joueur = await createPlayer();
    await expect(
      joueur.caller.admin.replaceParticipant({
        proposalId: proposal.id,
        outPlayerId: sortant,
        inPlayerId: joueur.identity.playerId,
      }),
    ).rejects.toThrow();

    // Rien n'a bougé.
    expect((await seatRow(proposal.id, sortant))?.hasPaid).toBe(true);
  });

  it("ADMIN-016 — une séance gratuite reste confirmée après un remplacement", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const proposal = await openFriendly(admin);
    // Une séance ouverte gratuite : complète, elle est confirmée sans
    // paiement (MODE-003), et ses places ne sont jamais « réglées ».
    await db
      .update(proposals)
      .set({ priceEur: 0, priceUno: 0 })
      .where(sql`id = ${proposal.id}`);
    for (let i = 0; i < proposal.minParticipants; i++) await createPlayer();
    await admin.caller.admin.fillProposal({ proposalId: proposal.id });
    const statusOf = async () =>
      (await admin.caller.admin.manageableProposals()).find(
        (row) => row.id === proposal.id,
      )?.status;
    expect(await statusOf()).toBe("session");

    const detail = await admin.caller.proposals.get({
      proposalId: proposal.id,
    });
    const sortant = detail.participants.find(
      (row) => row.player.id !== admin.identity.playerId,
    )!.player.id;
    const entrant = await createPlayer();
    await admin.caller.admin.replaceParticipant({
      proposalId: proposal.id,
      outPlayerId: sortant,
      inPlayerId: entrant.identity.playerId,
      refund: true,
    });

    // Ni réservation ni paiement à attendre : rien n'est dû.
    expect(await statusOf()).toBe("session");
  });
});
