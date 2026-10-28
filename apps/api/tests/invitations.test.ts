import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { notificationDeliveries, proposals } from "../src/db/schema.js";
import { INVITATIONS_PER_DAY } from "../src/services/invitations.service.js";
import {
  createFundedPlayer as createPlayer,
  daysFromNow,
  promoteToAdmin,
  resetDatabase,
} from "./helpers.js";

/**
 * Inviter un joueur de l'application à une séance (CAL-012).
 *
 * La notification sonne sur le téléphone d'un autre : chaque garde-fou est
 * vérifié ici, côté serveur, parce que l'écran ne protège rien.
 */
describe("inviter un joueur à une séance (CAL-012)", () => {
  beforeEach(resetDatabase);

  const amical = {
    date: daysFromNow(4),
    slotStartHour: 20,
    venueId: "yc-five" as const,
    modeId: "friendly" as const,
  };

  async function deliveries(playerId: number, proposalId: number) {
    return db
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.playerId, playerId),
          like(
            notificationDeliveries.eventKey,
            `proposal:${proposalId}:invited:%`,
          ),
        ),
      );
  }

  it("CAL-012 — l'invité est prévenu et retrouve l'invitation sur son accueil", async () => {
    const hote = await createPlayer({ firstName: "Karim", lastName: "Hote" });
    const ami = await createPlayer({ firstName: "Zinedine", lastName: "Ami" });
    const { proposal } = await hote.caller.proposals.create(amical);

    const candidats = await hote.caller.proposals.inviteCandidates({
      proposalId: proposal.id,
      query: "Zinedine",
    });
    expect(candidats.map((c) => [c.player.id, c.state])).toEqual([
      [ami.identity.playerId, "invitable"],
    ]);

    const resultat = await hote.caller.proposals.invite({
      proposalId: proposal.id,
      playerIds: [ami.identity.playerId],
    });
    expect(resultat).toEqual({ invited: 1, skipped: 0 });

    const invitations = await ami.caller.proposals.invitations();
    expect(invitations.map((i) => i.proposal.id)).toEqual([proposal.id]);
    expect(invitations[0]!.inviterName).toContain("Karim");

    expect(await deliveries(ami.identity.playerId, proposal.id)).toHaveLength(
      1,
    );
  });

  it("CAL-014 — plusieurs inscrits invitent le même ami ; chacun une seule fois", async () => {
    const hote = await createPlayer({ firstName: "Karim", lastName: "Hote" });
    const autre = await createPlayer({
      firstName: "Yassine",
      lastName: "Autre",
    });
    const ami = await createPlayer({ firstName: "Zinedine", lastName: "Ami" });
    const { proposal } = await hote.caller.proposals.create(amical);
    await autre.caller.proposals.join({ proposalId: proposal.id });

    await hote.caller.proposals.invite({
      proposalId: proposal.id,
      playerIds: [ami.identity.playerId],
    });

    // Pour le second inscrit, l'ami reste invitable : l'invitation de
    // l'hôte ne réserve rien.
    const candidats = await autre.caller.proposals.inviteCandidates({
      proposalId: proposal.id,
      query: "Zinedine",
    });
    expect(
      candidats.find((c) => c.player.id === ami.identity.playerId)?.state,
    ).toBe("invitable");

    const second = await autre.caller.proposals.invite({
      proposalId: proposal.id,
      playerIds: [ami.identity.playerId],
    });
    expect(second).toEqual({ invited: 1, skipped: 0 });
    expect(await deliveries(ami.identity.playerId, proposal.id)).toHaveLength(
      2,
    );

    // Le même invitant ne relance pas une seconde fois.
    const encore = await hote.caller.proposals.invite({
      proposalId: proposal.id,
      playerIds: [ami.identity.playerId],
    });
    expect(encore).toEqual({ invited: 0, skipped: 1 });
    expect(await deliveries(ami.identity.playerId, proposal.id)).toHaveLength(
      2,
    );

    // Sur son accueil : une seule carte, avec les deux noms.
    const invitations = await ami.caller.proposals.invitations();
    expect(invitations).toHaveLength(1);
    expect(invitations[0]!.inviterNames).toHaveLength(2);
    expect(invitations[0]!.inviterNames.join(" ")).toContain("Karim");
    expect(invitations[0]!.inviterNames.join(" ")).toContain("Yassine");

    // Décliner prévient l'organisateur et chacun de ceux qui l'avaient invité.
    await ami.caller.proposals.declineInvitation({ proposalId: proposal.id });
    for (const joueur of [hote, autre]) {
      const recu = await db
        .select()
        .from(notificationDeliveries)
        .where(
          and(
            eq(notificationDeliveries.playerId, joueur.identity.playerId),
            eq(
              notificationDeliveries.eventKey,
              `proposal:${proposal.id}:declined:${ami.identity.playerId}`,
            ),
          ),
        );
      expect(recu).toHaveLength(1);
    }
    expect(await ami.caller.proposals.invitations()).toHaveLength(0);
  });

  it("CAL-012 — on n'invite ni un inscrit, ni soi-même", async () => {
    const hote = await createPlayer();
    const inscrit = await createPlayer({ firstName: "Deja", lastName: "La" });
    const { proposal } = await hote.caller.proposals.create(amical);
    await inscrit.caller.proposals.join({ proposalId: proposal.id });

    const candidats = await hote.caller.proposals.inviteCandidates({
      proposalId: proposal.id,
      query: "Deja",
    });
    expect(candidats.map((c) => c.state)).toEqual(["participant"]);

    const resultat = await hote.caller.proposals.invite({
      proposalId: proposal.id,
      playerIds: [inscrit.identity.playerId, hote.identity.playerId],
    });
    expect(resultat.invited).toBe(0);
  });

  it("CAL-012 — UNO League : un joueur d'une autre division n'est pas invité", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const hoteD1 = await createPlayer();
    await admin.caller.admin.setDivision({
      playerId: hoteD1.identity.playerId,
      division: "D1",
    });
    const { proposal } = await hoteD1.caller.proposals.create({
      date: daysFromNow(4),
      slotStartHour: 20,
      venueId: "arena",
      modeId: "league",
    });

    // Un inscrit neuf démarre en D3.
    const joueurD3 = await createPlayer({ firstName: "Troisieme" });
    const candidats = await hoteD1.caller.proposals.inviteCandidates({
      proposalId: proposal.id,
      query: "Troisieme",
    });
    expect(candidats.map((c) => c.state)).toEqual(["otherDivision"]);

    const resultat = await hoteD1.caller.proposals.invite({
      proposalId: proposal.id,
      playerIds: [joueurD3.identity.playerId],
    });
    expect(resultat).toEqual({ invited: 0, skipped: 1 });
    expect(await joueurD3.caller.proposals.invitations()).toEqual([]);
  });

  it("CAL-012 — l'invitation s'efface quand l'invité rejoint la séance", async () => {
    const hote = await createPlayer();
    const ami = await createPlayer();
    const { proposal } = await hote.caller.proposals.create(amical);
    await hote.caller.proposals.invite({
      proposalId: proposal.id,
      playerIds: [ami.identity.playerId],
    });

    await ami.caller.proposals.join({ proposalId: proposal.id });

    expect(await ami.caller.proposals.invitations()).toEqual([]);
  });

  it("CAL-012 — une séance qui ne cherche plus personne ne s'invite plus", async () => {
    const hote = await createPlayer();
    const ami = await createPlayer();
    const { proposal } = await hote.caller.proposals.create(amical);
    await hote.caller.proposals.invite({
      proposalId: proposal.id,
      playerIds: [ami.identity.playerId],
    });

    await db
      .update(proposals)
      .set({ status: "cancelled" })
      .where(eq(proposals.id, proposal.id));

    await expect(
      hote.caller.proposals.invite({
        proposalId: proposal.id,
        playerIds: [ami.identity.playerId],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // Et elle quitte l'accueil de l'invité.
    expect(await ami.caller.proposals.invitations()).toEqual([]);
  });

  it(`CAL-012 — au-delà de ${INVITATIONS_PER_DAY} invitations par jour, l'invitant est arrêté`, async () => {
    const hote = await createPlayer();
    const { proposal } = await hote.caller.proposals.create(amical);

    const invites: number[] = [];
    for (let i = 0; i <= INVITATIONS_PER_DAY; i++) {
      invites.push((await createPlayer()).identity.playerId);
    }

    for (let debut = 0; debut < INVITATIONS_PER_DAY; debut += 10) {
      await hote.caller.proposals.invite({
        proposalId: proposal.id,
        playerIds: invites.slice(debut, debut + 10),
      });
    }

    await expect(
      hote.caller.proposals.invite({
        proposalId: proposal.id,
        playerIds: [invites[INVITATIONS_PER_DAY]!],
      }),
    ).rejects.toThrow();
  });
});
