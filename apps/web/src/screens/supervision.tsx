import { Film, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Screen } from "@/components/layout/index.js";
import { Card } from "@/components/ui/index.js";

/**
 * Écran de supervision (SUP-001, SUP-003).
 *
 * Ce que voit un superviseur qui n'est pas administrateur : **la saisie en
 * visionnage, et rien d'autre**.
 *
 * La file des sessions à saisir n'y figure plus. Les deux gestes n'engagent
 * pas la même chose : relever des actions en regardant un enregistrement
 * produit une feuille, que la publication soumet ensuite à ses propres
 * contrôles ; retoucher une session déjà en base réécrit directement le
 * classement, les récompenses et les divisions. Le second reste à
 * l'administration.
 *
 * L'écran ne fait que refléter cette règle : c'est le serveur qui la tient,
 * et il refuse quoi qu'affiche l'interface.
 */
export function SupervisionScreen() {
  const navigate = useNavigate();

  return (
    <Screen title="Supervision" back backTo="/profil">
      <Card className="mb-4 flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        <p className="text-xs leading-relaxed text-muted">
          Vous relevez les statistiques des séances à partir de leur
          enregistrement. Une fois la feuille publiée, le classement, les
          récompenses UNO et les montées de division en découlent
          automatiquement. Les séances auxquelles vous avez participé ne vous
          sont pas proposées.
        </p>
      </Card>

      <button
        type="button"
        onClick={() => navigate("/visionnage")}
        className="flex w-full items-start gap-3 rounded-card border border-accent/40 bg-accent/10 px-4 py-3 text-left"
      >
        <Film className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        <span>
          <span className="block text-sm font-medium">Saisie en visionnage</span>
          <span className="block text-xs text-muted">
            Relevez les actions au fil de l'enregistrement plutôt que de
            remplir un tableau de mémoire. Le score, les passes et les buts
            encaissés s'en déduisent.
          </span>
        </span>
      </button>
    </Screen>
  );
}
