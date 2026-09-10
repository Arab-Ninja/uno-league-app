import { useState } from "react";
import { AlertTriangle, CheckCircle2, Send } from "lucide-react";
import { publicationBlockers, type TrackerSheet } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { Button, Card } from "@/components/ui/index.js";

/**
 * Publication d'une feuille vers le classement officiel (TRACK-001).
 *
 * Ce que la publication engage est écrit noir sur blanc avant le geste :
 * statistiques de carrière, XP, distinctions, montées et descentes. C'est
 * irréversible du côté des joueurs, donc l'écran n'en fait pas un bouton
 * anodin.
 *
 * Les récompenses en UNO sont décochées par défaut. Une feuille saisie en
 * visionnage relève souvent une séance encaissée hors de l'application, ou
 * rattrape un historique : créditer de la monnaie interne dans ces cas serait
 * un cadeau involontaire, et un crédit ne se reprend pas.
 */
export function PublishPanel({
  sheet,
  onChanged,
}: {
  sheet: TrackerSheet;
  onChanged: (next: TrackerSheet) => void;
}) {
  const utils = trpc.useUtils();
  const publish = trpc.tracker.publish.useMutation();
  const [awardUno, setAwardUno] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (sheet.session.status === "published") {
    return (
      <Card className="space-y-2">
        <p className="flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="size-4" aria-hidden />
          Feuille publiée
        </p>
        <p className="text-[11px] text-muted">
          Ses statistiques sont comptabilisées dans la session #
          {sheet.session.publishedProposalId}. La feuille est désormais figée.
        </p>
      </Card>
    );
  }

  const warnings = publicationBlockers(sheet);
  const blockers = warnings.filter((warning) => warning.level === "blocking");
  const advisories = warnings.filter((warning) => warning.level === "warning");

  return (
    <Card className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Publier au classement
      </h2>

      {done && (
        <p className="rounded-lg bg-success/15 px-2.5 py-2 text-[12px] text-emerald-300">
          {done}
        </p>
      )}

      {blockers.map((warning, index) => (
        <p
          key={`blocker-${index}`}
          className="flex items-start gap-1.5 rounded-lg bg-error/15 px-2.5 py-2 text-[11px] text-red-200"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {warning.message}
        </p>
      ))}

      {advisories.map((warning, index) => (
        <p
          key={`advisory-${index}`}
          className="rounded-lg bg-warning/10 px-2.5 py-2 text-[11px] text-amber-200"
        >
          {warning.message}
        </p>
      ))}

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-error/15 px-2.5 py-2 text-[11px] text-red-200"
        >
          {error}
        </p>
      )}

      <label className="flex items-start gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={awardUno}
          onChange={(event) => setAwardUno(event.target.checked)}
          className="mt-0.5 size-4 accent-accent"
        />
        <span>
          Verser les récompenses UNO
          <span className="block text-[11px] text-muted">
            Participation, meilleure équipe et distinctions. À cocher seulement
            si cette séance n'a pas déjà été récompensée.
          </span>
        </span>
      </label>

      <p className="text-[11px] text-muted">
        La publication reporte les statistiques sur les cartes joueur, attribue
        l'XP, désigne l'homme de la session et applique les montées comme les
        descentes de division. La feuille devient ensuite non modifiable.
      </p>

      <Button
        variant="accent"
        fullWidth
        icon={<Send className="size-4" aria-hidden />}
        disabled={blockers.length > 0}
        loading={publish.isPending}
        onClick={async () => {
          setError(null);
          try {
            const result = await publish.mutateAsync({
              sessionId: sheet.session.id,
              awardUno,
            });
            setDone(
              `${result.matchesRecorded} match(s) publiés · ${result.promoted} montée(s) · ` +
                `${result.relegated} descente(s).`,
            );
            const refreshed = await utils.tracker.get.fetch({
              sessionId: sheet.session.id,
            });
            onChanged(refreshed);
            await utils.ranking.invalidate();
            await utils.proposals.list.invalidate();
          } catch (caught) {
            setError(describeError(caught).message);
          }
        }}
      >
        Publier la session
      </Button>
    </Card>
  );
}
