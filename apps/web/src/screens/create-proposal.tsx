import { useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  MIN_PROPOSAL_LEAD_DAYS,
  addDaysIso,
  eurToUno,
  type SchedulableModeId,
} from "@uno/shared";
import { cn } from "@/lib/cn.js";
import { notificationFeedback, tapFeedback } from "@/lib/native.js";
import { describeError, trpc } from "@/lib/trpc.js";
import { useOnline } from "@/lib/use-online.js";
import { Button, Field, Input, Select } from "@/components/ui/index.js";

/**
 * Création d'une proposition (CAL-003, CAL-004, CAL-005).
 *
 * Les créneaux proposés viennent du serveur, dérivés de la durée du mode : le
 * client n'invente aucun horaire. La date minimale est calculée à partir de
 * `MIN_PROPOSAL_LEAD_DAYS`, et le serveur la revalide de toute façon.
 */
export function CreateProposalSheet({
  initialDate,
  onClose,
  onCreated,
}: {
  initialDate: string;
  onClose: () => void;
  onCreated: (proposalId: number) => void;
}) {
  const online = useOnline();
  const config = trpc.proposals.config.useQuery();
  const create = trpc.proposals.create.useMutation();

  const today = new Date().toISOString().slice(0, 10);
  const earliest = addDaysIso(today, MIN_PROPOSAL_LEAD_DAYS);

  const [modeId, setModeId] = useState<SchedulableModeId>("league");
  const [venueId, setVenueId] = useState("");
  const [date, setDate] = useState(initialDate < earliest ? earliest : initialDate);
  const [slotStartHour, setSlotStartHour] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const modes = (config.data?.modes ?? []).filter((mode) => mode.schedulable);
  const venues = config.data?.venues ?? [];
  const selectedMode = modes.find((mode) => mode.id === modeId);

  const slots = useMemo(() => selectedMode?.slots ?? [], [selectedMode]);

  const canSubmit =
    online && venueId !== "" && slotStartHour !== null && date >= earliest;

  async function submit() {
    if (slotStartHour === null || !venueId) return;
    setError(null);
    setNotice(null);

    try {
      const result = await create.mutateAsync({
        date,
        slotStartHour,
        venueId,
        modeId,
      });
      await notificationFeedback();

      if (result.joinedExisting) {
        // CAL-005 : une session identique existait ; on y a été inscrit.
        setNotice("Une session identique existait déjà : vous y avez été inscrit.");
        setTimeout(() => onCreated(result.proposal.id), 1200);
        return;
      }
      onCreated(result.proposal.id);
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Créer une session"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-[520px] animate-rise overflow-y-auto rounded-t-3xl border-t border-border bg-background px-5 pt-4"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 1.5rem)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden />

        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Créer une session</h2>
          <button
            type="button"
            aria-label="Fermer"
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
          {notice && (
            <div
              role="status"
              className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent"
            >
              {notice}
            </div>
          )}

          {/* Mode */}
          <div>
            <p className="mb-2 text-sm font-medium text-muted">Mode de jeu</p>
            <div className="grid grid-cols-2 gap-2">
              {modes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    void tapFeedback();
                    setModeId(mode.id as SchedulableModeId);
                    setSlotStartHour(null);
                  }}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    modeId === mode.id
                      ? "border-accent bg-accent/10"
                      : "border-border bg-surface hover:bg-surface-raised",
                  )}
                >
                  <p className="text-sm font-semibold">{mode.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {mode.minParticipants} joueurs · {mode.durationHours} h
                  </p>
                  <p className="mt-1 text-xs font-medium text-accent">
                    {eurToUno(mode.priceEur)} UNO
                  </p>
                </button>
              ))}
            </div>
          </div>

          <Field label="Lieu" htmlFor="venue">
            <Select
              id="venue"
              value={venueId}
              onChange={(event) => setVenueId(event.target.value)}
            >
              <option value="">Choisir un lieu</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Date"
            htmlFor="proposalDate"
            hint={`Au moins ${MIN_PROPOSAL_LEAD_DAYS} jours à l'avance.`}
          >
            <Input
              id="proposalDate"
              type="date"
              min={earliest}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>

          {/* Créneaux issus du serveur */}
          <div>
            <p className="mb-2 text-sm font-medium text-muted">Créneau</p>
            <div className="grid grid-cols-2 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => {
                    void tapFeedback();
                    setSlotStartHour(slot.startHour);
                  }}
                  className={cn(
                    "min-h-[44px] rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                    slotStartHour === slot.startHour
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-surface text-foreground hover:bg-surface-raised",
                  )}
                  aria-pressed={slotStartHour === slot.startHour}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          </div>

          {!online && (
            <p className="rounded-xl bg-warning/10 px-4 py-3 text-xs text-warning">
              Vous êtes hors ligne : la création nécessite une connexion.
            </p>
          )}

          <Button
            variant="accent"
            fullWidth
            disabled={!canSubmit}
            loading={create.isPending}
            onClick={() => void submit()}
          >
            Créer la session
          </Button>
        </div>
      </div>
    </div>
  );
}
