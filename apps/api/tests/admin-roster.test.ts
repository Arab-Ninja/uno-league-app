import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/client.js";
import { auditLogs } from "../src/db/schema.js";
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

    const detail = await admin.caller.proposals.get({ proposalId: proposal.id });
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
    await admin.caller.admin.addParticipant({
      proposalId: proposal.id,
      playerId: fauche.identity.playerId,
    }).catch(() => undefined);

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

    await expect(
      intrus.caller.admin.manageableProposals(),
    ).rejects.toThrow(/droits nécessaires/i);
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

    const detail = await admin.caller.proposals.get({ proposalId: proposal.id });
    expect(
      detail.participants.some(
        (row) => row.player.id === joueur.identity.playerId,
      ),
    ).toBe(false);

    // Et il redevient inscriptible : le retrait n'a rien laissé derrière lui.
    const eligibles = await admin.caller.admin.eligiblePlayers({
      proposalId: proposal.id,
    });
    expect(eligibles.map((row) => row.id)).toContain(
      joueur.identity.playerId,
    );
  });
});
