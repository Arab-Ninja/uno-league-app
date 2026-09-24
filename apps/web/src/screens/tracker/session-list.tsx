import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Film,
  Plus,
} from "lucide-react";
import {
  DEFAULT_TIMEZONE,
  DIVISIONS,
  SLOT_DAY_START_HOUR,
  todayIso,
} from "@uno/shared";
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
import { useT, useNomDeMode } from "@/lib/i18n.js";

/**
 * Feuilles de saisie (TRACK-001).
 *
 * Une feuille se crée en quelques secondes et sans réservation : c'est tout
 * l'intérêt. Deux chemins mènent au même écran de saisie — reprendre une
 * session déjà réservée dans l'application, dont la composition est connue,
 * ou partir d'une séance dont on n'a que l'enregistrement.
 */
export function TrackerSessionList() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const sessions = trpc.tracker.list.useQuery();
  const [creating, setCreating] = useState(false);

  /**
   * Sortie de l'écran.
   *
   * Cet écran ne porte pas la barre d'onglets — la saisie a besoin de toute
   * la largeur — il doit donc offrir sa propre sortie. Et `navigate(-1)` ne
   * suffit pas : ouvert directement, il n'y a rien derrière, et l'utilisateur
   * se retrouvait enfermé.
   */
  function leave() {
    if (location.key === "default") navigate("/profil", { replace: true });
    else navigate(-1);
  }

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4 px-3 py-4 sm:px-4">
      <button
        type="button"
        onClick={leave}
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("tracker.quit")}
      </button>

      <header className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-lg font-semibold tracking-tight">
            {t("tracker.title")}
          </h1>
          <p className="text-xs text-muted">{t("tracker.listLead")}</p>
        </div>
        <Button
          variant="accent"
          icon={<Plus className="size-4" aria-hidden />}
          onClick={() => setCreating((value) => !value)}
        >
          {t("tracker.newSheet")}
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
              title={t("tracker.emptyTitle")}
              description={t("tracker.emptyBody")}
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
                        {session.division
                          ? ` · ${session.division}`
                          : ""} ·{" "}
                        {t("tracker.listCounts", {
                          players: session.participantCount,
                          matches: session.matchCount,
                          events: session.eventCount,
                        })}
                      </span>
                    </span>
                    {session.status === "published" && (
                      <CheckCircle2
                        className="size-4 shrink-0 text-emerald-400"
                        aria-label={t("tracker.published")}
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
  const t = useT();
  const nomDeMode = useNomDeMode();
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
      <h2 className="text-sm font-semibold">{t("tracker.newSheet")}</h2>

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
          label={t("tracker.attach")}
          htmlFor="tracker-proposal"
          hint={t("tracker.attachHint")}
        >
          <Select
            id="tracker-proposal"
            value={proposalId}
            onChange={(event) => setProposalId(event.target.value)}
          >
            <option value="">{t("tracker.freeSession")}</option>
            {(attachable.data ?? []).map((proposal) => (
              <option key={proposal.id} value={proposal.id}>
                {nomDeMode(proposal.modeId)} · {proposal.localDate} ·{" "}
                {proposal.venueName}
                {proposal.division ? ` · ${proposal.division}` : ""}
                {/* Un match SQUAD est créé avant d'être joué : le dire évite
                    de saisir une rencontre qui n'a pas encore eu lieu. */}
                {new Date(proposal.startsAtUtc).getTime() > Date.now()
                  ? t("tracker.upcoming")
                  : ""}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label={t("tracker.sheetName")} htmlFor="tracker-label">
        <Input
          id="tracker-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={t("tracker.sheetNamePlaceholder")}
        />
      </Field>

      {proposalId === "" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("tracker.date")} htmlFor="tracker-date">
              <Input
                id="tracker-date"
                type="date"
                value={localDate}
                onChange={(event) => setLocalDate(event.target.value)}
              />
            </Field>
            <Field label={t("tracker.hour")} htmlFor="tracker-hour">
              <Select
                id="tracker-hour"
                value={slotStartHour}
                onChange={(event) =>
                  setSlotStartHour(Number(event.target.value))
                }
              >
                {Array.from(
                  { length: 24 - SLOT_DAY_START_HOUR },
                  (_, index) => {
                    const hour = SLOT_DAY_START_HOUR + index;
                    return (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, "0")}:00
                      </option>
                    );
                  },
                )}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label={t("tracker.venue")} htmlFor="tracker-venue">
              <Select
                id="tracker-venue"
                value={venueId}
                onChange={(event) => setVenueId(event.target.value)}
              >
                <option value="">{t("tracker.venueUnset")}</option>
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
              label={t("tracker.division")}
              htmlFor="tracker-division"
              hint={t("tracker.divisionHint")}
            >
              <Select
                id="tracker-division"
                value={division}
                onChange={(event) => setDivision(event.target.value)}
              >
                <option value="">{t("tracker.divisionUnset")}</option>
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
          {t("common.cancel")}
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
                ...(division
                  ? { division: division as "D1" | "D2" | "D3" }
                  : {}),
                ...(proposalId ? { proposalId: Number(proposalId) } : {}),
              });
              onCreated(sheet.session.id);
            } catch (caught) {
              setError(describeError(caught).message);
            }
          }}
        >
          {t("tracker.createAndEnter")}
        </Button>
      </div>
    </Card>
  );
}
