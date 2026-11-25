import { beforeEach, describe, expect, it } from "vitest";
import { createPlayer, resetDatabase, type TestPlayer } from "./helpers.js";

/**
 * Inviter des joueurs dans son club (CLUB-004).
 *
 * Ce que ces tests protègent : le club invite, l'invité entre d'un geste —
 * par la notification ou par le lien partagé — et la règle d'une seule
 * affiliation tient toujours. Seuls le fondateur et les capitaines invitent,
 * et un lien renouvelé cesse d'ouvrir le club.
 */

async function found(player: TestPlayer, name: string): Promise<number> {
  return (await player.caller.squads.create({ name })).id;
}

describe("invitations de club (CLUB-004)", () => {
  beforeEach(resetDatabase);

  it("CLUB-004 — un joueur invité accepte et entre dans le club", async () => {
    const founder = await createPlayer({ firstName: "Fondateur" });
    const friend = await createPlayer({ firstName: "Karimou" });
    const squadId = await found(founder, "Les Invités du Mardi");

    // Une demande en cours ailleurs : elle tombera à l'entrée.
    const other = await createPlayer();
    const otherSquad = await found(other, "Un Autre Club");
    await friend.caller.squads.requestToJoin({ squadId: otherSquad });

    const candidates = await founder.caller.squads.inviteCandidates({
      squadId,
      query: "Karimou",
    });
    expect(
      candidates.find((row) => row.player.id === friend.identity.playerId)
        ?.state,
    ).toBe("invitable");

    const sent = await founder.caller.squads.invite({
      squadId,
      playerIds: [friend.identity.playerId],
    });
    expect(sent).toEqual({ invited: 1, skipped: 0 });
    // Une seconde invitation au même joueur ne part pas.
    expect(
      await founder.caller.squads.invite({
        squadId,
        playerIds: [friend.identity.playerId],
      }),
    ).toEqual({ invited: 0, skipped: 1 });

    const pending = await founder.caller.squads.sentInvitations({ squadId });
    expect(pending.map((row) => row.player.id)).toEqual([
      friend.identity.playerId,
    ]);

    // L'invité la voit dans l'onglet Club, et sur la page du club.
    const mine = await friend.caller.squads.mine();
    expect(mine.invitations.map((row) => row.squad.id)).toEqual([squadId]);
    expect(mine.invitations[0]?.inviterName).toBe(
      (await founder.caller.players.me()).displayName,
    );
    const page = await friend.caller.squads.detail({ squadId });
    expect(page.viewer.invitationId).toBe(mine.invitations[0]!.id);

    await friend.caller.squads.respondInvitation({
      invitationId: mine.invitations[0]!.id,
      accept: true,
    });

    const after = await friend.caller.squads.mine();
    expect(after.squad?.id).toBe(squadId);
    expect(after.invitations).toEqual([]);
    expect(after.pendingRequests).toEqual([]);
    expect(await founder.caller.squads.sentInvitations({ squadId })).toEqual(
      [],
    );
  });

  it("CLUB-004 — refuser laisse le joueur libre ; un simple membre n'invite pas", async () => {
    const founder = await createPlayer();
    const member = await createPlayer();
    const friend = await createPlayer();
    const squadId = await found(founder, "Les Refusés");

    // Le membre entre par le lien, puis tente d'inviter.
    const { token } = await founder.caller.squads.inviteLink({ squadId });
    await member.caller.squads.joinWithLink({ token });
    await expect(
      member.caller.squads.invite({
        squadId,
        playerIds: [friend.identity.playerId],
      }),
    ).rejects.toThrow();
    await expect(
      member.caller.squads.inviteLink({ squadId }),
    ).rejects.toThrow();

    await founder.caller.squads.invite({
      squadId,
      playerIds: [friend.identity.playerId],
    });
    const [invitation] = (await friend.caller.squads.mine()).invitations;
    await friend.caller.squads.respondInvitation({
      invitationId: invitation!.id,
      accept: false,
    });
    expect((await friend.caller.squads.mine()).squad).toBeNull();
    // Une réponse ne se donne qu'une fois.
    await expect(
      friend.caller.squads.respondInvitation({
        invitationId: invitation!.id,
        accept: true,
      }),
    ).rejects.toThrow();
  });

  it("CLUB-004 — un joueur déjà dans un club n'est pas invité", async () => {
    const founder = await createPlayer();
    const taken = await createPlayer({ firstName: "Joueurpris" });
    const squadId = await found(founder, "Le Club Qui Invite");
    await found(taken, "Le Club Du Pris");

    const candidates = await founder.caller.squads.inviteCandidates({
      squadId,
      query: "Joueurpris",
    });
    expect(candidates[0]?.state).toBe("otherClub");
    expect(
      await founder.caller.squads.invite({
        squadId,
        playerIds: [taken.identity.playerId],
      }),
    ).toEqual({ invited: 0, skipped: 1 });
  });

  it("CLUB-004 — le lien fait entrer ; renouvelé, l'ancien ne sert plus", async () => {
    const founder = await createPlayer();
    const first = await createPlayer();
    const second = await createPlayer();
    const squadId = await found(founder, "Le Club Du Lien");

    const link = await founder.caller.squads.inviteLink({ squadId });
    // Le même lien tant qu'on ne le renouvelle pas.
    expect((await founder.caller.squads.inviteLink({ squadId })).token).toBe(
      link.token,
    );

    const joined = await first.caller.squads.joinWithLink({
      token: link.token,
    });
    expect(joined.id).toBe(squadId);
    expect((await first.caller.squads.mine()).squad?.id).toBe(squadId);
    // Déjà membre : le lien ne fait pas entrer deux fois.
    await expect(
      first.caller.squads.joinWithLink({ token: link.token }),
    ).rejects.toThrow();

    const renewed = await founder.caller.squads.inviteLink({
      squadId,
      renew: true,
    });
    expect(renewed.token).not.toBe(link.token);
    await expect(
      second.caller.squads.joinWithLink({ token: link.token }),
    ).rejects.toThrow();
    await second.caller.squads.joinWithLink({ token: renewed.token });
    expect((await second.caller.squads.mine()).squad?.id).toBe(squadId);
  });

  it("CLUB-004 — une invitation retirée ne peut plus être acceptée", async () => {
    const founder = await createPlayer();
    const friend = await createPlayer();
    const squadId = await found(founder, "Le Club Indécis");

    await founder.caller.squads.invite({
      squadId,
      playerIds: [friend.identity.playerId],
    });
    const [invitation] = await founder.caller.squads.sentInvitations({
      squadId,
    });
    await founder.caller.squads.cancelInvitation({
      invitationId: invitation!.id,
    });
    expect((await friend.caller.squads.mine()).invitations).toEqual([]);
    await expect(
      friend.caller.squads.respondInvitation({
        invitationId: invitation!.id,
        accept: true,
      }),
    ).rejects.toThrow();
  });
});
