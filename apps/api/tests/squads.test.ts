import { beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../src/db/client.js";
import {
  balanceOf,
  createPlayer,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Clubs du mode SQUAD : fondation, adhésion, rôles (SQUAD-001, SQUAD-002).
 *
 * L'enjeu de ces tests n'est pas qu'un bouton fonctionne, mais qu'aucune
 * séquence d'actions ne laisse un club dans un état impossible : deux
 * affiliations pour un joueur, un club sans fondateur, un capitaine qui
 * destitue le propriétaire.
 */

/** Fonde un club et rend son identifiant. */
async function found(player: TestPlayer, name: string): Promise<number> {
  const squad = await player.caller.squads.create({ name });
  return squad.id;
}

/** Fait entrer `player` dans `squadId`, décision prise par `decider`. */
async function join(
  player: TestPlayer,
  decider: TestPlayer,
  squadId: number,
): Promise<void> {
  await player.caller.squads.requestToJoin({ squadId });
  const detail = await decider.caller.squads.detail({ squadId });
  const request = detail.pendingRequests.find(
    (row) => row.player.id === player.identity.playerId,
  )!;
  await decider.caller.squads.decideRequest({
    requestId: request.id,
    accept: true,
  });
}

describe("clubs SQUAD (SQUAD-002)", () => {
  beforeEach(resetDatabase);

  it("AC01 — fonder un club fait de son créateur le fondateur", async () => {
    const player = await createPlayer();
    const squad = await player.caller.squads.create({
      name: "Les Loups de Forest",
      description: "Le club du mardi soir.",
    });

    expect(squad.name).toBe("Les Loups de Forest");
    expect(squad.slug).toBe("les-loups-de-forest");
    expect(squad.memberCount).toBe(1);
    expect(squad.viewer.role).toBe("founder");
    // Sans match joué, le taux de victoire n'est pas nul : il n'existe pas.
    expect(squad.winRate).toBeNull();

    const mine = await player.caller.squads.mine();
    expect(mine.squad?.id).toBe(squad.id);
    expect(mine.squad?.members).toHaveLength(1);
    // La trésorerie n'apparaît qu'aux membres — il en est un.
    expect(mine.squad?.treasury).toEqual({ available: 0, locked: 0, total: 0 });
  });

  it("AC02 — un joueur n'appartient qu'à un seul club", async () => {
    const founder = await createPlayer();
    const other = await createPlayer();
    const player = await createPlayer();

    const first = await found(founder, "Les Loups");
    const second = await found(other, "Les Aigles");

    await join(player, founder, first);

    // Ni en fondant…
    await expect(
      player.caller.squads.create({ name: "Les Renards" }),
    ).rejects.toThrow(/appartenez déjà/i);

    // …ni en demandant ailleurs.
    await expect(
      player.caller.squads.requestToJoin({ squadId: second }),
    ).rejects.toThrow(/appartenez déjà/i);
  });

  it("SQUAD-002 — accepter une demande annule les autres du même joueur", async () => {
    const a = await createPlayer();
    const b = await createPlayer();
    const player = await createPlayer();

    const first = await found(a, "Les Loups");
    const second = await found(b, "Les Aigles");

    await player.caller.squads.requestToJoin({ squadId: first });
    await player.caller.squads.requestToJoin({ squadId: second });
    expect((await player.caller.squads.mine()).pendingRequests).toHaveLength(2);

    const detail = await a.caller.squads.detail({ squadId: first });
    await a.caller.squads.decideRequest({
      requestId: detail.pendingRequests[0]!.id,
      accept: true,
    });

    // La seconde demande n'a plus d'objet : la laisser en attente exposerait
    // l'autre fondateur à accepter quelqu'un qui n'est plus libre.
    const after = await player.caller.squads.mine();
    expect(after.squad?.id).toBe(first);
    expect(after.pendingRequests).toHaveLength(0);

    const otherSide = await b.caller.squads.detail({ squadId: second });
    expect(otherSide.pendingRequests).toHaveLength(0);
  });

  it("SQUAD-002 — le rôle décide de ce qu'on peut faire", async () => {
    const founder = await createPlayer();
    const captain = await createPlayer();
    const member = await createPlayer();
    const squadId = await found(founder, "Les Loups");

    await join(captain, founder, squadId);
    await join(member, founder, squadId);

    await founder.caller.squads.setMemberRole({
      squadId,
      playerId: captain.identity.playerId,
      role: "captain",
    });

    // Un capitaine tranche les demandes…
    const outsider = await createPlayer();
    await outsider.caller.squads.requestToJoin({ squadId });
    const pending = (await captain.caller.squads.detail({ squadId })).pendingRequests;
    await expect(
      captain.caller.squads.decideRequest({
        requestId: pending[0]!.id,
        accept: false,
      }),
    ).resolves.toBeUndefined();

    // …mais ne renomme pas le club, ni ne nomme d'autres capitaines.
    await expect(
      captain.caller.squads.update({ squadId, name: "Les Renards" }),
    ).rejects.toThrow(/fondateur/i);
    await expect(
      captain.caller.squads.setMemberRole({
        squadId,
        playerId: member.identity.playerId,
        role: "captain",
      }),
    ).rejects.toThrow(/fondateur/i);

    // Un membre ordinaire ne tranche rien du tout.
    await expect(
      member.caller.squads.removeMember({
        squadId,
        playerId: captain.identity.playerId,
      }),
    ).rejects.toThrow(/capitaines/i);
  });

  it("SQUAD-002 — le fondateur est intouchable, et ne part pas sans transmettre", async () => {
    const founder = await createPlayer();
    const captain = await createPlayer();
    const squadId = await found(founder, "Les Loups");
    await join(captain, founder, squadId);
    await founder.caller.squads.setMemberRole({
      squadId,
      playerId: captain.identity.playerId,
      role: "captain",
    });

    // Un capitaine n'exclut pas le fondateur.
    await expect(
      captain.caller.squads.removeMember({
        squadId,
        playerId: founder.identity.playerId,
      }),
    ).rejects.toThrow(/fondateur/i);

    // Et le fondateur ne s'en va pas en laissant un club sans propriétaire :
    // plus personne ne pourrait l'administrer.
    await expect(founder.caller.squads.leave()).rejects.toThrow(/Transmettez/i);

    await founder.caller.squads.transferOwnership({
      squadId,
      toPlayerId: captain.identity.playerId,
    });

    const after = await captain.caller.squads.detail({ squadId });
    expect(after.viewer.role).toBe("founder");
    expect(
      after.members.find((row) => row.player.id === founder.identity.playerId)?.role,
    ).toBe("member");

    // La transmission faite, le départ est possible.
    await expect(founder.caller.squads.leave()).resolves.toBeUndefined();
  });

  it("AC15 — quitter un club libère la place sans effacer le passage", async () => {
    const a = await createPlayer();
    const b = await createPlayer();
    const player = await createPlayer();
    const first = await found(a, "Les Loups");
    const second = await found(b, "Les Aigles");

    await join(player, a, first);
    await player.caller.squads.leave();
    expect((await player.caller.squads.mine()).squad).toBeNull();

    await join(player, b, second);
    expect((await player.caller.squads.mine()).squad?.id).toBe(second);

    // Les deux passages restent inscrits : compositions et transferts
    // passés s'y adossent.
    const rows = await db.execute<{ total: number }>(
      sql`SELECT COUNT(*) AS total FROM squad_members
          WHERE player_id = ${player.identity.playerId}`,
    );
    expect(Number((rows[0] as unknown as { total: number }[])[0]!.total)).toBe(2);
  });

  it("SQUAD-002 — le dernier membre parti, le club est dissous et non effacé", async () => {
    const founder = await createPlayer();
    const squadId = await found(founder, "Les Loups");

    await founder.caller.squads.leave();

    const rows = await db.execute<{ status: string }>(
      sql`SELECT status FROM squads WHERE id = ${squadId}`,
    );
    expect((rows[0] as unknown as { status: string }[])[0]!.status).toBe("dissolved");

    // La ligne survit — c'est ce qui porte les statistiques — mais plus rien
    // n'y mène : un club fantôme qu'on ne peut ni rejoindre ni défier n'a
    // rien à faire dans l'annuaire ni dans une adresse partagée.
    const outsider = await createPlayer();
    await expect(
      outsider.caller.squads.requestToJoin({ squadId }),
    ).rejects.toThrow(/introuvable|ne recrute plus/i);
    await expect(outsider.caller.squads.get({ squadId })).rejects.toThrow(
      /introuvable/i,
    );
  });

  it("SQUAD-001 — deux clubs ne portent pas le même nom", async () => {
    const a = await createPlayer();
    const b = await createPlayer();
    await found(a, "Les Loups");

    // Les espaces superflus ne font pas un nom différent.
    await expect(
      b.caller.squads.create({ name: "  Les   Loups  " }),
    ).rejects.toThrow(/déjà pris/i);
  });

  it("SQUAD-001 — la trésorerie ne se montre pas aux visiteurs", async () => {
    const founder = await createPlayer();
    const outsider = await createPlayer();
    const squadId = await found(founder, "Les Loups");

    const seen = await outsider.caller.squads.detail({ squadId });
    // Une équipe adverse n'a pas à jauger les moyens de celle qu'elle défie.
    expect(seen.treasury).toBeNull();
    expect(seen.pendingRequests).toHaveLength(0);
    // L'effectif, lui, est public : c'est ce qu'on vient regarder.
    expect(seen.members).toHaveLength(1);
  });
});

describe("fermeture du mode par le drapeau (SQUAD-001)", () => {
  beforeEach(resetDatabase);

  it("SQUAD-001 — drapeau baissé, les routes n'existent pas", async () => {
    const player = await createPlayer();

    // Le drapeau ne masque pas seulement l'onglet : une fonctionnalité
    // simplement cachée reste appelable par qui regarde le réseau, et
    // celle-ci déplace des UNO.
    //
    // Les modules sont rechargés parce qu'`env.ts` fige la configuration à
    // son premier import : changer la variable ne suffirait pas.
    process.env["FEATURE_SQUAD"] = "false";
    vi.resetModules();

    try {
      const { appRouter } = await import("../src/trpc/routers/index.js");
      const caller = appRouter.createCaller({
        identity: player.identity,
        setCookie: () => {},
        clearCookie: () => {},
        req: undefined,
      } as unknown as Parameters<typeof appRouter.createCaller>[0]);

      await expect(caller.squads.mine()).rejects.toThrow(/pas disponible/i);
      await expect(
        caller.squads.create({ name: "Les Clandestins" }),
      ).rejects.toThrow(/pas disponible/i);
    } finally {
      process.env["FEATURE_SQUAD"] = "true";
      vi.resetModules();
    }
  });
});

describe("trésorerie d'un SQUAD (SQUAD-003)", () => {
  beforeEach(resetDatabase);

  it("AC03 — un membre verse des UNO, qui quittent son portefeuille", async () => {
    const founder = await createPlayer();
    const squadId = await found(founder, "Les Loups");
    const avant = await balanceOf(founder.identity.playerId);

    const after = await founder.caller.squads.contribute({ squadId, amount: 500 });

    expect(after.available).toBe(500);
    // Les deux écritures vont ensemble : un débit sans crédit ferait
    // disparaître des UNO, et l'inverse en créerait.
    expect(await balanceOf(founder.identity.playerId)).toBe(avant - 500);

    const registre = await founder.caller.squads.treasury({ squadId });
    expect(registre).toHaveLength(1);
    expect(registre[0]?.amount).toBe(500);
    expect(registre[0]?.balanceAfter).toBe(500);
  });

  it("SQUAD-003 — on ne verse pas plus qu'on n'a", async () => {
    const founder = await createPlayer();
    const squadId = await found(founder, "Les Loups");
    const solde = await balanceOf(founder.identity.playerId);

    await expect(
      founder.caller.squads.contribute({ squadId, amount: solde + 1 }),
    ).rejects.toThrow();

    // Le refus ne laisse aucune trace : ni caisse entamée, ni portefeuille.
    expect(await balanceOf(founder.identity.playerId)).toBe(solde);
    const detail = await founder.caller.squads.detail({ squadId });
    expect(detail.treasury?.available).toBe(0);
  });

  it("SQUAD-003 — la caisse et son registre sont réservés aux membres", async () => {
    const founder = await createPlayer();
    const outsider = await createPlayer();
    const squadId = await found(founder, "Les Loups");
    await founder.caller.squads.contribute({ squadId, amount: 100 });

    await expect(
      outsider.caller.squads.contribute({ squadId, amount: 50 }),
    ).rejects.toThrow(/pas membre/i);
    await expect(
      outsider.caller.squads.treasury({ squadId }),
    ).rejects.toThrow(/réservé/i);
  });
});

describe("club dissous (SQUAD-002)", () => {
  beforeEach(resetDatabase);

  it("SQUAD-002 — un club dissous disparaît de l'annuaire et des adresses", async () => {
    const founder = await createPlayer();
    const visitor = await createPlayer();
    const squadId = await found(founder, "Les Éphémères");

    expect(
      (await visitor.caller.squads.list({ limit: 30 })).map((row) => row.id),
    ).toContain(squadId);

    await founder.caller.squads.leave();

    // Plus rien n'y mène : ni l'annuaire, ni l'adresse directe. Un club
    // fantôme qu'on ne peut ni rejoindre ni défier n'a rien à y faire.
    expect(
      (await visitor.caller.squads.list({ limit: 30 })).map((row) => row.id),
    ).not.toContain(squadId);
    await expect(
      visitor.caller.squads.get({ slug: "les-ephemeres" }),
    ).rejects.toThrow(/introuvable/i);
    await expect(
      visitor.caller.squads.detail({ squadId }),
    ).rejects.toThrow(/introuvable/i);
  });

  it("SQUAD-002 — dissoudre libère le nom, sans effacer l'histoire", async () => {
    const first = await createPlayer();
    const second = await createPlayer();

    const squadId = await found(first, "Les Loups");
    await first.caller.squads.leave();

    // Le nom se réutilise : le garder réservé à jamais par un club que plus
    // personne ne voit serait absurde.
    const recreated = await second.caller.squads.create({ name: "Les Loups" });
    expect(recreated.id).not.toBe(squadId);

    // Et l'ancien club existe toujours en base, pour les statistiques.
    const rows = await db.execute<{ total: number }>(
      sql`SELECT COUNT(*) AS total FROM squads WHERE name = 'Les Loups'`,
    );
    expect(Number((rows[0] as unknown as { total: number }[])[0]!.total)).toBe(2);
  });
});
