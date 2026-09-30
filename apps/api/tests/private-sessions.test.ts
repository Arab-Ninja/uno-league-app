import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import {
  notificationDeliveries,
  players,
  proposals,
} from "../src/db/schema.js";
import {
  createFundedPlayer as createPlayer,
  daysFromNow,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Séances privées et match personnalisé (PRIV-001, PRIV-002, PRIV-003).
 *
 * Une séance privée ne se voit, ne se lit et ne se rejoint que sur invitation
 * de son organisateur — nominative, ou par le lien qu'il partage. Chaque
 * garde-fou est vérifié ici, côté serveur : l'écran qui ne l'affiche pas ne
 * protège rien.
 */
describe("séances privées (PRIV-001, PRIV-002)", () => {
  beforeEach(resetDatabase);

  const amical = {
    date: daysFromNow(4),
    slotStartHour: 20,
    venueId: "yc-five" as const,
    modeId: "friendly" as const,
  };

  async function calendarIds(player: TestPlayer): Promise<number[]> {
    const list = await player.caller.proposals.list({});
    return list.map((proposal) => proposal.id);
  }

  it("PRIV-001 — une séance privée n'apparaît pas au calendrier des autres", async () => {
    const hote = await createPlayer();
    const inconnu = await createPlayer();

    const { proposal } = await hote.caller.proposals.create({
      ...amical,
      visibility: "private",
    });
    expect(proposal.visibility).toBe("private");

    expect(await calendarIds(hote)).toContain(proposal.id);
    expect(await calendarIds(inconnu)).not.toContain(proposal.id);

    // Ni son détail, ni ses équipes, ni son inscription : « introuvable »,
    // pour ne pas révéler qu'elle existe.
    await expect(
      inconnu.caller.proposals.get({ proposalId: proposal.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      inconnu.caller.proposals.teams({ proposalId: proposal.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      inconnu.caller.proposals.join({ proposalId: proposal.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Et elle ne s'affiche pas parmi les séances à rejoindre de l'accueil.
    const dashboard = await inconnu.caller.players.dashboard();
    expect(dashboard.joinable.map((row) => row.id)).not.toContain(proposal.id);
  });

  it("PRIV-001 — la UNO League ne se joue pas en privé", async () => {
    const hote = await createPlayer();
    await expect(
      hote.caller.proposals.create({
        ...amical,
        modeId: "league",
        slotStartHour: 19,
        visibility: "private",
      }),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
  });

  it("PRIV-001 — une séance privée ne se fond pas dans la publique du même créneau", async () => {
    const a = await createPlayer();
    const b = await createPlayer();

    const publique = await a.caller.proposals.create(amical);
    const privee = await b.caller.proposals.create({
      ...amical,
      visibility: "private",
    });

    expect(privee.joinedExisting).toBe(false);
    expect(privee.proposal.id).not.toBe(publique.proposal.id);
    // Et deux groupes d'amis peuvent prendre la même heure.
    const autre = await a.caller.proposals.create({
      ...amical,
      visibility: "private",
    });
    expect(autre.joinedExisting).toBe(false);
  });

  it("PRIV-002 — seul l'organisateur invite, et l'invité accède à la séance", async () => {
    const hote = await createPlayer({ firstName: "Karim", lastName: "Hote" });
    const ami = await createPlayer({ firstName: "Zinedine", lastName: "Ami" });
    const autre = await createPlayer({ firstName: "Robin", lastName: "Autre" });

    const { proposal } = await hote.caller.proposals.create({
      ...amical,
      visibility: "private",
    });

    await hote.caller.proposals.invite({
      proposalId: proposal.id,
      playerIds: [ami.identity.playerId],
    });

    // L'invité la voit au calendrier, sur son accueil, et peut s'inscrire.
    expect(await calendarIds(ami)).toContain(proposal.id);
    const invitations = await ami.caller.proposals.invitations();
    expect(invitations.map((row) => row.proposal.id)).toContain(proposal.id);

    const detail = await ami.caller.proposals.get({ proposalId: proposal.id });
    expect(detail.access.invitation).toBe("pending");
    expect(detail.inviteToken).toBeNull();

    await ami.caller.proposals.join({ proposalId: proposal.id, side: "B" });

    // Inscrit, il n'invite pas pour autant : la liste est celle de l'hôte.
    await expect(
      ami.caller.proposals.invite({
        proposalId: proposal.id,
        playerIds: [autre.identity.playerId],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // L'organisateur voit ses invités et leur réponse.
    const vue = await hote.caller.proposals.get({ proposalId: proposal.id });
    expect(vue.access.isOrganizer).toBe(true);
    expect(vue.invitees.map((row) => [row.player.id, row.status])).toEqual([
      [ami.identity.playerId, "accepted"],
    ]);
  });

  it("PRIV-002 — le lien partagé vaut invitation", async () => {
    const hote = await createPlayer();
    const collegue = await createPlayer();

    const { proposal } = await hote.caller.proposals.create({
      ...amical,
      visibility: "private",
    });
    const vue = await hote.caller.proposals.get({ proposalId: proposal.id });
    const inviteToken = vue.inviteToken!;
    expect(inviteToken).toMatch(/^[A-Za-z0-9_-]{16,}$/);

    // Un faux jeton n'ouvre rien.
    await expect(
      collegue.caller.proposals.get({
        proposalId: proposal.id,
        inviteToken: "x".repeat(22),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const lu = await collegue.caller.proposals.get({
      proposalId: proposal.id,
      inviteToken,
    });
    expect(lu.id).toBe(proposal.id);

    await collegue.caller.proposals.join({
      proposalId: proposal.id,
      inviteToken,
    });

    // Entré par le lien, il devient un invité comme les autres : la séance
    // reste à son calendrier, même sans le lien.
    expect(await calendarIds(collegue)).toContain(proposal.id);
    const hoteVue = await hote.caller.proposals.get({
      proposalId: proposal.id,
    });
    expect(hoteVue.invitees.map((row) => row.status)).toEqual(["accepted"]);
  });

  it("PRIV-002 — décliner retire l'invitation de l'accueil et prévient l'organisateur", async () => {
    const hote = await createPlayer();
    const ami = await createPlayer({ firstName: "Nadia", lastName: "Absente" });

    const { proposal } = await hote.caller.proposals.create({
      ...amical,
      visibility: "private",
    });
    await hote.caller.proposals.invite({
      proposalId: proposal.id,
      playerIds: [ami.identity.playerId],
    });

    await ami.caller.proposals.declineInvitation({ proposalId: proposal.id });
    // Idempotent : un second refus ne renotifie personne.
    await ami.caller.proposals.declineInvitation({ proposalId: proposal.id });

    expect(await ami.caller.proposals.invitations()).toEqual([]);

    const prevenu = await db
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.playerId, hote.identity.playerId),
          eq(
            notificationDeliveries.eventKey,
            `proposal:${proposal.id}:declined:${ami.identity.playerId}`,
          ),
        ),
      );
    expect(prevenu.length).toBeGreaterThan(0);
    expect(prevenu[0]!.title).toBe("Invitation déclinée");

    // Décliner n'interdit rien : il peut encore changer d'avis.
    const detail = await ami.caller.proposals.get({ proposalId: proposal.id });
    expect(detail.access.invitation).toBe("declined");
    const rejoint = await ami.caller.proposals.join({
      proposalId: proposal.id,
      side: "B",
    });
    expect(rejoint.viewer?.isParticipant).toBe(true);
  });

  it("PRIV-001 — l'organisateur ouvre sa séance au public", async () => {
    const hote = await createPlayer();
    const inconnu = await createPlayer();

    const { proposal } = await hote.caller.proposals.create({
      ...amical,
      visibility: "private",
    });

    await expect(
      inconnu.caller.proposals.openToPublic({ proposalId: proposal.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const ouverte = await hote.caller.proposals.openToPublic({
      proposalId: proposal.id,
    });
    expect(ouverte.visibility).toBe("public");
    expect(await calendarIds(inconnu)).toContain(proposal.id);
    await inconnu.caller.proposals.join({ proposalId: proposal.id, side: "B" });
  });

  it("PRIV-001 — ouvrir au public ne double pas une séance publique identique", async () => {
    const a = await createPlayer();
    const b = await createPlayer();

    await a.caller.proposals.create(amical);
    const { proposal } = await b.caller.proposals.create({
      ...amical,
      visibility: "private",
    });

    await expect(
      b.caller.proposals.openToPublic({ proposalId: proposal.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Rien n'a bougé : elle reste privée.
    const detail = await b.caller.proposals.get({ proposalId: proposal.id });
    expect(detail.visibility).toBe("private");
  });
});

describe("match personnalisé (PRIV-003)", () => {
  beforeEach(resetDatabase);

  const custom = {
    date: daysFromNow(3),
    startTime: "18:15",
    durationMinutes: 90 as const,
    playersPerTeam: 3,
    venueName: "Terrain STIB Delta",
    venueAddress: "Boulevard du Triomphe 1, 1160 Auderghem",
    priceTotalCents: 3000,
    paymentNote: "Chacun paie sa part à Karim, sur place ou par virement.",
  };

  /** Ramène le coup d'envoi dans le passé : la feuille ne s'ouvre qu'après. */
  async function kickedOff(proposalId: number) {
    await db
      .update(proposals)
      .set({ startsAtUtc: new Date(Date.now() - 2 * 3_600_000) })
      .where(eq(proposals.id, proposalId));
  }

  async function snapshot(playerId: number) {
    const [row] = await db
      .select({
        xp: players.xp,
        goals: players.goals,
        assists: players.assists,
        motm: players.motm,
        unoPoints: players.unoPoints,
        matchesPlayed: players.matchesPlayed,
        rating: players.rating,
        division: players.division,
      })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);
    return row!;
  }

  it("PRIV-003 — se crée privé, avec son lieu, son heure et son prix affiché", async () => {
    const hote = await createPlayer();
    const created = await hote.caller.proposals.createCustom(custom);

    expect(created).toMatchObject({
      modeId: "custom",
      visibility: "private",
      venueName: "Terrain STIB Delta",
      localTimeLabel: "18:15 - 19:45",
      minParticipants: 6,
      priceEur: 0,
      priceUno: 0,
      custom: {
        venueAddress: "Boulevard du Triomphe 1, 1160 Auderghem",
        durationMinutes: 90,
        priceTotalCents: 3000,
        pricePerPlayerCents: null,
        paymentNote: "Chacun paie sa part à Karim, sur place ou par virement.",
      },
    });

    // Il ne passe pas par la création des séances en salle.
    await expect(
      hote.caller.proposals.create({
        date: daysFromNow(3),
        slotStartHour: 18,
        venueId: "yc-five",
        modeId: "custom",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("PRIV-003 — l'heure se choisit au quart d'heure, au moins une heure à l'avance", async () => {
    const hote = await createPlayer();
    await expect(
      hote.caller.proposals.createCustom({ ...custom, startTime: "18:10" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      hote.caller.proposals.createCustom({
        ...custom,
        date: daysFromNow(-1),
      }),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
  });

  it("PRIV-003 — plateau complet : confirmé sans rien à régler dans l'app", async () => {
    const hote = await createPlayer();
    const created = await hote.caller.proposals.createCustom(custom);

    const autres = await Promise.all(
      Array.from({ length: 5 }, () => createPlayer()),
    );
    for (const joueur of autres) {
      await hote.caller.proposals.invite({
        proposalId: created.id,
        playerIds: [joueur.identity.playerId],
      });
      await joueur.caller.proposals.join({ proposalId: created.id });
    }

    const detail = await hote.caller.proposals.get({ proposalId: created.id });
    expect(detail.status).toBe("session");
    expect(detail.paymentDeadline).toBeNull();

    const [annonce] = await db
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.playerId, autres[0]!.identity.playerId),
          eq(
            notificationDeliveries.eventKey,
            `proposal:${created.id}:confirmed`,
          ),
        ),
      )
      .limit(1);
    expect(annonce?.body).toContain("hors de l'application");
  });

  it("PRIV-003 — l'organisateur confirme sans attendre le plateau complet", async () => {
    const hote = await createPlayer();
    const ami = await createPlayer();
    const created = await hote.caller.proposals.createCustom(custom);

    await expect(
      hote.caller.proposals.confirmCustom({ proposalId: created.id }),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });

    await hote.caller.proposals.invite({
      proposalId: created.id,
      playerIds: [ami.identity.playerId],
    });
    await ami.caller.proposals.join({ proposalId: created.id });

    await expect(
      ami.caller.proposals.confirmCustom({ proposalId: created.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const confirmed = await hote.caller.proposals.confirmCustom({
      proposalId: created.id,
    });
    expect(confirmed.status).toBe("session");

    const teams = await hote.caller.proposals.teams({ proposalId: created.id });
    expect(teams).toHaveLength(2);
  });

  it("PRIV-003 — l'organisateur saisit la feuille, et rien ne compte au dossier", async () => {
    const hote = await createPlayer();
    const joueurs = [
      hote,
      ...(await Promise.all([1, 2, 3].map(() => createPlayer()))),
    ];
    const created = await hote.caller.proposals.createCustom({
      ...custom,
      playersPerTeam: 3,
    });
    for (const joueur of joueurs.slice(1)) {
      await hote.caller.proposals.invite({
        proposalId: created.id,
        playerIds: [joueur.identity.playerId],
      });
      await joueur.caller.proposals.join({ proposalId: created.id });
    }
    await hote.caller.proposals.confirmCustom({ proposalId: created.id });

    // La feuille ne s'ouvre qu'après le coup d'envoi.
    await expect(
      hote.caller.customMatches.sheet({ proposalId: created.id }),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
    await kickedOff(created.id);

    // Et seulement à l'organisateur.
    await expect(
      joueurs[1]!.caller.customMatches.sheet({ proposalId: created.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const before = await Promise.all(
      joueurs.map((joueur) => snapshot(joueur.identity.playerId)),
    );

    let sheet = await hote.caller.customMatches.sheet({
      proposalId: created.id,
    });
    expect(sheet.teams).toHaveLength(2);
    expect(sheet.matches).toHaveLength(1);

    // Une troisième équipe, un joueur absent, un second match.
    await hote.caller.customMatches.addTeam({ proposalId: created.id });
    const absent = joueurs[3]!.identity.playerId;
    await hote.caller.customMatches.unassign({
      proposalId: created.id,
      playerId: absent,
    });
    sheet = await hote.caller.customMatches.sheet({ proposalId: created.id });
    expect(sheet.teams).toHaveLength(3);
    expect(sheet.unassigned.map((player) => player.id)).toEqual([absent]);

    // Un joueur étranger à la séance ne se place pas dans une équipe.
    const intrus = await createPlayer();
    await expect(
      hote.caller.customMatches.assignTeam({
        proposalId: created.id,
        playerId: intrus.identity.playerId,
        teamId: sheet.teams[0]!.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await hote.caller.customMatches.addMatch({
      proposalId: created.id,
      teamAId: sheet.teams[0]!.id,
      teamBId: sheet.teams[1]!.id,
    });
    sheet = await hote.caller.customMatches.sheet({ proposalId: created.id });
    expect(sheet.matches).toHaveLength(2);

    await hote.caller.customMatches.record({
      proposalId: created.id,
      complete: true,
      matches: sheet.matches.map((match, index) => ({
        matchId: match.id,
        scoreA: 3 + index,
        scoreB: 1,
        stats: [
          ...(match.teamA?.players ?? []),
          ...(match.teamB?.players ?? []),
        ].map((player) => ({
          playerId: player.id,
          goals: 2,
          assists: 1,
          defenses: 1,
          saves: 0,
        })),
      })),
    });

    const detail = await hote.caller.proposals.get({ proposalId: created.id });
    expect(detail.status).toBe("completed");
    // Un classement de séance, lisible sur la séance…
    const scoreboard = await hote.caller.proposals.scoreboard({
      proposalId: created.id,
    });
    expect(scoreboard.length).toBeGreaterThan(0);

    // …et pas une once de plus au dossier : ni XP, ni statistiques, ni UNO,
    // ni séance jouée, ni note, ni division.
    const after = await Promise.all(
      joueurs.map((joueur) => snapshot(joueur.identity.playerId)),
    );
    expect(after).toEqual(before);

    // La correction rouvre la feuille sans rien retirer non plus.
    await hote.caller.customMatches.reopen({ proposalId: created.id });
    const reopened = await Promise.all(
      joueurs.map((joueur) => snapshot(joueur.identity.playerId)),
    );
    expect(reopened).toEqual(before);
  });

  it("PRIV-003 — la file de saisie de l'administration l'ignore, et il ne s'ouvre pas au public", async () => {
    const hote = await createPlayer();
    const ami = await createPlayer();
    const admin = await promoteToAdmin(await createPlayer());
    const created = await hote.caller.proposals.createCustom(custom);
    await hote.caller.proposals.invite({
      proposalId: created.id,
      playerIds: [ami.identity.playerId],
    });
    await ami.caller.proposals.join({ proposalId: created.id });

    await expect(
      hote.caller.proposals.openToPublic({ proposalId: created.id }),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });

    await hote.caller.proposals.confirmCustom({ proposalId: created.id });
    await kickedOff(created.id);

    const pending = await admin.caller.supervision.pending();
    expect(pending.map((row) => row.id)).not.toContain(created.id);
  });
});
