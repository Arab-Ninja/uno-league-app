import { SessionQueue } from "@/components/supervision/session-queue.js";
import { AdminRoster } from "./roster.js";

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
    </div>
  );
}
