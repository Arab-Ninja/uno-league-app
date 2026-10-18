import { and, eq, isNotNull, like, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_TIMEZONE, zonedTimeToUtc } from "@uno/shared";
import { db } from "../src/db/client.js";
import {
  notificationDeliveries,
  players,
  proposals,
} from "../src/db/schema.js";
import { eventMail } from "../src/email/templates.js";
import { adminKpis } from "../src/services/admin-kpis.service.js";
import {
  emailUnsubscribeToken,
  notifyPlayer,
  playerFromUnsubscribeToken,
  sendMorningDigests,
} from "../src/services/notifications.service.js";
import {
  announceNewProposals,
  sendSessionReminders,
} from "../src/services/proposal-notices.service.js";
import {
  anonymousCaller,
  createFundedPlayer,
  createPlayer,
  daysFromNow,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Les notifications réglables (NOTIF-001 à NOTIF-006).
 *
 * Tout arrive dans l'onglet « Pour moi » ; ce qui se règle, catégorie par
 * catégorie, c'est le push et l'e-mail. Séances et paiements ne se coupent
 * pas. Les e-mails se quittent d'un clic, la nuit est calme, et la ligue
 * annonce ses séances, prévient quand elles sont presque complètes et
 * rappelle qu'elles approchent.
 */

const MINUTE = 60_000;

async function rows(playerId: number, keyPrefix: string) {
  return db
    .select({
      key: notificationDeliveries.eventKey,
      category: notificationDeliveries.category,
      url: notificationDeliveries.url,
      deferred: notificationDeliveries.pushDeferredAt,
      body: notificationDeliveries.body,
    })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.playerId, playerId),
        like(notificationDeliveries.eventKey, `${keyPrefix}%`),
      ),
    );
}

async function openFriendly(creator: TestPlayer, date = daysFromNow(1)) {
  const admin = creator.identity.role === "admin";
  const input = {
    date,
    slotStartHour: 18,
    venueId: "arena",
    modeId: "friendly" as const,
  };
  const created = admin
    ? await creator.caller.admin.createProposal(input)
    : await creator.caller.proposals.create({ ...input, date: daysFromNow(3) });
  return created.proposal;
}

describe("réglages des notifications (NOTIF-001)", () => {
  beforeEach(resetDatabase);

  it("NOTIF-001 — les défauts, et séances et paiements ne se coupent pas", async () => {
    const joueur = await createPlayer();
    const vue = await joueur.caller.players.notificationSettings();
    expect(vue.settings.push).toMatchObject({
      sessions: true,
      payments: true,
      reminders: true,
      newProposals: true,
      announcements: true,
    });
    expect(vue.settings.email.reminders).toBe(false);
    expect(vue.settings.reminderHours).toBe(4);
    expect(vue.settings.quietHours).toBe(true);
    expect(vue.emailOptOut).toBe(false);

    const apres = await joueur.caller.players.updateNotificationSettings({
      push: { sessions: false, payments: false, wallet: false },
      email: { announcements: true, shop: false },
      reminderHours: 2,
      quietHours: false,
    });
    // Verrouillées : rien n'y change. Les annonces n'envoient jamais d'e-mail.
    expect(apres.settings.push.sessions).toBe(true);
    expect(apres.settings.push.payments).toBe(true);
    expect(apres.settings.email.announcements).toBe(false);
    // Le reste suit le joueur.
    expect(apres.settings.push.wallet).toBe(false);
    expect(apres.settings.email.shop).toBe(false);
    expect(apres.settings.reminderHours).toBe(2);
    expect(apres.settings.quietHours).toBe(false);

    // Une durée hors de la liste est refusée.
    await expect(
      joueur.caller.players.updateNotificationSettings({
        reminderHours: 5 as never,
      }),
    ).rejects.toThrow();
  });

  it("NOTIF-001 — tout arrive dans « Pour moi », avec sa catégorie et l'écran qu'elle ouvre", async () => {
    const joueur = await createPlayer();
    await joueur.caller.players.updateNotificationSettings({
      push: { wallet: false },
    });

    await notifyPlayer(
      {
        playerId: joueur.identity.playerId,
        eventKey: "test:points",
        category: "wallet",
        title: "Points reçus",
        body: "50 UNO.",
        url: "/wallet",
      },
      db,
    );

    const liste = await joueur.caller.players.notifications({ limit: 10 });
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({
      title: "Points reçus",
      category: "wallet",
      url: "/wallet",
      read: false,
    });

    const tableau = await joueur.caller.players.dashboard();
    expect(tableau.unreadNotifications).toBe(1);
    await joueur.caller.players.markNotificationsRead({
      throughId: liste[0]!.id,
    });
    expect((await joueur.caller.players.dashboard()).unreadNotifications).toBe(
      0,
    );
  });

  it("NOTIF-004 — la nuit, le push est retenu, puis repris par le récapitulatif du matin", async () => {
    const calme = await createPlayer();
    const eveille = await createPlayer();
    await eveille.caller.players.updateNotificationSettings({
      quietHours: false,
    });
    const nuit = zonedTimeToUtc(daysFromNow(1), 23, DEFAULT_TIMEZONE);

    for (const joueur of [calme, eveille]) {
      await notifyPlayer(
        {
          playerId: joueur.identity.playerId,
          eventKey: "test:nuit",
          category: "sessions",
          title: "Séance déplacée",
          body: "Demain 20 h.",
        },
        db,
        nuit,
      );
    }
    expect(
      (await rows(calme.identity.playerId, "test:nuit"))[0]!.deferred,
    ).not.toBeNull();
    expect(
      (await rows(eveille.identity.playerId, "test:nuit"))[0]!.deferred,
    ).toBeNull();

    // Encore la nuit : rien ne part, rien ne bouge.
    await sendMorningDigests(new Date(nuit.getTime() + 2 * 60 * MINUTE));
    expect(
      (await rows(calme.identity.playerId, "test:nuit"))[0]!.deferred,
    ).not.toBeNull();

    // Le matin, le récapitulatif reprend ce qui a été retenu.
    const matin = zonedTimeToUtc(daysFromNow(2), 8, DEFAULT_TIMEZONE);
    await sendMorningDigests(new Date(matin.getTime() + 5 * MINUTE));
    expect(
      (await rows(calme.identity.playerId, "test:nuit"))[0]!.deferred,
    ).toBeNull();
  });
});

describe("désinscription des e-mails (NOTIF-002)", () => {
  beforeEach(resetDatabase);

  it("NOTIF-002 — le jeton est signé : il ne se fabrique pas pour un autre", async () => {
    const jeton = emailUnsubscribeToken(42);
    expect(playerFromUnsubscribeToken(jeton)).toBe(42);
    const [, signature] = jeton.split(".");
    expect(playerFromUnsubscribeToken(`43.${signature}`)).toBeNull();
    expect(playerFromUnsubscribeToken("42.faux")).toBeNull();
    expect(playerFromUnsubscribeToken("n'importe quoi")).toBeNull();
  });

  it("NOTIF-002 — un clic sans session désinscrit, un autre réabonne", async () => {
    const joueur = await createPlayer();
    const jeton = emailUnsubscribeToken(joueur.identity.playerId);

    await anonymousCaller().players.emailUnsubscribe({ token: jeton });
    expect(
      (await joueur.caller.players.notificationSettings()).emailOptOut,
    ).toBe(true);

    await anonymousCaller().players.emailUnsubscribe({
      token: jeton,
      subscribe: true,
    });
    expect(
      (await joueur.caller.players.notificationSettings()).emailOptOut,
    ).toBe(false);

    await expect(
      anonymousCaller().players.emailUnsubscribe({ token: "1.contrefait00" }),
    ).rejects.toThrow(/pas valable/);
  });

  it("NOTIF-002 — chaque e-mail de notification porte le lien et l'en-tête de désabonnement", () => {
    const mail = eventMail({
      to: "joueur@test.local",
      displayName: "Joueur",
      title: "Séance confirmée",
      body: "Demain 18 h.",
      locale: "fr",
      unsubscribe: {
        page: "https://unoleague.be/desinscription?jeton=7.abc",
        oneClick: "https://unoleague.be/trpc/email-unsubscribe?jeton=7.abc",
      },
    });
    expect(mail.html).toContain("Ne plus recevoir ces e-mails");
    expect(mail.html).toContain("/desinscription?jeton=7.abc");
    expect(mail.text).toContain("/desinscription?jeton=7.abc");
    expect(mail.headers).toEqual({
      "List-Unsubscribe":
        "<https://unoleague.be/trpc/email-unsubscribe?jeton=7.abc>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
});

describe("proposer le push (NOTIF-003)", () => {
  beforeEach(resetDatabase);

  it("NOTIF-003 — une première fois, une relance, puis plus rien", async () => {
    const joueur = await createPlayer();
    expect((await joueur.caller.players.pushPrompt()).stage).toBe("first");
    await joueur.caller.players.markPushPrompt({ stage: "first" });
    expect((await joueur.caller.players.pushPrompt()).stage).toBe("afterJoin");
    await joueur.caller.players.markPushPrompt({ stage: "afterJoin" });
    expect((await joueur.caller.players.pushPrompt()).stage).toBeNull();
  });
});

describe("autour des séances (NOTIF-005, NOTIF-006)", () => {
  beforeEach(resetDatabase);

  it("NOTIF-005 — une nouvelle séance est annoncée à ceux qui peuvent la rejoindre, une fois", async () => {
    const createur = await createPlayer();
    const autre = await createPlayer();
    const arbitre = await createPlayer({ accountType: "referee" });
    const proposal = await openFriendly(createur);

    const now = new Date();
    expect(await announceNewProposals(now)).toBe(1);
    const recu = await rows(
      autre.identity.playerId,
      `new-proposal:${proposal.id}`,
    );
    expect(recu).toHaveLength(1);
    expect(recu[0]!.category).toBe("newProposals");
    expect(recu[0]!.url).toBe(`/sessions/${proposal.id}`);
    expect(
      await rows(createur.identity.playerId, `new-proposal:${proposal.id}`),
    ).toHaveLength(0);
    expect(
      await rows(arbitre.identity.playerId, `new-proposal:${proposal.id}`),
    ).toHaveLength(0);

    expect(await announceNewProposals(now)).toBe(0);
  });

  it("NOTIF-005 — en UNO League, seulement la division ; une séance ancienne ou privée n'est pas annoncée", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const d1 = await createPlayer();
    const d2 = await createPlayer();
    for (const [joueur, division] of [
      [admin, "D1"],
      [d1, "D1"],
      [d2, "D2"],
    ] as const) {
      await admin.caller.admin.setDivision({
        playerId: joueur.identity.playerId,
        division,
      });
    }
    const league = await admin.caller.admin.createProposal({
      date: daysFromNow(2),
      slotStartHour: 18,
      venueId: "arena",
      modeId: "league",
    });
    const privee = await d2.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 20,
      venueId: "arena",
      modeId: "friendly",
      visibility: "private",
    });
    const ancienne = await admin.caller.admin.createProposal({
      date: daysFromNow(2),
      slotStartHour: 21,
      venueId: "arena",
      modeId: "friendly",
    });
    await db
      .update(proposals)
      .set({ createdAt: new Date(Date.now() - 2 * 60 * MINUTE) })
      .where(eq(proposals.id, ancienne.proposal.id));

    expect(await announceNewProposals()).toBe(1);
    expect(
      await rows(d1.identity.playerId, `new-proposal:${league.proposal.id}`),
    ).toHaveLength(1);
    expect(
      await rows(d2.identity.playerId, `new-proposal:${league.proposal.id}`),
    ).toHaveLength(0);
    expect(await rows(d1.identity.playerId, "new-proposal:")).toHaveLength(1);

    // Marquées toutes les deux : aucune ne sera annoncée plus tard.
    const marquees = await db
      .select({ id: proposals.id })
      .from(proposals)
      .where(isNotNull(proposals.announcedAt));
    expect(marquees.map((row) => row.id)).toContain(ancienne.proposal.id);
    expect(marquees.map((row) => row.id)).not.toContain(privee.proposal.id);
  });

  it("NOTIF-005 — presque complète : les inscrits sont prévenus, une fois, sauf celui qui vient d'entrer", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const proposal = await openFriendly(admin);
    const joueurs: TestPlayer[] = [];
    for (let index = 0; index < 7; index++) {
      const joueur = await createPlayer();
      await joueur.caller.proposals.join({ proposalId: proposal.id });
      joueurs.push(joueur);
    }
    // 8/10 : le seuil est franchi par le dernier entré.
    const dernier = joueurs[6]!;
    const cle = `proposal:${proposal.id}:almost-full`;
    const prevenu = await rows(joueurs[0]!.identity.playerId, cle);
    expect(prevenu).toHaveLength(1);
    expect(prevenu[0]!.body).toContain("plus que 2 places");
    expect(await rows(admin.identity.playerId, cle)).toHaveLength(1);
    expect(await rows(dernier.identity.playerId, cle)).toHaveLength(0);

    // 9/10 : pas de seconde alerte.
    const neuvieme = await createPlayer();
    await neuvieme.caller.proposals.join({ proposalId: proposal.id });
    const total = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.eventKey, cle));
    expect(Number(total[0]!.n)).toBe(7);
  });

  it("NOTIF-006 — le rappel part à l'heure choisie, une fois, et pas pour qui l'a coupé", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const proposal = await openFriendly(admin);
    const joueurs: TestPlayer[] = [];
    for (let index = 0; index < 9; index++) {
      const joueur = await createFundedPlayer();
      await joueur.caller.proposals.join({ proposalId: proposal.id });
      joueurs.push(joueur);
    }
    const [unHeure, sansRappel] = [joueurs[0]!, joueurs[1]!];
    await unHeure.caller.players.updateNotificationSettings({
      reminderHours: 1,
    });
    await sansRappel.caller.players.updateNotificationSettings({
      push: { reminders: false },
    });

    const kickoff = new Date(proposal.startsAtUtc);
    expect(
      await sendSessionReminders(new Date(kickoff.getTime() - 5 * 60 * MINUTE)),
    ).toBe(0);

    // Quatre heures avant : tout le monde sauf l'heure-avant et le muet.
    const quatre = new Date(kickoff.getTime() - 4 * 60 * MINUTE + MINUTE);
    expect(await sendSessionReminders(quatre)).toBe(8);
    const cle = `proposal:${proposal.id}:reminder`;
    const rappel = await rows(joueurs[5]!.identity.playerId, cle);
    expect(rappel[0]!.body).toContain("votre séance approche");
    expect(rappel[0]!.body).toContain("pas encore réglée");
    expect(await rows(unHeure.identity.playerId, cle)).toHaveLength(0);

    // Rejouer ne renvoie rien.
    expect(await sendSessionReminders(quatre)).toBe(0);

    // Une heure avant : son tour.
    expect(
      await sendSessionReminders(new Date(kickoff.getTime() - 50 * MINUTE)),
    ).toBe(1);
    expect(await rows(sansRappel.identity.playerId, cle)).toHaveLength(0);
  });
});

describe("tableau de bord de l'administration (ADMIN-015)", () => {
  beforeEach(resetDatabase);

  it("ADMIN-015 — les séances à chaque étape, les joueurs et leur portée", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const joueur = await createPlayer();
    await openFriendly(admin);
    await joueur.caller.players.updateNotificationSettings({ emails: false });

    const kpis = await adminKpis();
    expect(kpis.sessions.open).toBe(1);
    expect(kpis.sessions.reservations).toBe(0);
    expect(kpis.sessions.fillRate).toBeCloseTo(0.1);
    expect(kpis.sessions.upcomingSignups).toBe(1);
    expect(kpis.players.total).toBe(2);
    expect(kpis.players.new7d).toBe(2);
    expect(kpis.reach.emailOptOut).toBe(1);
    expect(kpis.reach.pushEnabled).toBe(0);

    // Un joueur ne lit pas le tableau de bord.
    await expect(joueur.caller.admin.kpis()).rejects.toThrow();
    expect((await admin.caller.admin.kpis()).sessions.open).toBe(1);

    const [row] = await db
      .select({ optOut: players.emailOptOutAt })
      .from(players)
      .where(eq(players.id, joueur.identity.playerId));
    expect(row!.optOut).not.toBeNull();
  });
});
