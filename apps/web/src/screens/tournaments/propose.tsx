import { useState } from "react";
import { X } from "lucide-react";
import {
  TOURNAMENT_DURATION_HOURS,
  TOURNAMENT_PROPOSAL_LEAD_DAYS,
  addDaysIso,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { useOnline } from "@/lib/use-online.js";
import { notificationFeedback, tapFeedback } from "@/lib/native.js";
import { useT } from "@/lib/i18n.js";
import { Button, Field, Input, Select } from "@/components/ui/index.js";

/**
 * Un club pose une date sur un format (TOUR-005, TOUR-006).
 *
 * C'est le calendrier des clubs, et il fonctionne à l'envers de celui des
 * joueurs : là-bas le mode fixe le prix et le joueur choisit le créneau ; ici
 * la ligue fixe le plateau et les prix, et le club choisit le jour et la
 * salle. Proposer engage aussitôt son club — un plateau que personne ne
 * défend ferait attendre le premier arrivant devant un club fantôme.
 *
 * Bâti en feuille, comme la création d'une session, parce que c'est le même
 * geste au même endroit du calendrier : rien ne justifierait qu'il se présente
 * autrement d'un onglet à l'autre.
 */
export function ProposeTournamentSheet({
  initialDate,
  initialFormatId,
  onClose,
  onCreated,
}: {
  initialDate: string;
  initialFormatId: number | null;
  onClose: () => void;
  onCreated: (tournamentId: number) => void;
}) {
  const t = useT();
  const online = useOnline();
  const utils = trpc.useUtils();
  const formats = trpc.tournaments.formats.useQuery();
  const venues = trpc.proposals.venues.useQuery();
  const propose = trpc.tournaments.propose.useMutation();

  const today = new Date().toISOString().slice(0, 10);
  const earliest = addDaysIso(today, TOURNAMENT_PROPOSAL_LEAD_DAYS);

  const [formatId, setFormatId] = useState(
    initialFormatId === null ? "" : String(initialFormatId),
  );
  const [date, setDate] = useState(
    initialDate < earliest ? earliest : initialDate,
  );
  const [hour, setHour] = useState("18");
  const [venueId, setVenueId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const chosen = (formats.data ?? []).find(
    (row) => String(row.id) === formatId,
  );
  const canSubmit =
    online && formatId !== "" && venueId !== "" && date >= earliest;

  async function submit() {
    setError(null);
    try {
      const created = await propose.mutateAsync({
        formatId: Number(formatId),
        date,
        slotStartHour: Number(hour),
        venueId,
      });
      /*
       * Trois lectures deviennent fausses à l'instant où la proposition
       * part : le calendrier ne contient pas encore le nouveau tournoi, le
       * compte de plateaux ouverts du format a monté d'un, et la caisse du
       * club vient de séquestrer le droit d'engagement. Les invalider ici
       * plutôt qu'à l'écran d'où l'on vient : c'est ce geste-ci qui les
       * périme, et l'appelant n'a pas à le savoir.
       */
      await Promise.all([
        utils.tournaments.list.invalidate(),
        utils.tournaments.formats.invalidate(),
        utils.squads.mine.invalidate(),
      ]);
      await notificationFeedback();
      onCreated(created.id);
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("tournament.propose")}
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-[520px] animate-rise overflow-y-auto rounded-t-3xl border-t border-border bg-background px-5 pt-4"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 1.5rem)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full bg-border"
          aria-hidden
        />

        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("tournament.propose")}</h2>
          <button
            type="button"
            aria-label={t("tournament.close")}
            onClick={() => {
              void tapFeedback();
              onClose();
            }}
            className="flex size-11 items-center justify-center rounded-full text-muted hover:text-foreground active:opacity-70"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-red-200"
            >
              {error}
            </div>
          )}

          <Field label={t("tournament.format")} htmlFor="propose-format">
            <Select
              id="propose-format"
              value={formatId}
              onChange={(event) => setFormatId(event.target.value)}
            >
              <option value="">{t("tournament.chooseFormat")}</option>
              {(formats.data ?? []).map((format) => (
                <option key={format.id} value={format.id}>
                  {t("tournament.formatOption", {
                    name: format.name,
                    size: format.size,
                  })}
                </option>
              ))}
            </Select>
          </Field>

          {chosen && (
            <p className="text-xs leading-relaxed text-muted">
              {t("tournament.formatNote", {
                size: chosen.size,
                hours: TOURNAMENT_DURATION_HOURS,
                fee: chosen.entryFeeUno,
                prize: chosen.prizeUno,
              })}
              {chosen.openCount === 1 && t("tournament.formatOpenOne")}
              {chosen.openCount > 1 &&
                t("tournament.formatOpenMany", { count: chosen.openCount })}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("tournament.date")} htmlFor="propose-date">
              <Input
                id="propose-date"
                type="date"
                min={earliest}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <Field label={t("tournament.slot")} htmlFor="propose-hour">
              <Select
                id="propose-hour"
                value={hour}
                onChange={(event) => setHour(event.target.value)}
              >
                {Array.from({ length: 15 }, (_, index) => index + 8).map(
                  (value) => (
                    <option key={value} value={value}>
                      {String(value).padStart(2, "0")}:00 –{" "}
                      {String(value + TOURNAMENT_DURATION_HOURS).padStart(
                        2,
                        "0",
                      )}
                      :00
                    </option>
                  ),
                )}
              </Select>
            </Field>
          </div>

          {/*
            Le délai est annoncé avant l'erreur, pas après : l'attribut `min`
            bloque déjà le sélecteur natif, mais un club qui tape la date à la
            main mérite de savoir pourquoi elle est refusée.
          */}
          <p className="text-xs text-muted">
            {t("tournament.leadNote", {
              days: TOURNAMENT_PROPOSAL_LEAD_DAYS,
              date: earliest.split("-").reverse().join("/"),
            })}
          </p>

          <Field label={t("tournament.venue")} htmlFor="propose-venue">
            <Select
              id="propose-venue"
              value={venueId}
              onChange={(event) => setVenueId(event.target.value)}
            >
              <option value="">{t("tournament.chooseVenue")}</option>
              {(venues.data ?? []).map((venue) => (
                <option key={venue.id} value={venue.slug}>
                  {venue.name}
                </option>
              ))}
            </Select>
          </Field>

          <Button
            variant="accent"
            fullWidth
            loading={propose.isPending}
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {t("tournament.proposeAndJoin")}
          </Button>
        </div>
      </div>
    </div>
  );
}
