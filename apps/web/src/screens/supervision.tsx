import { ShieldCheck } from "lucide-react";
import { Screen } from "@/components/layout/index.js";
import { SessionQueue } from "@/components/supervision/session-queue.js";
import { Card } from "@/components/ui/index.js";

/**
 * Écran de supervision (SUP-001).
 *
 * Ce que voit un superviseur qui n'est pas administrateur : sa file de
 * sessions à saisir, et rien d'autre de la console. Il travaille sur le même
 * composant et les mêmes routes que l'administration — une seule saisie
 * existe, avec les mêmes garanties.
 *
 * Sa file ne contient jamais les sessions qu'il a jouées ou arbitrées : le
 * serveur les en retire (SUP-001), pour que la règle se lise dans la liste
 * plutôt que dans un refus au dernier moment.
 */
export function SupervisionScreen() {
  return (
    <Screen title="Supervision" back backTo="/profil">
      <Card className="mb-4 flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        <p className="text-xs leading-relaxed text-muted">
          Vous saisissez les feuilles de match de la ligue. Le classement, les
          récompenses UNO et les montées de division en découlent
          automatiquement. Les sessions auxquelles vous avez participé ne vous
          sont pas proposées.
        </p>
      </Card>

      <SessionQueue />
    </Screen>
  );
}
