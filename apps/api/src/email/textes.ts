import { DEFAULT_LOCALE, type Locale } from "@uno/shared";

/**
 * Le texte des courriels, dans les trois langues (I18N-001).
 *
 * **C'est ici que la langue rangée sur le compte sert vraiment.** Un courriel
 * part du serveur, des heures après le geste qui l'a déclenché, sans appareil
 * en face pour dire quelle langue lire. La langue du téléphone ne peut donc
 * rien pour lui : seule celle du compte le peut.
 *
 * **Le repli d'une notification suit la même langue.** Son titre et son
 * corps sont rendus dans la langue du destinataire avant même d'être écrits
 * (`notifyPlayer`), et l'enveloppe — salutation, raison du courrier, bouton —
 * vient d'ici : un seul message, d'une seule langue, du premier mot au pied.
 *
 * Les jetons `{nom}` sont remplacés à la composition, comme côté interface.
 */

interface TextesCourriel {
  /** Le bas de page commun à tous les messages. */
  pied: string;

  /** L'enveloppe d'une notification que le push n'a pas portée. */
  evenement: {
    bonjour: string;
    raison: string;
    bouton: string;
  };

  reinitialisation: {
    sujet: string;
    titre: string;
    bonjour: string;
    demande: string;
    bouton: string;
    note: string;
    /** La version texte, qui n'a pas de bouton à cliquer. */
    texteIntro: string;
    texteValidite: string;
    texteIgnorer: string;
  };

  bienvenue: {
    sujet: string;
    titre: string;
    ouvert: string;
    etape1: string;
    etape2: string;
    etape3: string;
    bouton: string;
    note: string;
    texteIntro: string;
    textePuce1: string;
    textePuce2: string;
    textePuce3: string;
    texteEspace: string;
  };
}

const fr: TextesCourriel = {
  pied:
    "\n\n—\nCe message vous est adressé parce que vous avez un compte sur UNO League, " +
    "la ligue de futsal amateur. Vous pouvez régler les notifications depuis votre " +
    "profil, dans l'application.",
  evenement: {
    bonjour: "Bonjour {nom},",
    raison:
      "Vous recevez ce message par courrier parce que les notifications ne sont pas actives sur votre appareil. Les activer dans l'application vous les apportera plus vite.",
    bouton: "Voir dans l'application",
  },
  reinitialisation: {
    sujet: "Réinitialiser votre mot de passe UNO League",
    titre: "Réinitialiser votre mot de passe",
    bonjour: "Bonjour {nom},",
    demande:
      "Vous avez demandé à réinitialiser votre mot de passe. Le bouton ci-dessous vous mène à l'écran où en choisir un nouveau.",
    bouton: "Choisir un nouveau mot de passe",
    note: "Ce lien est valable {minutes} minutes et ne fonctionne qu'une fois. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable, et personne n'a eu accès à votre compte.",
    texteIntro:
      "Vous avez demandé à réinitialiser votre mot de passe UNO League. Ouvrez ce lien pour en choisir un nouveau :",
    texteValidite:
      "Ce lien est valable {minutes} minutes et ne fonctionne qu'une fois.",
    texteIgnorer:
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable, et personne n'a eu accès à votre compte.",
  },
  bienvenue: {
    sujet: "Bienvenue dans la ligue",
    titre: "Bienvenue dans la ligue",
    ouvert: "Bonjour {nom}, votre compte est ouvert.",
    etape1:
      "<strong>N'importe quel joueur ouvre une proposition</strong> — une salle, une date, un créneau. Les autres s'y inscrivent.",
    etape2:
      "<strong>Dès que le plateau est complet</strong>, chacun règle sa place depuis l'application : carte, Bancontact ou points UNO.",
    etape3:
      "<strong>À la clôture de la séance</strong>, les statistiques, les récompenses et le classement sont mis à jour.",
    bouton: "Ouvrir l'application",
    note: "Cette adresse ({email}) est celle de votre compte : c'est par elle que vous pourrez le récupérer si vous oubliez votre mot de passe.",
    texteIntro:
      "Votre compte UNO League est ouvert. Voici comment la ligue fonctionne :",
    textePuce1:
      "· N'importe quel joueur ouvre une proposition — une salle, une date, un créneau.",
    textePuce2:
      "· Dès que le plateau est complet, chacun règle sa place depuis l'application.",
    textePuce3:
      "· À la fin de la séance, les statistiques, les récompenses et le classement sont mis à jour.",
    texteEspace: "Votre espace : {url}",
  },
};

const en: TextesCourriel = {
  pied:
    "\n\n—\nYou are receiving this message because you have an account on UNO League, " +
    "the amateur futsal league. You can adjust notifications from your profile, in " +
    "the app.",
  evenement: {
    bonjour: "Hello {nom},",
    raison:
      "You are receiving this by email because notifications are not turned on on your device. Turning them on in the app will bring them to you faster.",
    bouton: "View in the app",
  },
  reinitialisation: {
    sujet: "Reset your UNO League password",
    titre: "Reset your password",
    bonjour: "Hello {nom},",
    demande:
      "You asked to reset your password. The button below takes you to the screen where you can choose a new one.",
    bouton: "Choose a new password",
    note: "This link is valid for {minutes} minutes and works only once. If you did not ask for this, ignore this message: your current password still works, and nobody has had access to your account.",
    texteIntro:
      "You asked to reset your UNO League password. Open this link to choose a new one:",
    texteValidite:
      "This link is valid for {minutes} minutes and works only once.",
    texteIgnorer:
      "If you did not ask for this, ignore this message: your current password still works, and nobody has had access to your account.",
  },
  bienvenue: {
    sujet: "Welcome to the league",
    titre: "Welcome to the league",
    ouvert: "Hello {nom}, your account is open.",
    etape1:
      "<strong>Any player opens a proposal</strong> — a venue, a date, a slot. The others sign up.",
    etape2:
      "<strong>Once the roster is full</strong>, everyone pays their place from the app: card, Bancontact or UNO points.",
    etape3:
      "<strong>When the session closes</strong>, statistics, rewards and the ranking are updated.",
    bouton: "Open the app",
    note: "This address ({email}) is the one on your account: it is how you will recover it if you forget your password.",
    texteIntro:
      "Your UNO League account is open. Here is how the league works:",
    textePuce1: "· Any player opens a proposal — a venue, a date, a slot.",
    textePuce2:
      "· Once the roster is full, everyone pays their place from the app.",
    textePuce3:
      "· When the session ends, statistics, rewards and the ranking are updated.",
    texteEspace: "Your space: {url}",
  },
};

const nl: TextesCourriel = {
  pied:
    "\n\n—\nJe ontvangt dit bericht omdat je een account hebt op UNO League, de " +
    "amateurcompetitie zaalvoetbal. Je kunt de meldingen aanpassen in je profiel, " +
    "in de app.",
  evenement: {
    bonjour: "Hallo {nom},",
    raison:
      "Je ontvangt dit per e-mail omdat meldingen niet aanstaan op je toestel. Zet ze aan in de app, dan krijg je ze sneller.",
    bouton: "Bekijken in de app",
  },
  reinitialisation: {
    sujet: "Je UNO League-wachtwoord opnieuw instellen",
    titre: "Je wachtwoord opnieuw instellen",
    bonjour: "Hallo {nom},",
    demande:
      "Je hebt gevraagd om je wachtwoord opnieuw in te stellen. De knop hieronder brengt je naar het scherm waar je een nieuw wachtwoord kiest.",
    bouton: "Een nieuw wachtwoord kiezen",
    note: "Deze link is {minutes} minuten geldig en werkt maar één keer. Heb je dit niet gevraagd, negeer dit bericht dan: je huidige wachtwoord blijft werken, en niemand heeft toegang gehad tot je account.",
    texteIntro:
      "Je hebt gevraagd om je UNO League-wachtwoord opnieuw in te stellen. Open deze link om een nieuw wachtwoord te kiezen:",
    texteValidite:
      "Deze link is {minutes} minuten geldig en werkt maar één keer.",
    texteIgnorer:
      "Heb je dit niet gevraagd, negeer dit bericht dan: je huidige wachtwoord blijft werken, en niemand heeft toegang gehad tot je account.",
  },
  bienvenue: {
    sujet: "Welkom bij de competitie",
    titre: "Welkom bij de competitie",
    ouvert: "Hallo {nom}, je account staat open.",
    etape1:
      "<strong>Elke speler opent een voorstel</strong> — een zaal, een datum, een tijdslot. De anderen schrijven zich in.",
    etape2:
      "<strong>Zodra de ploeg vol is</strong>, betaalt iedereen zijn plaats via de app: kaart, Bancontact of UNO-punten.",
    etape3:
      "<strong>Bij het afsluiten van de sessie</strong> worden de statistieken, de beloningen en het klassement bijgewerkt.",
    bouton: "De app openen",
    note: "Dit adres ({email}) hoort bij je account: daarmee krijg je het terug als je je wachtwoord vergeet.",
    texteIntro: "Je UNO League-account staat open. Zo werkt de competitie:",
    textePuce1:
      "· Elke speler opent een voorstel — een zaal, een datum, een tijdslot.",
    textePuce2:
      "· Zodra de ploeg vol is, betaalt iedereen zijn plaats via de app.",
    textePuce3:
      "· Na afloop van de sessie worden de statistieken, de beloningen en het klassement bijgewerkt.",
    texteEspace: "Jouw ruimte: {url}",
  },
};

const TEXTES: Record<Locale, TextesCourriel> = { fr, en, nl };

export function textesCourriel(
  locale: Locale | null | undefined,
): TextesCourriel {
  return TEXTES[locale ?? DEFAULT_LOCALE] ?? TEXTES[DEFAULT_LOCALE];
}

/**
 * Remplace les jetons `{nom}` par leur valeur.
 *
 * Un jeton sans valeur est laissé tel quel plutôt qu'effacé : « valable
 * {minutes} minutes » est un défaut visible, alors que « valable minutes »
 * ressemble à une phrase et passerait au travers d'une relecture.
 */
export function remplir(
  texte: string,
  valeurs: Record<string, string | number>,
): string {
  return texte.replace(/\{(\w+)\}/g, (entier, nom: string) =>
    nom in valeurs ? String(valeurs[nom]) : entier,
  );
}
