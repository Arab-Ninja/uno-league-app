import * as z from "zod";
import type { Locale } from "./locales.js";
import { remplirGabarit } from "./errors.js";

/**
 * Les messages de validation dans la langue du joueur (I18N-002).
 *
 * Deux sortes de messages sortent d'un schéma :
 *  - ceux que nous avons écrits, en français, à côté de la règle (« Les mots
 *    de passe ne correspondent pas ») : ils se traduisent par ce catalogue,
 *    dont la clé est le texte français lui-même ;
 *  - ceux de Zod, quand la règle n'a pas de message propre : ils se
 *    reconnaissent à ce qu'ils valent exactement le rendu français de Zod, et
 *    se rendent à nouveau dans la bonne langue.
 *
 * Le catalogue est ici, et non côté serveur, parce que les formulaires
 * valident aussi avant d'envoyer : le même message doit se lire dans la même
 * langue, qu'il vienne de l'écran ou du serveur.
 */

type Traduction = Record<Exclude<Locale, "fr">, string>;

export const MESSAGES_VALIDATION: Record<string, Traduction> = {
  "Date invalide (format attendu AAAA-MM-JJ)": {
    en: "Invalid date (expected format YYYY-MM-DD)",
    nl: "Ongeldige datum (verwacht formaat JJJJ-MM-DD)",
  },
  "Email trop long": {
    en: "Email too long",
    nl: "E-mailadres te lang",
  },
  "Adresse email invalide": {
    en: "Invalid email address",
    nl: "Ongeldig e-mailadres",
  },
  "Le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre":
    {
      en: "The password must have at least 8 characters, a capital letter and a digit",
      nl: "Het wachtwoord moet minstens 8 tekens, een hoofdletter en een cijfer bevatten",
    },
  "Au maximum {max} caractères": {
    en: "At most {max} characters",
    nl: "Maximaal {max} tekens",
  },
  "Ce champ est obligatoire": {
    en: "This field is required",
    nl: "Dit veld is verplicht",
  },
  "Identifiant de salle invalide": {
    en: "Invalid venue identifier",
    nl: "Ongeldige zaal-ID",
  },
  "Adresse d'image invalide": {
    en: "Invalid image address",
    nl: "Ongeldig afbeeldingsadres",
  },
  "La date de naissance ne peut pas être dans le futur": {
    en: "The date of birth cannot be in the future",
    nl: "De geboortedatum kan niet in de toekomst liggen",
  },
  "L'inscription est réservée aux personnes de {age} ans ou plus": {
    en: "Signing up is reserved for those aged {age} and over",
    nl: "Inschrijven is voorbehouden aan wie {age} jaar of ouder is",
  },
  "Nationalité invalide": {
    en: "Invalid nationality",
    nl: "Ongeldige nationaliteit",
  },
  "Les mots de passe ne correspondent pas": {
    en: "The passwords do not match",
    nl: "De wachtwoorden komen niet overeen",
  },
  "Mot de passe requis": {
    en: "Password required",
    nl: "Wachtwoord verplicht",
  },
  "Mot de passe actuel requis": {
    en: "Current password required",
    nl: "Huidig wachtwoord verplicht",
  },
  "Au moins 2 caractères": {
    en: "At least 2 characters",
    nl: "Minstens 2 tekens",
  },
  "Panier vide": {
    en: "Empty basket",
    nl: "Lege winkelmand",
  },
  "Aucun match à enregistrer": {
    en: "No match to save",
    nl: "Geen wedstrijd om op te slaan",
  },
  "L'adresse doit commencer par http:// ou https://": {
    en: "The address must start with http:// or https://",
    nl: "Het adres moet beginnen met http:// of https://",
  },
  "Collez l'adresse de la vidéo": {
    en: "Paste the video's address",
    nl: "Plak het adres van de video",
  },
  "Identifiant d'action invalide": {
    en: "Invalid action identifier",
    nl: "Ongeldige actie-ID",
  },
  "Identifiant d'action trop court": {
    en: "Action identifier too short",
    nl: "Actie-ID te kort",
  },
  "Donnez un nom à la session": {
    en: "Give the session a name",
    nl: "Geef de sessie een naam",
  },
  "Donnez un repère à cet enregistrement": {
    en: "Give this recording a label",
    nl: "Geef deze opname een label",
  },
  "Choisissez un joueur inscrit, ou saisissez un nom d'invité.": {
    en: "Choose a registered player, or enter a guest name.",
    nl: "Kies een ingeschreven speler, of vul de naam van een gast in.",
  },
  "Le nom est trop long": {
    en: "The name is too long",
    nl: "De naam is te lang",
  },
  "Le nom doit faire au moins 3 caractères": {
    en: "The name must have at least 3 characters",
    nl: "De naam moet minstens 3 tekens hebben",
  },
  "Le message est vide": {
    en: "The message is empty",
    nl: "Het bericht is leeg",
  },
  "Place invalide": {
    en: "Invalid spot",
    nl: "Ongeldige positie",
  },
  "Formation invalide": {
    en: "Invalid formation",
    nl: "Ongeldige opstelling",
  },
  "Désignez au moins un joueur": {
    en: "Select at least one player",
    nl: "Duid minstens één speler aan",
  },
};

/**
 * Le catalogue sous forme d'expressions : un message à valeur arrive rempli
 * (« Au maximum 80 caractères ») et doit retrouver son gabarit pour que la
 * valeur passe dans la traduction.
 */
const MOTIFS = Object.keys(MESSAGES_VALIDATION)
  .filter((gabarit) => gabarit.includes("{"))
  .map((gabarit) => ({
    gabarit,
    motif: new RegExp(
      "^" +
        gabarit
          .replace(/[.*+?^$()|[\]\\]/g, "\\$&")
          .replace(/\{(\w+)\}/g, "(?<$1>.+?)") +
        "$",
    ),
  }));

/**
 * La traduction d'un message écrit à côté d'une règle, ou `undefined` s'il
 * n'est pas au catalogue.
 */
export function traduireMessageValidation(
  message: string,
  locale: Locale,
): string | undefined {
  if (locale === "fr") return message;
  const direct = MESSAGES_VALIDATION[message];
  if (direct) return direct[locale];
  for (const { gabarit, motif } of MOTIFS) {
    const trouve = motif.exec(message);
    if (trouve?.groups) {
      return remplirGabarit(MESSAGES_VALIDATION[gabarit]![locale], {
        ...trouve.groups,
      });
    }
  }
  return undefined;
}

const LOCALES_ZOD = {
  fr: z.locales.fr,
  en: z.locales.en,
  nl: z.locales.nl,
} as const;

let langueDeZod: Locale = "fr";

/**
 * La langue des messages que Zod écrit lui-même, pour les validations faites
 * dans l'application. Le serveur, lui, reste en français et traduit au
 * moment de répondre : plusieurs requêtes s'y croisent, dans plusieurs
 * langues, et le réglage de Zod est global.
 */
export function poseLangueDeValidation(locale: Locale): void {
  if (locale === langueDeZod) return;
  z.config(LOCALES_ZOD[locale]());
  langueDeZod = locale;
}

/** Le texte d'un message de Zod, quel que soit le format qu'il renvoie. */
function rendu(locale: Locale, issue: z.core.$ZodIssue): string | undefined {
  const brut = LOCALES_ZOD[locale]().localeError(
    issue as unknown as z.core.$ZodRawIssue,
  );
  return typeof brut === "string" ? brut : brut?.message;
}

const TYPE_INVALIDE: Traduction = {
  en: "Invalid value",
  nl: "Ongeldige waarde",
};

/**
 * Le message d'un problème de validation, dans une langue.
 *
 * Un type inattendu — un nombre là où l'on attend un texte — ne vient
 * jamais d'une saisie : c'est un client défaillant. Zod oublie la valeur
 * reçue une fois le problème relevé, si bien qu'un nouveau rendu dirait
 * « reçu : undefined » ; un message sobre vaut mieux qu'un message faux.
 */
export function traduireIssue(issue: z.core.$ZodIssue, locale: Locale): string {
  if (locale === "fr") return issue.message;
  const ecrit = traduireMessageValidation(issue.message, locale);
  if (ecrit !== undefined) return ecrit;
  if (issue.code === "invalid_type") return TYPE_INVALIDE[locale];
  if (rendu("fr", issue) === issue.message) {
    return rendu(locale, issue) ?? issue.message;
  }
  return issue.message;
}

/**
 * Les messages d'erreur d'un formulaire, un par champ, dans une langue.
 *
 * `profondeur` dit combien de segments du chemin nomment le champ : un
 * formulaire à plat n'en garde qu'un (`email`), le serveur les garde tous
 * (`players.3.goals`).
 */
export function erreursParChamp(
  erreur: z.ZodError,
  locale: Locale,
  profondeur = 1,
): Record<string, string> {
  const champs: Record<string, string> = {};
  for (const issue of erreur.issues) {
    const cle =
      issue.path
        .slice(0, profondeur)
        .map((segment) => String(segment))
        .join(".") || "_";
    if (!champs[cle]) champs[cle] = traduireIssue(issue, locale);
  }
  return champs;
}
