import { SessionQueue } from "@/components/supervision/session-queue.js";
import { AdminRoster } from "./roster.js";
import { AdminProposalPurge } from "./purge.js";

/**
 * L'onglet Sessions, de bout en bout.
 *
 * Composer d'abord, saisir ensuite : c'est l'ordre dans lequel une session
 * existe. Les deux vivaient jusqu'ici dans deux endroits — la file de saisie
 * ici, la création dans le calendrier des joueurs —, ce qui obligeait à sortir
 * de la console pour ouvrir la séance qu'on venait y chercher.
 */
export function AdminSessions() {
  return (
    <div className="space-y-6">
      <AdminRoster />
      <SessionQueue />
      {/*
        La suppression vient en dernier, et c'est délibéré : on descend vers
        elle. Placée en tête, elle serait la première chose qu'on voit en
        ouvrant l'onglet — mauvaise invitation pour l'unique geste irréversible
        de la console.
      */}
      <AdminProposalPurge />
    </div>
  );
}
