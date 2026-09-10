import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ClipboardList, Film, Plus } from "lucide-react";
import { DEFAULT_TIMEZONE, DIVISIONS, SLOT_DAY_START_HOUR, todayIso } from "@uno/shared";
import { cn } from "@/lib/cn.js";
import { describeError, trpc } from "@/lib/trpc.js";
import { Async } from "@/components/ui/async.js";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
} from "@/components/ui/index.js";

/**
 * Feuilles de saisie (TRACK-001).
 *
 * Une feuille se crée en quelques secondes et sans réservation : c'est tout
 * l'intérêt. Deux chemins mènent au même écran de saisie — reprendre une
 * session déjà réservée dans l'application, dont la composition est connue,
 * ou partir d'une séance dont on n'a que l'enregistrement.
 */
export function TrackerSessionList() {
  const navigate = useNavigate();
  const sessions = trpc.tracker.list.useQuery();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4 px-3 py-4 sm:px-4">
      <header className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-lg font-semibold tracking-tight">
            Saisie en visionnage
          </h1>
          <p className="text-xs text-muted">
            Relevez les statistiques d'une séance en regardant l'enregistrement.
          </p>
        </div>
        <Button
          variant="accent"
          icon={<Plus className="size-4" aria-hidden />}
          onClick={() => setCreating((value) => !value)}
        >
          Nouvelle feuille
        </Button>
      </header>

      {creating && (
        <CreateSessionForm
          onCreated={(sessionId) => {
            setCreating(false);
            navigate(`/visionnage/${sessionId}`);
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      <Async query={sessions}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState
              title="Aucune feuille de saisie"
              description="Créez-en une, ouvrez la vidéo du match, et relevez les actions au fil du visionnage."
              icon={<ClipboardList className="size-6" aria-hidden />}
            />
          ) : (
            <ul className="space-y-2">
              {rows.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/visionnage/${session.id}`)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-card border border-border/60 bg-surface px-4 py-3 text-left",
                      "transition-colors hover:border-accent/50",
                    )}
                  >
                    <Film className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {session.label}
                      </span>
                      <span className="block text-xs text-muted">
                        {session.localDate}
                        {session.venueName ? ` · ${session.venueName}` : ""}
                        {session.division ? ` · ${session.division}` : ""} ·{" "}
                        {session.participantCount} joueurs ·{" "}
                        {session.matchCount} match(s) · {session.eventCount} actions
                      </span>
                    </span>
                    {session.status === "published" && (
                      <CheckCircle2
                        className="size-4 shrink-0 text-emerald-400"
                        aria-label="Publiée"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )
        }
      </Async>
    </div>
  );
}

function CreateSessionForm({
  onCreated,
  onCancel,
}: {
  onCreated: (sessionId: number) => void;
  onCancel: () => void;
}) {
  const create = trpc.tracker.create.useMutation();
  const venues = trpc.admin.venues.useQuery();
  const attachable = trpc.tracker.attachable.useQuery();

  const [label, setLabel] = useState("");
  const [localDate, setLocalDate] = useState(() => todayIso(DEFAULT_TIMEZONE));
  const [slotStartHour, setSlotStartHour] = useState(20);
  const [venueId, setVenueId] = useState("");
  const [division, setDivision] = useState("");
  const [proposalId, setProposalId] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold">Nouvelle feuille</h2>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-xs text-red-200"
        >
          {error}
        </p>
      )}

      {(attachable.data?.length ?? 0) > 0 && (
        <Field
          label="Reprendre une session réservée"
          htmlFor="tracker-proposal"
          hint="Le lieu, la date, la division et les joueurs inscrits sont repris automatiquement."
        >
          <Select
            id="tracker-proposal"
            value={proposalId}
            onChange={(event) => setProposalId(event.target.value)}
          >
            <option value="">Séance libre, sans réservation</option>
            {(attachable.data ?? []).map((proposal) => (
              <option key={proposal.id} value={proposal.id}>
                {proposal.localDate} · {proposal.venueName}
                {proposal.division ? ` · ${proposal.division}` : ""}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Nom de la feuille" htmlFor="tracker-label">
        <Input
          id="tracker-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Mardi soir · Fit Five"
        />
      </Field>

      {proposalId === "" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date" htmlFor="tracker-date">
              <Input
                id="tracker-date"
                type="date"
                value={localDate}
                onChange={(event) => setLocalDate(event.target.value)}
              />
            </Field>
            <Field label="Heure" htmlFor="tracker-hour">
              <Select
                id="tracker-hour"
                value={slotStartHour}
                onChange={(event) => setSlotStartHour(Number(event.target.value))}
              >
                {Array.from({ length: 24 - SLOT_DAY_START_HOUR }, (_, index) => {
                  const hour = SLOT_DAY_START_HOUR + index;
                  return (
                    <option key={hour} value={hour}>
                      {String(hour).padStart(2, "0")}:00
                    </option>
                  );
                })}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Salle" htmlFor="tracker-venue">
              <Select
                id="tracker-venue"
                value={venueId}
                onChange={(event) => setVenueId(event.target.value)}
              >
                <option value="">Non précisée</option>
                {(venues.data ?? [])
                  .filter((venue) => venue.active)
                  .map((venue) => (
                    <option key={venue.slug} value={venue.slug}>
                      {venue.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field
              label="Division"
              htmlFor="tracker-division"
              hint="Requise pour publier au classement."
            >
              <Select
                id="tracker-division"
                value={division}
                onChange={(event) => setDivision(event.target.value)}
              >
                <option value="">À définir</option>
                {DIVISIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" onClick={onCancel} className="flex-1">
          Annuler
        </Button>
        <Button
          variant="accent"
          className="flex-1"
          loading={create.isPending}
          disabled={label.trim().length === 0}
          onClick={async () => {
            setError(null);
            try {
              const sheet = await create.mutateAsync({
                label: label.trim(),
                localDate,
                slotStartHour,
                modeId: "league",
                ...(venueId ? { venueId } : {}),
                ...(division ? { division: division as "D1" | "D2" | "D3" } : {}),
                ...(proposalId ? { proposalId: Number(proposalId) } : {}),
              });
              onCreated(sheet.session.id);
            } catch (caught) {
              setError(describeError(caught).message);
            }
          }}
        >
          Créer et saisir
        </Button>
      </div>
    </Card>
  );
}
