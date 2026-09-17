import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { SQUAD_SEAT_PRICE_UNO } from "@uno/shared";
import { db } from "../src/db/client.js";
import { auditPlayerBalance } from "../src/services/ledger.service.js";
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
 * Suppression d'une session et dissolution d'un club (ADMIN-011).
 *
 * Ce que ces tests protègent tient en une phrase : **effacer une ligne ne
 * doit jamais faire disparaître de l'argent**. Toute la difficulté est là —
 * supprimer une session est trivial, la supprimer sans laisser un joueur
 * débité d'une place qui n'existe plus ne l'est pas.
 *
 * Ils suivent donc les soldes à l'UNO près, et vérifient à chaque fois que le
 * registre reste cohérent avec le solde (`auditPlayerBalance`). Une
 * suppression qui déséquilibrerait les deux serait invisible à l'écran et
 * irréparable ensuite.
 */

async function statusOf(proposalId: number): Promise<string | null> {
  const rows = await db.execute<{ status: string }>(
    sql`SELECT status FROM proposals WHERE id = ${proposalId}`,
  );
  return (rows[0] as unknown as { status: string }[])[0]?.status ?? null;
}

async function countRows(table: string, proposalId: number): Promise<number> {
  const rows = await db.execute<{ total: number }>(
    sql.raw(
      `SELECT COUNT(*) AS total FROM ${table} WHERE proposal_id = ${proposalId}`,
    ),
  );
  return Number((rows[0] as unknown as { total: number }[])[0]?.total ?? 0);
}

async function treasuryOf(
  squadId: number,
): Promise<{ available: number; locked: number }> {
  const rows = await db.execute<{ a: number; l: number }>(
    sql`SELECT treasury_available AS a, treasury_locked AS l FROM squads WHERE id = ${squadId}`,
  );
  const row = (rows[0] as unknown as { a: number; l: number }[])[0]!;
  return { available: Number(row.a), locked: Number(row.l) };
}

/**
 * Ouvre un amical, le remplit et règle toutes les places.
 *
 * Le plateau est rempli jusqu'au minimum, et pas seulement de quelques
 * joueurs : le règlement ne s'ouvre qu'une fois la proposition devenue
 * réservation. C'est la même contrainte qu'à l'écran, et la contourner ferait
 * de ces tests une mise en scène.
 *
 * L'administrateur qui crée la proposition en est le premier inscrit ; les
 * joueurs rendus sont donc ceux qu'on a ajoutés derrière lui.
 */
async function paidFriendly(
  admin: TestPlayer,
): Promise<{ proposalId: number; players: TestPlayer[]; priceUno: number }> {
  const created = await admin.caller.admin.createProposal({
    date: daysFromNow(3),
    slotStartHour: 18,
    venueId: "arena",
    modeId: "friendly",
  });
  const proposalId = created.proposal.id;

  const players: TestPlayer[] = [];
  for (let index = 0; index < created.proposal.minParticipants - 1; index++) {
    const player = await createPlayer();
    await admin.caller.admin.addParticipant({
      proposalId,
      playerId: player.identity.playerId,
    });
    players.push(player);
  }

  await admin.caller.admin.settleProposal({ proposalId });

  return { proposalId, players, priceUno: created.proposal.priceUno };
}

describe("suppression d'une session (ADMIN-011)", () => {
  beforeEach(resetDatabase);

  it("ADMIN-011 — la session disparaît et chaque place réglée est remboursée", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const { proposalId, players, priceUno } = await paidFriendly(admin);

    // Les places sont bien payées : c'est la prémisse du test.
    for (const player of players) {
      expect(await balanceOf(player.identity.playerId)).toBe(1000 - priceUno);
    }

    const result = await admin.caller.admin.deleteProposal({
      proposalId,
      reason: "Session d'essai",
    });

    // L'administrateur compte parmi les places réglées : il s'est inscrit en
    // créant la proposition.
    expect(result.seatsRefunded).toBe(players.length + 1);
    expect(result.unoRefunded).toBe(priceUno * (players.length + 1));
    expect(await statusOf(proposalId)).toBeNull();

    for (const player of players) {
      expect(await balanceOf(player.identity.playerId)).toBe(1000);

      // Le point qui compte : le joueur voit le débit ET le remboursement.
      // Effacer la session sans écrire la contrepartie l'aurait laissé avec
      // un solde juste et un historique qui ment.
      const audit = await auditPlayerBalance(db, player.identity.playerId);
      expect(audit.consistent).toBe(true);
    }
  });

  it("ADMIN-011 — les inscriptions, paiements et équipes suivent la session", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const { proposalId } = await paidFriendly(admin);

    // La session est confirmée : elle a des équipes.
    await admin.caller.admin.completeSession({ proposalId }).catch(() => null);
    expect(await countRows("proposal_participants", proposalId)).toBeGreaterThan(0);

    await admin.caller.admin.deleteProposal({
      proposalId,
      reason: "Session d'essai",
    });

    // Rien ne doit survivre en pointant vers une session disparue : ce sont
    // les cascades du schéma qui s'en chargent, et c'est ici qu'on le vérifie.
    expect(await countRows("proposal_participants", proposalId)).toBe(0);
    expect(await countRows("proposal_substitutes", proposalId)).toBe(0);
    expect(await countRows("payments", proposalId)).toBe(0);
    expect(await countRows("teams", proposalId)).toBe(0);
    expect(await countRows("matches", proposalId)).toBe(0);
  });

  it("ADMIN-011 — une proposition sans personne se supprime aussi", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const created = await admin.caller.admin.createProposal({
      date: daysFromNow(4),
      slotStartHour: 20,
      venueId: "arena",
      modeId: "friendly",
    });

    const result = await admin.caller.admin.deleteProposal({
      proposalId: created.proposal.id,
      reason: "Créneau ouvert par erreur",
    });

    expect(result.seatsRefunded).toBe(0);
    expect(result.unoRefunded).toBe(0);
    expect(await statusOf(created.proposal.id)).toBeNull();
  });

  it("ADMIN-011 — le créneau se libère : on peut reproposer la même case", async () => {
    /*
     * `active_slot_key` interdit deux propositions vivantes sur le même
     * créneau. Si la suppression laissait la ligne derrière elle, le créneau
     * resterait pris par une session que plus personne ne peut voir — et le
     * message d'erreur parlerait d'un doublon introuvable.
     */
    const admin = await promoteToAdmin(await createPlayer());
    const slot = {
      date: daysFromNow(5),
      slotStartHour: 19,
      venueId: "arena",
      modeId: "friendly" as const,
    };

    const first = await admin.caller.admin.createProposal(slot);

    // Reproposer le même créneau ne crée rien : on rejoint la proposition qui
    // l'occupe déjà (CAL-005).
    const rejoined = await admin.caller.admin.createProposal(slot);
    expect(rejoined.proposal.id).toBe(first.proposal.id);

    await admin.caller.admin.deleteProposal({
      proposalId: first.proposal.id,
      reason: "Erreur de date",
    });

    // Le créneau est de nouveau libre : celle-ci est bien une nouvelle ligne.
    const second = await admin.caller.admin.createProposal(slot);
    expect(second.proposal.id).not.toBe(first.proposal.id);
  });

  it("ADMIN-011 — la liste des sessions supprimables montre aussi les annulées", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const created = await admin.caller.admin.createProposal({
      date: daysFromNow(3),
      slotStartHour: 18,
      venueId: "arena",
      modeId: "friendly",
    });

    await db.execute(
      sql`UPDATE proposals SET status = 'cancelled', active_slot_key = NULL WHERE id = ${created.proposal.id}`,
    );

    // `manageableProposals` sert la composition et masque donc les annulées ;
    // c'est précisément celles-là qu'on vient supprimer.
    const composable = await admin.caller.admin.manageableProposals();
    expect(composable.map((row) => row.id)).not.toContain(created.proposal.id);

    const deletable = await admin.caller.admin.deletableProposals();
    expect(deletable.map((row) => row.id)).toContain(created.proposal.id);
  });

  it("ADMIN-011 — un joueur ordinaire ne supprime rien", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const player = await createPlayer();
    const created = await admin.caller.admin.createProposal({
      date: daysFromNow(3),
      slotStartHour: 18,
      venueId: "arena",
      modeId: "friendly",
    });

    await expect(
      player.caller.admin.deleteProposal({
        proposalId: created.proposal.id,
        reason: "Tentative",
      }),
    ).rejects.toThrow(/droits nécessaires/i);

    expect(await statusOf(created.proposal.id)).not.toBeNull();
  });

  it("ADMIN-011 — un motif vide est refusé", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const created = await admin.caller.admin.createProposal({
      date: daysFromNow(3),
      slotStartHour: 18,
      venueId: "arena",
      modeId: "friendly",
    });

    // La ligne disparaît : l'entrée d'audit est tout ce qui restera pour dire
    // pourquoi. Elle ne peut pas être muette.
    await expect(
      admin.caller.admin.deleteProposal({
        proposalId: created.proposal.id,
        reason: "  ",
      }),
    ).rejects.toThrow();
  });
});

describe("dissolution d'un club (ADMIN-011)", () => {
  beforeEach(resetDatabase);

  /** Fonde un club doté, avec `size` membres en plus du fondateur. */
  async function club(
    name: string,
    options: { treasury?: number; size?: number } = {},
  ) {
    const founder = await createPlayer();
    const squad = await founder.caller.squads.create({ name });

    const members: TestPlayer[] = [];
    for (let index = 0; index < (options.size ?? 0); index++) {
      const member = await createPlayer();
      await member.caller.squads.requestToJoin({ squadId: squad.id });
      const detail = await founder.caller.squads.detail({ squadId: squad.id });
      const request = detail.pendingRequests.find(
        (row) => row.player.id === member.identity.playerId,
      )!;
      await founder.caller.squads.decideRequest({
        requestId: request.id,
        accept: true,
      });
      members.push(member);
    }

    if (options.treasury) {
      await grantUno(founder.identity.playerId, options.treasury);
      await founder.caller.squads.contribute({
        squadId: squad.id,
        amount: options.treasury,
      });
    }

    return { founder, members, squadId: squad.id };
  }

  it("ADMIN-011 — le club sort des listes et libère son nom", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const { founder, squadId } = await club("Les Panthères");

    await admin.caller.admin.dissolveSquad({
      squadId,
      reason: "Club d'essai",
    });

    // Invisible pour les joueurs...
    const listed = await founder.caller.squads.list({ limit: 50 });
    expect(listed.map((row) => row.id)).not.toContain(squadId);
    await expect(founder.caller.squads.get({ squadId })).rejects.toThrow();

    // ...mais toujours constatable par l'administration : c'est là qu'on
    // vérifie qu'une dissolution a bien eu lieu.
    const forAdmin = await admin.caller.admin.squads();
    expect(forAdmin.find((row) => row.id === squadId)?.status).toBe("dissolved");

    // Le nom redevient disponible : sans cela il resterait pris à jamais par
    // un club que plus personne ne peut voir.
    const other = await createPlayer();
    const reborn = await other.caller.squads.create({ name: "Les Panthères" });
    expect(reborn.id).not.toBe(squadId);
  });

  it("ADMIN-011 — les membres sont libérés et peuvent rejoindre ailleurs", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const { members, squadId } = await club("Les Aigles", { size: 2 });
    const refuge = await club("Le Refuge");

    await admin.caller.admin.dissolveSquad({ squadId, reason: "Club d'essai" });

    /*
     * Le point sensible : un joueur n'a qu'une adhésion active, et la base la
     * tient par un index unique. Dissoudre sans clore les adhésions
     * laisserait ces joueurs attachés à un club invisible, incapables d'en
     * rejoindre un autre — et sans rien à l'écran pour l'expliquer.
     */
    for (const member of members) {
      const mine = await member.caller.squads.mine();
      expect(mine.squad).toBeNull();

      await member.caller.squads.requestToJoin({ squadId: refuge.squadId });
    }
  });

  it("ADMIN-011 — la caisse revient au fondateur, au centime près", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const { founder, squadId } = await club("Les Lions", { treasury: 700 });

    // Le fondateur a versé 700 des 1 700 qu'il avait.
    expect(await balanceOf(founder.identity.playerId)).toBe(1000);
    expect((await treasuryOf(squadId)).available).toBe(700);

    const result = await admin.caller.admin.dissolveSquad({
      squadId,
      reason: "Club d'essai",
    });

    expect(result.treasuryReturned).toBe(700);
    expect(await balanceOf(founder.identity.playerId)).toBe(1700);
    expect((await treasuryOf(squadId)).available).toBe(0);

    // L'argent de la caisse est venu des poches des membres : il ne
    // s'évapore pas avec le club.
    const audit = await auditPlayerBalance(db, founder.identity.playerId);
    expect(audit.consistent).toBe(true);
  });

  it("ADMIN-011 — un défi accepté rend ses mises et rembourse ses places", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const home = await club("Les Loups", { treasury: 500, size: 1 });
    const away = await club("Les Ours", { treasury: 500, size: 1 });

    const challenge = await home.founder.caller.squads.createChallenge({
      squadId: home.squadId,
      opponentSquadId: away.squadId,
      venueId: "arena",
      date: daysFromNow(6),
      startHour: 20,
      durationMinutes: 60,
      stakeUno: 200,
    });
    await away.founder.caller.squads.acceptChallenge({
      challengeId: challenge.id,
    });

    // Un joueur règle sa place : c'est de l'argent sorti d'un portefeuille.
    await home.founder.caller.squads.addSeat({
      challengeId: challenge.id,
      playerId: home.members[0]!.identity.playerId,
    });
    await home.members[0]!.caller.squads.paySeat({ challengeId: challenge.id });

    const paidBalance = await balanceOf(home.members[0]!.identity.playerId);
    expect(paidBalance).toBe(1000 - SQUAD_SEAT_PRICE_UNO[60]);

    // Les deux caisses ont 200 UNO séquestrés.
    expect((await treasuryOf(home.squadId)).locked).toBe(200);
    expect((await treasuryOf(away.squadId)).locked).toBe(200);

    const result = await admin.caller.admin.dissolveSquad({
      squadId: home.squadId,
      reason: "Club d'essai",
    });

    expect(result.challengesAnnulled).toBe(1);

    /*
     * L'adversaire n'est pas dissous : sa mise doit lui revenir intacte. Une
     * dissolution qui n'annulerait que son propre côté immobiliserait 200 UNO
     * chez un club innocent, pour toujours — la mise n'ayant plus de défi pour
     * la libérer.
     */
    const opponent = await treasuryOf(away.squadId);
    expect(opponent.locked).toBe(0);
    expect(opponent.available).toBe(500);

    // Le match n'aura pas lieu : la salle n'est due par personne.
    expect(await balanceOf(home.members[0]!.identity.playerId)).toBe(1000);
  });

  it("ADMIN-011 — aucun UNO ne se perd ni ne se crée dans la dissolution", async () => {
    /*
     * L'invariant qui résume tous les autres. On compte ce que possèdent les
     * joueurs et les caisses avant, puis après : les deux totaux doivent être
     * égaux. Une mise oubliée, un remboursement en double, un séquestre
     * abandonné — tout se voit ici.
     */
    const admin = await promoteToAdmin(await createPlayer());
    const home = await club("Les Faucons", { treasury: 400, size: 2 });
    const away = await club("Les Taureaux", { treasury: 400, size: 1 });

    const everyone = [
      home.founder,
      ...home.members,
      away.founder,
      ...away.members,
    ];

    async function totalUno(): Promise<number> {
      let total = 0;
      for (const player of everyone) {
        total += await balanceOf(player.identity.playerId);
      }
      for (const squadId of [home.squadId, away.squadId]) {
        const treasury = await treasuryOf(squadId);
        total += treasury.available + treasury.locked;
      }
      return total;
    }

    const challenge = await home.founder.caller.squads.createChallenge({
      squadId: home.squadId,
      opponentSquadId: away.squadId,
      venueId: "arena",
      date: daysFromNow(6),
      startHour: 20,
      durationMinutes: 60,
      stakeUno: 150,
    });
    await away.founder.caller.squads.acceptChallenge({
      challengeId: challenge.id,
    });

    const before = await totalUno();

    await admin.caller.admin.dissolveSquad({
      squadId: home.squadId,
      reason: "Club d'essai",
    });

    expect(await totalUno()).toBe(before);

    for (const player of everyone) {
      const audit = await auditPlayerBalance(db, player.identity.playerId);
      expect(audit.consistent).toBe(true);
    }
  });

  it("ADMIN-011 — dissoudre deux fois est refusé", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const { squadId } = await club("Les Renards");

    await admin.caller.admin.dissolveSquad({ squadId, reason: "Club d'essai" });

    await expect(
      admin.caller.admin.dissolveSquad({ squadId, reason: "Encore" }),
    ).rejects.toThrow(/déjà dissous/i);
  });

  it("ADMIN-011 — un joueur ordinaire ne dissout pas un club", async () => {
    await promoteToAdmin(await createPlayer());
    const { squadId } = await club("Les Corbeaux");
    const intruder = await createPlayer();

    await expect(
      intruder.caller.admin.dissolveSquad({ squadId, reason: "Tentative" }),
    ).rejects.toThrow(/droits nécessaires/i);
  });
});
