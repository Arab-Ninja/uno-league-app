import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Courrier : gabarits et règle de repli (MAIL-001).
 *
 * Deux choses sont vérifiées ici, et aucune des deux ne joint de serveur SMTP.
 *
 * **Les gabarits**, parce qu'un courrier est du HTML envoyé à un client qu'on
 * ne contrôle pas : un nom d'affichage qui contient des balises y serait rendu
 * comme du balisage, et un message sans version texte est signalé comme
 * pourriel par la plupart des filtres.
 *
 * **La règle de repli**, parce qu'elle décide qui reçoit deux fois la même
 * chose. Elle ne se lit pas dans un gabarit : elle vit dans l'enchaînement
 * entre le push et le courrier, et c'est exactement le genre de condition qui
 * s'inverse au premier remaniement sans que personne ne s'en aperçoive.
 */

const envois: { to: string; subject: string; text: string; html: string }[] =
  [];
const pushSent = { value: 0 };

vi.mock("../src/email/mailer.js", () => ({
  mailEnabled: () => true,
  mailCredentials: () => null,
  sendMail: vi.fn(async (mail: (typeof envois)[number]) => {
    envois.push(mail);
    return true;
  }),
  closeMailer: () => undefined,
}));

/*
 * Doublure **partielle** : seul `pushToPlayer` est remplacé, parce que c'est
 * son retour qui décide du repli par courrier. Remplacer le module entier
 * revenait à devoir réécrire chaque fonction qu'il exporte, et cassait au
 * premier ajout — `pushToAdmins`, appelé par le journal d'administration, a
 * suffi à le montrer.
 */
vi.mock("../src/services/push.service.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/services/push.service.js")>()),
  pushToPlayer: vi.fn(async () => ({ sent: pushSent.value, removed: 0 })),
}));

const { eventMail, passwordResetMail, welcomeMail } =
  await import("../src/email/templates.js");
const { absoluteUrl } = await import("../src/email/links.js");
const { db } = await import("../src/db/client.js");
const { notifyPlayer } =
  await import("../src/services/notifications.service.js");
const { createFundedPlayer, createPlayer, resetDatabase } =
  await import("./helpers.js");
const { VENUES, addDaysIso, todayIso, DEFAULT_TIMEZONE, gabarit } =
  await import("@uno/shared");
const { notificationDeliveries, players } = await import("../src/db/schema.js");
const { eq } = await import("drizzle-orm");

const TOUS = [
  passwordResetMail({
    to: "a@test.local",
    displayName: "Alex",
    url: "https://unoleague.test/mot-de-passe/x",
    validityMinutes: 60,
  }),
  welcomeMail({
    to: "a@test.local",
    displayName: "Alex",
    url: "https://unoleague.test/",
  }),
  eventMail({
    to: "a@test.local",
    displayName: "Alex",
    title: "Séance confirmée",
    body: "Vendredi 20h à l'Arena.",
    url: "https://unoleague.test/sessions/12",
  }),
];

describe("gabarits de courrier (MAIL-001)", () => {
  it("MAIL-001 — chaque message part en texte et en HTML", () => {
    for (const mail of TOUS) {
      expect(mail.text.length).toBeGreaterThan(40);
      expect(mail.html).toContain("<!doctype html>");
      expect(mail.subject.length).toBeGreaterThan(0);
    }
  });

  it("MAIL-001 — un nom d'affichage n'est jamais rendu comme du balisage", () => {
    /*
     * Un nom est une chaîne que son propriétaire écrit. Un client de
     * messagerie qui rend du HTML rend aussi celui-là : sans échappement, un
     * joueur pourrait poser un lien dans le courrier que la ligue envoie en
     * son nom à... lui-même, certes. Mais le même gabarit sert aux messages
     * qui citeront demain le nom d'un autre.
     */
    const malveillant = '<img src=x onerror="alert(1)">';

    const mail = welcomeMail({
      to: "a@test.local",
      displayName: malveillant,
      url: "https://unoleague.test/",
    });

    // Le texte hostile ne survit nulle part tel quel : c'est la propriété qui
    // compte. Le mot « onerror » peut rester — dans `&lt;img ... onerror=...`
    // il n'est plus un attribut, seulement des lettres.
    expect(mail.html).not.toContain(malveillant);
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img");
    expect(mail.html).toContain("&quot;");
  });

  it("MAIL-001 — le corps d'un évènement est échappé, pas seulement le nom", () => {
    const mail = eventMail({
      to: "a@test.local",
      displayName: "Alex",
      title: "Séance confirmée",
      body: "<script>alert(1)</script>",
      url: undefined,
    });

    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("MAIL-001 — sans adresse, le message ne porte aucun bouton mort", () => {
    const mail = eventMail({
      to: "a@test.local",
      displayName: "Alex",
      title: "Séance confirmée",
      body: "Vendredi 20h.",
      url: undefined,
    });

    expect(mail.html).not.toContain("Voir dans l'application");
    // Le texte ne laisse pas non plus de ligne vide en guise de lien.
    expect(mail.text).not.toContain("undefined");
  });

  it("MAIL-001 — le courrier de réinitialisation annonce sa durée et son usage unique", () => {
    const mail = passwordResetMail({
      to: "a@test.local",
      displayName: "Alex",
      url: "https://unoleague.test/mot-de-passe/x",
      validityMinutes: 60,
    });

    expect(mail.text).toContain("60 minutes");
    expect(mail.text).toContain("une fois");
    // Et il dit quoi faire quand on n'a rien demandé : sans cela, le message
    // se lit comme une tentative d'intrusion réussie.
    expect(mail.text).toContain("ignorez ce message");
  });
});

describe("adresses absolues (MAIL-001)", () => {
  it("MAIL-001 — un chemin interne devient une adresse complète", () => {
    expect(absoluteUrl("/sessions/12")).toBe(
      "https://unoleague.test/sessions/12",
    );
    // Sans barre oblique initiale, le résultat reste correct.
    expect(absoluteUrl("sessions/12")).toBe(
      "https://unoleague.test/sessions/12",
    );
  });

  it("MAIL-001 — une adresse déjà complète n'est pas préfixée deux fois", () => {
    expect(absoluteUrl("https://ailleurs.test/x")).toBe(
      "https://ailleurs.test/x",
    );
  });
});

describe("le courrier ne double pas le push (MAIL-001)", () => {
  beforeEach(async () => {
    await resetDatabase();
    envois.length = 0;
  });

  it("MAIL-001 — un joueur joint par push ne reçoit pas de courrier", async () => {
    const joueur = await createPlayer();
    envois.length = 0;

    pushSent.value = 1;
    await notifyPlayer(
      {
        playerId: joueur.identity.playerId,
        eventKey: "test:pousse",
        title: "Séance confirmée",
        body: "Vendredi 20h.",
        url: "/sessions/12",
      },
      db,
    );

    // L'envoi est détaché de l'appel : on laisse la micro-tâche s'exécuter.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(envois).toHaveLength(0);
  });

  it("MAIL-001 — un joueur qu'aucun appareil ne porte reçoit un courrier", async () => {
    const joueur = await createPlayer();
    envois.length = 0;

    pushSent.value = 0;
    await notifyPlayer(
      {
        playerId: joueur.identity.playerId,
        eventKey: "test:repli",
        title: "Séance confirmée",
        body: "Vendredi 20h.",
        url: "/sessions/12",
      },
      db,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(envois).toHaveLength(1);
    expect(envois[0]!.to).toBe(joueur.email);
    expect(envois[0]!.subject).toBe("Séance confirmée");
    // Le lien porte le domaine public : une adresse relative est inerte dans
    // une boîte de réception.
    expect(envois[0]!.text).toContain("https://unoleague.test/sessions/12");
  });

  it("I18N-002 — une notification se lit dans la langue du destinataire", async () => {
    const joueur = await createPlayer();
    await db
      .update(players)
      .set({ locale: "en" })
      .where(eq(players.id, joueur.identity.playerId));
    envois.length = 0;
    pushSent.value = 0;

    await notifyPlayer(
      {
        playerId: joueur.identity.playerId,
        eventKey: "test:langue",
        title: gabarit("Paiement en retard"),
        body: gabarit(
          "Votre place du {jour} à {salle} n'est pas réglée. Elle peut désormais être reprise par un remplaçant.",
          { jour: { jour: "2026-10-12" }, salle: "Arena" },
        ),
        url: "/sessions/12",
      },
      db,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    const [rangee] = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.playerId, joueur.identity.playerId));
    expect(rangee!.title).toBe("Payment overdue");
    expect(rangee!.body).toBe(
      "Your place on Monday 12 October at Arena has not been paid. A substitute can now take it.",
    );

    // Le courrier de repli : même langue, de la salutation au pied.
    expect(envois).toHaveLength(1);
    expect(envois[0]!.subject).toBe("Payment overdue");
    expect(envois[0]!.text).toMatch(/^Hello /);
    expect(envois[0]!.html).toContain('<html lang="en">');
    expect(envois[0]!.html).toContain("View in the app");
    expect(envois[0]!.html).not.toContain("Ce message vous est adressé");
  });

  it("MAIL-001 — la confirmation d'une séance prévient tous les inscrits", async () => {
    /*
     * Le message le plus utile de l'application, et il manquait : il ouvre les
     * vingt-quatre heures au terme desquelles une place non réglée revient aux
     * remplaçants. Jusqu'ici seul le *retard* était annoncé — on prévenait le
     * joueur qu'il avait manqué une échéance dont il n'avait jamais entendu
     * parler.
     *
     * Un amical suffit à le prouver : dix joueurs au lieu de quinze, même
     * bascule.
     */
    const joueurs = [];
    for (let index = 0; index < 10; index++) {
      joueurs.push(await createFundedPlayer());
    }

    const date = addDaysIso(todayIso(DEFAULT_TIMEZONE), 5);
    const cree = await joueurs[0]!.caller.proposals.create({
      date,
      slotStartHour: 20,
      venueId: VENUES[0]!.id,
      modeId: "friendly",
    });
    const proposalId = cree.proposal.id;

    envois.length = 0;
    pushSent.value = 0;

    // Les neuf suivants complètent le plateau ; le dernier déclenche la
    // bascule en réservation.
    for (const joueur of joueurs.slice(1)) {
      await joueur.caller.proposals.join({ proposalId });
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    const confirmations = envois.filter((mail) =>
      mail.subject.includes("Séance confirmée"),
    );
    // Tout le monde, y compris celui qui a ouvert la proposition.
    expect(confirmations).toHaveLength(joueurs.length);

    const adresses = new Set(confirmations.map((mail) => mail.to));
    for (const joueur of joueurs) expect(adresses.has(joueur.email)).toBe(true);

    // Et le message dit ce qu'il faut faire, pas seulement que c'est complet.
    expect(confirmations[0]!.text).toContain("Réglez votre place");
  });

  it("MAIL-001 — une notification rejouée n'envoie rien une seconde fois", async () => {
    /*
     * La clé (joueur, évènement, canal) est unique : une tâche d'entretien qui
     * repasse toutes les heures ne doit pas remplir une boîte de réception.
     */
    const joueur = await createPlayer();
    envois.length = 0;
    pushSent.value = 0;

    const notification = {
      playerId: joueur.identity.playerId,
      eventKey: "test:rejoue",
      title: "Place à régler",
      body: "Il vous reste 24 heures.",
    };

    await notifyPlayer(notification, db);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await notifyPlayer(notification, db);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(envois).toHaveLength(1);
  });
});
