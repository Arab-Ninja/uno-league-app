import { pitchSlotNaming } from "@uno/shared";
import { useLibelles } from "./i18n.js";

/**
 * Le nom d'une place du terrain, dans la langue du joueur.
 *
 * **Pourquoi pas `pitchSlotLabel`.** Le paquet partagé en connaît la règle —
 * quel rôle, et faut-il numéroter —, mais il ne parle que français : ses
 * libellés servent aux messages du serveur et aux tests. Un terrain affiché
 * en anglais y montrait « Aile 2 », et c'était le dernier endroit de
 * l'application à le faire.
 *
 * Le mot vient donc du dictionnaire et le numéro de la règle, recollés ici.
 * `WING` est le mot du futsal : à cinq, ce que le football à onze appelle un
 * milieu est une aile.
 */
export function useNomDePlace(): (
  playersPerTeam: number,
  slotId: string,
  formation?: string | null,
) => string {
  const L = useLibelles();

  return (playersPerTeam, slotId, formation) => {
    const nom = pitchSlotNaming(playersPerTeam, slotId, formation);
    // Une place absente de la formation : on rend son identifiant plutôt que
    // rien, pour que l'anomalie se voie au lieu de laisser un trou muet.
    if (!nom) return slotId;

    const mot = L.pitchRole[nom.word];
    return nom.index === null ? mot : `${mot} ${nom.index}`;
  };
}
