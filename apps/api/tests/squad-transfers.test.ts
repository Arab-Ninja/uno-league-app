import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { SQUAD_LIMITS } from "@uno/shared";
import { db } from "../src/db/client.js";
import { expireStaleTransfers } from "../src/services/squad-transfers.service.js";
import {
  balanceOf,
  createPlayer,
  daysFromNow,
  grantUno,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Marché des transferts (SQUAD-008).
 *
 * **Un transfert se conclut à trois**, et c'est ce que ces tests surveillent
 * avant tout : qu'aucune séquence ne permette de passer outre l'un des trois,
 * ni de déplacer un joueur sans que l'argent suive, ni l'inverse.
 */

interface Camp {
  founder: TestPlayer;
  member: TestPlayer;
  squadId: number;
}

async function camp(name: string, treasury: number): Promise<Camp> {
  const founder = await createPlayer();
  const squad = await founder.caller.squads.create({ name });

  const member = await createPlayer();
  await member.caller.squads.requestToJoin({ squadId: squad.id });
  const detail = await founder.caller.squads.detail({ squadId: squad.id });
  await founder.caller.squads.decideRequest({
    requestId: detail.pendingRequests[0]!.id,
    accept: true,
  });

  if (treasury > 0) {
    await grantUno(founder.identity.playerId, treasury);
    await founder.caller.squads.contribute({ squadId: squad.id, amount: treasury });
  }

  return { founder, member, squadId: squad.id };
}

async function treasuryOf(squadId: number) {
  const rows = await db.execute<{ a: number; l: number }>(
    sql`SELECT treasury_available AS a, treasury_locked AS l FROM squads WHERE id = ${squadId}`,
  );
  const row = (rows[0] as unknown as { a: number; l: number }[])[0]!;
  return { available: Number(row.a), locked: Number(row.l) };
}

/** Le club du joueur, lu en base. */
async function squadOf(playerId: number): Promise<number | null> {
  const rows = await db.execute<{ squad_id: number }>(
    sql`SELECT squad_id FROM squad_members
        WHERE player_id = ${playerId} AND status = 'active' LIMIT 1`,
  );
  const row = (rows[0] as unknown as { squad_id: number }[])[0];
  return row ? Number(row.squad_id) : null;
}

/** Dossier ouvert par `to` pour le membre de `from`. */
async function offer(
  from: Camp,
  to: Camp,
  fee: number,
  bonus: number,
): Promise<number> {
  const view = await to.founder.caller.squads.openTransfer({
    squadId: to.squadId,
    playerId: from.member.identity.playerId,
    feeUno: fee,
    signingBonusUno: bonus,
  });
  return view.id;
}

describe("liste des transferts (SQUAD-008)", () => {
  beforeEach(resetDatabase);

  it("SQUAD-008 — un club affiche un membre cessible, les autres le voient", async () => {
    const a = await camp("Les Loups", 0);
    const b = await camp("Les Aigles", 0);

    expect(await b.founder.caller.squads.market({ limit: 30 })).toHaveLength(0);

    await a.founder.caller.squads.listPlayer({
      playerId: a.member.identity.playerId,
      listed: true,
    });

    const marche = await b.founder.caller.squads.market({ limit: 30 });
    expect(marche).toHaveLength(1);
    expect(marche[0]!.player?.id).toBe(a.member.identity.playerId);
    expect(marche[0]!.squadName).toBe("Les Loups");

    // Son propre club n'est pas un marché : on ne s'achète pas soi-même.
    expect(await a.founder.caller.squads.market({ limit: 30 })).toHaveLength(0);
  });

  it("SQUAD-008 — afficher un joueur est un acte de fondateur", async () => {
    const a = await camp("Les Loups", 0);
    await expect(
      a.member.caller.squads.listPlayer({
        playerId: a.member.identity.playerId,
        listed: true,
      }),
    ).rejects.toThrow();
  });
});

describe("négociation d'un transfert (SQUAD-008)", () => {
  beforeEach(resetDatabase);

  it("AC09 — les trois parties concluent, et l'argent suit", async () => {
    const a = await camp("Les Loups", 2000);
    const b = await camp("Les Aigles", 3000);
    const joueur = a.member;

    const id = await offer(a, b, 800, 200);

    // Rien n'est engagé tant que le vendeur n'a pas accepté : une simple
    // offre ne doit pas geler la caisse d'un rival.
    expect(await treasuryOf(b.squadId)).toEqual({ available: 3000, locked: 0 });

    await a.founder.caller.squads.respondSelling({ transferId: id, accept: true });

    // Le vendeur a cédé : les deux montants sont séquestrés d'un coup.
    expect(await treasuryOf(b.squadId)).toEqual({ available: 2000, locked: 1000 });
    expect(await squadOf(joueur.identity.playerId)).toBe(a.squadId);

    const soldeAvant = await balanceOf(joueur.identity.playerId);
    await joueur.caller.squads.respondTransfer({ transferId: id, accept: true });

    // L'indemnité au vendeur, la prime au joueur, et le changement de club.
    expect(await treasuryOf(b.squadId)).toEqual({ available: 2000, locked: 0 });
    expect(await treasuryOf(a.squadId)).toEqual({ available: 2800, locked: 0 });
    expect(await balanceOf(joueur.identity.playerId)).toBe(soldeAvant + 200);
    expect(await squadOf(joueur.identity.playerId)).toBe(b.squadId);
  });

  it("SQUAD-008 — le joueur refuse : tout revient à l'acheteur", async () => {
    const a = await camp("Les Loups", 0);
    const b = await camp("Les Aigles", 3000);
    const joueur = a.member;
    const id = await offer(a, b, 800, 200);

    await a.founder.caller.squads.respondSelling({ transferId: id, accept: true });
    const solde = await balanceOf(joueur.identity.playerId);
    await joueur.caller.squads.respondTransfer({ transferId: id, accept: false });

    expect(await treasuryOf(b.squadId)).toEqual({ available: 3000, locked: 0 });
    expect(await treasuryOf(a.squadId)).toEqual({ available: 0, locked: 0 });
    expect(await balanceOf(joueur.identity.playerId)).toBe(solde);
    expect(await squadOf(joueur.identity.playerId)).toBe(a.squadId);
  });

  it("SQUAD-008 — le club vendeur refuse : rien n'a bougé", async () => {
    const a = await camp("Les Loups", 0);
    const b = await camp("Les Aigles", 3000);
    const id = await offer(a, b, 800, 200);

    await a.founder.caller.squads.respondSelling({ transferId: id, accept: false });

    expect(await treasuryOf(b.squadId)).toEqual({ available: 3000, locked: 0 });
    expect(await squadOf(a.member.identity.playerId)).toBe(a.squadId);
    const vue = await b.founder.caller.squads.transfer({ transferId: id });
    expect(vue.status).toBe("rejected");
  });

  it("SQUAD-008 — l'indemnité ne peut que monter, et le marchandage a une fin", async () => {
    const a = await camp("Les Loups", 0);
    const b = await camp("Les Aigles", 9000);
    const id = await offer(a, b, 500, 0);

    await expect(
      a.founder.caller.squads.counterTransfer({ transferId: id, feeUno: 400 }),
    ).rejects.toThrow(/au moins 501/i);

    for (let round = 0; round < SQUAD_LIMITS.negotiationRounds; round++) {
      await a.founder.caller.squads.counterTransfer({
        transferId: id,
        feeUno: 600 + round * 100,
      });
    }

    await expect(
      a.founder.caller.squads.counterTransfer({ transferId: id, feeUno: 2000 }),
    ).rejects.toThrow(/assez duré/i);
  });

  it("SQUAD-008 — le joueur seul tranche la dernière étape", async () => {
    const a = await camp("Les Loups", 0);
    const b = await camp("Les Aigles", 3000);
    const id = await offer(a, b, 500, 0);
    await a.founder.caller.squads.respondSelling({ transferId: id, accept: true });

    // Ni le club acheteur ni le club vendeur ne peuvent signer à sa place.
    for (const intrus of [b.founder, a.founder, b.member]) {
      await expect(
        intrus.caller.squads.respondTransfer({ transferId: id, accept: true }),
      ).rejects.toThrow(/joueur concerné/i);
    }

    expect(await squadOf(a.member.identity.playerId)).toBe(a.squadId);
  });

  it("SQUAD-008 — une caisse insuffisante ne permet pas d'offrir", async () => {
    const a = await camp("Les Loups", 0);
    const b = await camp("Les Aigles", 300);

    await expect(
      b.founder.caller.squads.openTransfer({
        squadId: b.squadId,
        playerId: a.member.identity.playerId,
        feeUno: 500,
        signingBonusUno: 100,
      }),
    ).rejects.toThrow(/ne couvre pas/i);
  });

  it("SQUAD-008 — engager la caisse est un pouvoir de fondateur", async () => {
    const a = await camp("Les Loups", 0);
    const b = await camp("Les Aigles", 3000);
    await b.founder.caller.squads.setMemberRole({
      squadId: b.squadId,
      playerId: b.member.identity.playerId,
      role: "captain",
    });

    await expect(
      b.member.caller.squads.openTransfer({
        squadId: b.squadId,
        playerId: a.member.identity.playerId,
        feeUno: 100,
        signingBonusUno: 0,
      }),
    ).rejects.toThrow();
  });

  it("SQUAD-008 — un fondateur ne se transfère pas", async () => {
    const a = await camp("Les Loups", 0);
    const b = await camp("Les Aigles", 3000);

    await expect(
      b.founder.caller.squads.openTransfer({
        squadId: b.squadId,
        playerId: a.founder.identity.playerId,
        feeUno: 100,
        signingBonusUno: 0,
      }),
    ).rejects.toThrow(/transmettre/i);
  });
});

describe("garde-fous du marché (SQUAD-008)", () => {
  beforeEach(resetDatabase);

  it("SQUAD-008 — un seul séquestre à la fois pour un même joueur", async () => {
    const a = await camp("Les Loups", 0);
    const b = await camp("Les Aigles", 3000);
    const c = await camp("Les Ours", 3000);

    const premier = await offer(a, b, 500, 0);
    const second = await offer(a, c, 700, 0);

    // Deux offres concurrentes sont permises : c'est un marché.
    await a.founder.caller.squads.respondSelling({
      transferId: premier,
      accept: true,
    });

    // Mais deux séquestres pour le même joueur, non : l'index unique le
    // refuse, quoi qu'ait vérifié le code applicatif.
    await expect(
      a.founder.caller.squads.respondSelling({ transferId: second, accept: true }),
    ).rejects.toThrow(/autre offre/i);

    expect(await treasuryOf(c.squadId)).toEqual({ available: 3000, locked: 0 });
  });

  it("SQUAD-008 — un joueur tout juste transféré observe une carence", async () => {
    const a = await camp("Les Loups", 0);
    const b = await camp("Les Aigles", 3000);
    const c = await camp("Les Ours", 3000);
    const joueur = a.member;

    const id = await offer(a, b, 500, 0);
    await a.founder.caller.squads.respondSelling({ transferId: id, accept: true });
    await joueur.caller.squads.respondTransfer({ transferId: id, accept: true });

    // Sans carence, un joueur ferait le tour des clubs en une soirée et
    // chaque vendeur encaisserait au passage.
    await expect(
      c.founder.caller.squads.openTransfer({
        squadId: c.squadId,
        playerId: joueur.identity.playerId,
        feeUno: 500,
        signingBonusUno: 0,
      }),
    ).rejects.toThrow(/carence/i);
  });

  it("SQUAD-008 — un joueur inscrit sur un défi à venir n'est pas transférable", async () => {
    const a = await camp("Les Loups", 2000);
    const b = await camp("Les Aigles", 3000);

    const defi = await a.founder.caller.squads.createChallenge({
      squadId: a.squadId,
      opponentSquadId: b.squadId,
      venueId: "arena",
      date: daysFromNow(5),
      startHour: 20,
      durationMinutes: 60,
      stakeUno: 0,
    });
    await b.founder.caller.squads.acceptChallenge({ challengeId: defi.id });
    await a.founder.caller.squads.addSeat({
      challengeId: defi.id,
      playerId: a.member.identity.playerId,
    });

    await expect(
      b.founder.caller.squads.openTransfer({
        squadId: b.squadId,
        playerId: a.member.identity.playerId,
        feeUno: 100,
        signingBonusUno: 0,
      }),
    ).rejects.toThrow(/feuille d'un défi/i);

    // Retiré de la composition, il redevient transférable.
    await a.founder.caller.squads.removeSeat({
      challengeId: defi.id,
      playerId: a.member.identity.playerId,
    });
    const id = await offer(a, b, 100, 0);
    expect(id).toBeGreaterThan(0);
  });

  it("SQUAD-008 — une offre expirée rend ce qu'elle avait engagé", async () => {
    const a = await camp("Les Loups", 0);
    const b = await camp("Les Aigles", 3000);
    const id = await offer(a, b, 800, 200);
    await a.founder.caller.squads.respondSelling({ transferId: id, accept: true });

    expect(await treasuryOf(b.squadId)).toEqual({ available: 2000, locked: 1000 });

    // On fait passer l'échéance : une offre oubliée ne doit pas immobiliser
    // une caisse indéfiniment.
    await db.execute(
      sql`UPDATE squad_transfers SET expires_at = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = ${id}`,
    );
    expect(await expireStaleTransfers()).toBe(1);

    expect(await treasuryOf(b.squadId)).toEqual({ available: 3000, locked: 0 });
    expect(await squadOf(a.member.identity.playerId)).toBe(a.squadId);
    const vue = await b.founder.caller.squads.transfer({ transferId: id });
    expect(vue.status).toBe("expired");
  });

  it("SQUAD-008 — l'acheteur retire son offre tant que le joueur ne l'a pas", async () => {
    const a = await camp("Les Loups", 0);
    const b = await camp("Les Aigles", 3000);
    const id = await offer(a, b, 500, 0);

    await b.founder.caller.squads.cancelTransfer({ transferId: id });
    expect(
      (await b.founder.caller.squads.transfer({ transferId: id })).status,
    ).toBe("cancelled");

    // Une fois entre les mains du joueur, le retrait unilatéral reviendrait à
    // faire miroiter une prime puis à la reprendre au moment de signer.
    const second = await offer(a, b, 500, 0);
    await a.founder.caller.squads.respondSelling({ transferId: second, accept: true });
    await expect(
      b.founder.caller.squads.cancelTransfer({ transferId: second }),
    ).rejects.toThrow(/mains du joueur/i);
  });
});
