import type { TrackerWarning } from "@uno/shared";
import type { Cle, Traduire } from "@/lib/i18n.js";

/**
 * Les alertes de la saisie, dans la langue de l'écran (I18N-002).
 *
 * Elles sont calculées ici même, par le module partagé, et portent leur
 * gabarit français (`modele`) : c'est lui qui retrouve la phrase traduite,
 * avec les mêmes valeurs. Un test vérifie qu'aucun gabarit des alertes ne
 * manque à cette table.
 */
export const ALERTES_DE_SAISIE: Record<string, Cle> = {
  "Score relevé {releveA}–{releveB}, buts saisis {saisiA}–{saisiB} : il manque un buteur, ou un but a été compté deux fois.":
    "tracker.warn.scoreMismatch",
  "Match terminé sans aucune action saisie.": "tracker.warn.noActions",
  "Aucun gardien désigné pour une équipe qui a encaissé : {buts} but(s) encaissé(s) ne seront attribués à personne.":
    "tracker.warn.noKeeper",
  "Aucun match terminé : il n'y a rien à publier.":
    "tracker.warn.nothingToPublish",
  "Rattachez l'invité à un compte : {noms}. Sans compte, ses points n'iraient nulle part.":
    "tracker.warn.guestOne",
  "Rattachez les invités à un compte : {noms}. Sans compte, leurs points n'iraient nulle part.":
    "tracker.warn.guestMany",
  "Choisissez la division de la session : elle commande le barème des récompenses et les montées comme les descentes.":
    "tracker.warn.division",
};

/** Le texte d'une alerte ; une alerte inconnue garde son français. */
export function texteDAlerte(warning: TrackerWarning, t: Traduire): string {
  const cle = ALERTES_DE_SAISIE[warning.modele.gabarit];
  if (!cle) return warning.message;
  const valeurs: Record<string, string | number> = {};
  for (const [nom, valeur] of Object.entries(warning.modele.valeurs)) {
    if (typeof valeur === "string" || typeof valeur === "number") {
      valeurs[nom] = valeur;
    }
  }
  return t(cle, valeurs);
}
