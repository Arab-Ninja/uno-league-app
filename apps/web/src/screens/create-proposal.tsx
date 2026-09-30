import { useMemo, useState } from "react";
import { Globe2, Lock, X } from "lucide-react";
import {
  addDaysIso,
  CUSTOM_MATCH,
  eurToUno,
  MIN_PROPOSAL_LEAD_DAYS,
  modeAllowsVisibility,
  PRIVATE_MODE_IDS,
  PUBLIC_MODE_IDS,
  venuesForMode,
  type CustomMatchDuration,
  type ProposalVisibility,
  type SchedulableModeId,
} from "@uno/shared";
import { cn } from "@/lib/cn.js";
import { useLibelles, useNomDeMode, useT, type Traduire } from "@/lib/i18n.js";
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
 *
 * **Publique ou privée** (PRIV-001). Une séance privée n'apparaît pas au
 * calendrier : seuls les invités de l'organisateur la voient. Elle se joue en
 * match amical ou en football — jamais en UNO League —, ou en **match
 * personnalisé** (PRIV-003) : lieu libre, heure au quart d'heure, et tout ce
 * qui touche à l'argent se règle entre les joueurs, hors de l'application.
 */
export function CreateProposalSheet({
  initialDate,
  onClose,
  onCreated,
}: {
  initialDate: string;
  onClose: () => void;
  /** `invite` : la séance est privée, la feuille d'invitation doit suivre. */
  onCreated: (proposalId: number, options: { invite: boolean }) => void;
}) {
  const t = useT();
  const nomDeMode = useNomDeMode();
  const L = useLibelles();
  const online = useOnline();
  const config = trpc.proposals.config.useQuery();
  const create = trpc.proposals.create.useMutation();
  const createCustom = trpc.proposals.createCustom.useMutation();

  const today = new Date().toISOString().slice(0, 10);
  const earliest = addDaysIso(today, MIN_PROPOSAL_LEAD_DAYS);

  const [visibility, setVisibility] = useState<ProposalVisibility>("public");
  const [modeId, setModeId] = useState<SchedulableModeId>("league");
  const [venueId, setVenueId] = useState("");
  const [date, setDate] = useState(
    initialDate < earliest ? earliest : initialDate,
  );
  const [slotStartHour, setSlotStartHour] = useState<number | null>(null);
  const [playersPerTeam, setPlayersPerTeam] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Le match personnalisé : ce que le calendrier ne sait pas fournir.
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState<CustomMatchDuration>(60);
  const [priceTotal, setPriceTotal] = useState("");
  const [pricePerPlayer, setPricePerPlayer] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  /*
   * Un mode fermé ne s'affiche pas (MODE-003). Le serveur le refuse aussi —
   * le drapeau ferme les routes autant que les écrans — mais proposer un
   * bouton qui échoue serait une promesse en l'air.
   */
  const allowed: readonly string[] =
    visibility === "public" ? PUBLIC_MODE_IDS : PRIVATE_MODE_IDS;
  const modes = (config.data?.modes ?? []).filter(
    (mode) =>
      mode.schedulable &&
      allowed.includes(mode.id) &&
      (mode.id !== "bigfoot" || config.data?.features.bigfoot === true),
  );
  const selectedMode = modes.find((mode) => mode.id === modeId);
  const isCustom = modeId === "custom";

  /*
   * Les terrains réservés à un mode ne s'offrent qu'à lui, et un mode qui en
   * a ne voit que ceux-là (MODE-003). La règle vit dans le paquet partagé :
   * le serveur applique la même, et deux versions d'une même règle finissent
   * toujours par diverger.
   */
  const venues = venuesForMode(config.data?.venues ?? [], modeId);

  const slots = useMemo(() => selectedMode?.slots ?? [], [selectedMode]);

  /*
   * La date la plus proche dépend du mode : deux jours d'ordinaire, quelques
   * heures pour un terrain gratuit. Le champ de date ne connaît que les
   * jours, donc un mode à délai court accepte aujourd'hui — le serveur, lui,
   * vérifie l'heure exacte.
   */
  const minDate = selectedMode?.minLeadHours !== undefined ? today : earliest;

  const needsTeamSize = selectedMode?.teamSizeRange !== undefined;

  const totalCents = parseEuros(priceTotal);
  const perPlayerCents = parseEuros(pricePerPlayer);

  const canSubmit =
    online &&
    date >= minDate &&
    (!needsTeamSize || playersPerTeam !== null) &&
    (isCustom
      ? venueName.trim().length >= 2 &&
        venueAddress.trim().length >= 5 &&
        startTime !== "" &&
        totalCents !== false &&
        perPlayerCents !== false
      : venueId !== "" && slotStartHour !== null);

  function pickMode(next: SchedulableModeId) {
    const mode = modes.find((candidate) => candidate.id === next);
    setModeId(next);
    setSlotStartHour(null);
    // Le lieu et l'effectif dépendent du mode : les garder ferait soumettre
    // un terrain que le nouveau mode refuse.
    setVenueId("");
    setPlayersPerTeam(mode?.teamSizeRange ? mode.teamSizeRange.min : null);
  }

  function pickVisibility(next: ProposalVisibility) {
    void tapFeedback();
    setVisibility(next);
    // L'UNO League ne se joue pas en privé, le match personnalisé ne se
    // joue qu'en privé : un mode que l'autre côté refuse cède sa place.
    if (!modeAllowsVisibility(modeId, next)) {
      pickMode(next === "public" ? "league" : "friendly");
    }
  }

  async function submit() {
    setError(null);
    setNotice(null);

    try {
      if (isCustom) {
        if (playersPerTeam === null || totalCents === false) return;
        if (perPlayerCents === false) return;
        const created = await createCustom.mutateAsync({
          date,
          startTime,
          durationMinutes: duration,
          playersPerTeam,
          venueName: venueName.trim(),
          venueAddress: venueAddress.trim(),
          ...(totalCents !== null ? { priceTotalCents: totalCents } : {}),
          ...(perPlayerCents !== null
            ? { pricePerPlayerCents: perPlayerCents }
            : {}),
          ...(paymentNote.trim() ? { paymentNote: paymentNote.trim() } : {}),
        });
        await notificationFeedback();
        onCreated(created.id, { invite: true });
        return;
      }

      if (slotStartHour === null || !venueId) return;
      const result = await create.mutateAsync({
        date,
        slotStartHour,
        venueId,
        modeId,
        visibility,
        ...(playersPerTeam !== null ? { playersPerTeam } : {}),
      });
      await notificationFeedback();

      if (result.joinedExisting) {
        // CAL-005 : une session identique existait ; on y a été inscrit.
        setNotice(t("createProposal.joinedExisting"));
        setTimeout(
          () => onCreated(result.proposal.id, { invite: false }),
          1200,
        );
        return;
      }
      onCreated(result.proposal.id, { invite: visibility === "private" });
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("createProposal.title")}
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
          <h2 className="text-lg font-semibold">{t("createProposal.title")}</h2>
          <button
            type="button"
            aria-label={t("createProposal.close")}
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

          {/* Publique ou privée (PRIV-001) */}
          <div>
            <p className="mb-2 text-sm font-medium text-muted">
              {t("createProposal.visibility")}
            </p>
            <div
              className="grid grid-cols-2 gap-2"
              role="radiogroup"
              aria-label={t("createProposal.visibility")}
            >
              {(["public", "private"] as const).map((option) => {
                const Icon = option === "public" ? Globe2 : Lock;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={visibility === option}
                    onClick={() => pickVisibility(option)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors",
                      visibility === option
                        ? "border-accent bg-accent/10"
                        : "border-border bg-surface hover:bg-surface-raised",
                    )}
                  >
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <Icon className="size-4" aria-hidden />
                      {t(
                        option === "public"
                          ? "createProposal.public"
                          : "createProposal.private",
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted">
                      {t(
                        option === "public"
                          ? "createProposal.publicHint"
                          : "createProposal.privateHint",
                      )}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode */}
          <div>
            <p className="mb-2 text-sm font-medium text-muted">
              {t("createProposal.mode")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {modes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    void tapFeedback();
                    pickMode(mode.id as SchedulableModeId);
                  }}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    modeId === mode.id
                      ? "border-accent bg-accent/10"
                      : "border-border bg-surface hover:bg-surface-raised",
                  )}
                >
                  <p className="text-sm font-semibold">{nomDeMode(mode.id)}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {mode.id === "custom"
                      ? t("createProposal.outsideApp")
                      : `${
                          mode.teamSizeRange
                            ? t("createProposal.perTeam", {
                                min: mode.teamSizeRange.min,
                                max: mode.teamSizeRange.max,
                              })
                            : t("createProposal.players", {
                                count: mode.minParticipants,
                              })
                        } · ${mode.durationHours} h`}
                  </p>
                  <p className="mt-1 text-xs font-medium text-accent">
                    {mode.priceEur === 0
                      ? t("modes.free")
                      : `${eurToUno(mode.priceEur)} UNO`}
                  </p>
                </button>
              ))}
            </div>
            {selectedMode && (
              <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
                {L.gameModeHowTo[selectedMode.id]}
              </p>
            )}
            {visibility === "private" && !isCustom && (
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                {t("createProposal.privateLead")}
              </p>
            )}
          </div>

          {isCustom ? (
            <>
              <Field
                label={t("createProposal.venueName")}
                htmlFor="customVenueName"
              >
                <Input
                  id="customVenueName"
                  value={venueName}
                  maxLength={80}
                  placeholder={t("createProposal.venueNamePlaceholder")}
                  onChange={(event) => setVenueName(event.target.value)}
                />
              </Field>
              <Field
                label={t("createProposal.address")}
                htmlFor="customVenueAddress"
              >
                <Input
                  id="customVenueAddress"
                  value={venueAddress}
                  maxLength={200}
                  autoComplete="street-address"
                  placeholder={t("createProposal.addressPlaceholder")}
                  onChange={(event) => setVenueAddress(event.target.value)}
                />
              </Field>
            </>
          ) : (
            <Field label={t("createProposal.venue")} htmlFor="venue">
              <Select
                id="venue"
                value={venueId}
                onChange={(event) => setVenueId(event.target.value)}
              >
                <option value="">{t("createProposal.chooseVenue")}</option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {selectedMode?.teamSizeRange && (
            <div>
              <p className="mb-2 text-sm font-medium text-muted">
                {t("createProposal.playersPerTeam")}
              </p>
              <div className="flex flex-wrap gap-2">
                {Array.from(
                  {
                    length:
                      selectedMode.teamSizeRange.max -
                      selectedMode.teamSizeRange.min +
                      1,
                  },
                  (_, index) => selectedMode.teamSizeRange!.min + index,
                ).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      void tapFeedback();
                      setPlayersPerTeam(size);
                    }}
                    className={cn(
                      "min-w-[64px] rounded-xl border px-3 py-2 text-center transition-colors",
                      playersPerTeam === size
                        ? "border-accent bg-accent/10"
                        : "border-border bg-surface hover:bg-surface-raised",
                    )}
                  >
                    <span className="text-sm font-semibold">
                      {t("createProposal.versus", { size })}
                    </span>
                  </button>
                ))}
              </div>
              {/* Le total dit ce qu'il faudra réunir : « 8 contre 8 » se lit
                  bien, « seize joueurs » se décide mieux. */}
              {playersPerTeam !== null && (
                <p className="mt-2 text-xs text-muted">
                  {t("createProposal.confirmsAt", {
                    count: playersPerTeam * 2,
                  })}
                </p>
              )}
            </div>
          )}

          <Field
            label={t("createProposal.date")}
            htmlFor="proposalDate"
            hint={
              isCustom
                ? undefined
                : selectedMode?.minLeadHours !== undefined
                  ? t("createProposal.leadHours", {
                      hours: selectedMode.minLeadHours,
                    })
                  : t("createProposal.leadDays", {
                      days: MIN_PROPOSAL_LEAD_DAYS,
                    })
            }
          >
            <Input
              id="proposalDate"
              type="date"
              min={minDate}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>

          {isCustom ? (
            <>
              {/* L'heure au quart d'heure : un terrain d'entreprise ne
                  s'aligne pas sur la grille des salles partenaires. */}
              <Field
                label={t("createProposal.startTime")}
                htmlFor="customStartTime"
                hint={t("createProposal.startTimeHint")}
              >
                <Select
                  id="customStartTime"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                >
                  <option value="">{t("createProposal.chooseTime")}</option>
                  {QUARTER_HOURS.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </Select>
              </Field>

              <div>
                <p className="mb-2 text-sm font-medium text-muted">
                  {t("createProposal.duration")}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {CUSTOM_MATCH.durationsMinutes.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      aria-pressed={duration === minutes}
                      onClick={() => {
                        void tapFeedback();
                        setDuration(minutes);
                      }}
                      className={cn(
                        "min-h-[44px] rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                        duration === minutes
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-surface text-foreground hover:bg-surface-raised",
                      )}
                    >
                      {formatDuration(t, minutes)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Les prix ne sont qu'une information : l'application n'en
                  encaisse aucun (PRIV-003). */}
              <div>
                <p className="mb-2 text-sm font-medium text-muted">
                  {t("createProposal.prices")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label={t("createProposal.priceTotal")}
                    htmlFor="customPriceTotal"
                    error={
                      totalCents === false
                        ? t("createProposal.priceInvalid")
                        : undefined
                    }
                  >
                    <Input
                      id="customPriceTotal"
                      inputMode="decimal"
                      value={priceTotal}
                      invalid={totalCents === false}
                      placeholder="0"
                      onChange={(event) => setPriceTotal(event.target.value)}
                    />
                  </Field>
                  <Field
                    label={t("createProposal.pricePerPlayer")}
                    htmlFor="customPricePerPlayer"
                    error={
                      perPlayerCents === false
                        ? t("createProposal.priceInvalid")
                        : undefined
                    }
                  >
                    <Input
                      id="customPricePerPlayer"
                      inputMode="decimal"
                      value={pricePerPlayer}
                      invalid={perPlayerCents === false}
                      placeholder="0"
                      onChange={(event) =>
                        setPricePerPlayer(event.target.value)
                      }
                    />
                  </Field>
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {t("createProposal.priceHint")}
                </p>
              </div>

              <Field
                label={t("createProposal.paymentNote")}
                htmlFor="customPaymentNote"
              >
                <textarea
                  id="customPaymentNote"
                  value={paymentNote}
                  maxLength={300}
                  rows={3}
                  placeholder={t("createProposal.paymentNotePlaceholder")}
                  onChange={(event) => setPaymentNote(event.target.value)}
                  className="w-full resize-none rounded-xl border border-border bg-surface px-4 py-3 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/70"
                />
              </Field>
            </>
          ) : (
            /* Créneaux issus du serveur */
            <div>
              <p className="mb-2 text-sm font-medium text-muted">
                {t("createProposal.slot")}
              </p>
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
          )}

          {!online && (
            <p className="rounded-xl bg-warning/10 px-4 py-3 text-xs text-warning">
              {t("createProposal.offline")}
            </p>
          )}

          <Button
            variant="accent"
            fullWidth
            disabled={!canSubmit}
            loading={create.isPending || createCustom.isPending}
            onClick={() => void submit()}
          >
            {t(
              visibility === "private"
                ? "createProposal.submitPrivate"
                : "createProposal.submit",
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Les heures de début d'un match personnalisé, au quart d'heure. */
const QUARTER_HOURS = Array.from({ length: 24 * 4 }, (_, index) => {
  const minutes = index * CUSTOM_MATCH.minuteStep;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;
});

/** « 1 h », « 1 h 30 », « 2 h ». */
export function formatDuration(t: Traduire, minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? t("createProposal.durationH", { h: hours })
    : t("createProposal.durationHM", { h: hours, m: rest });
}

/**
 * Un montant saisi en euros, en centimes.
 *
 * `null` pour un champ vide (le prix est facultatif), `false` pour une saisie
 * qui n'est pas un montant : la virgule belge est acceptée autant que le point.
 */
function parseEuros(raw: string): number | null | false {
  const value = raw.trim().replace(",", ".");
  if (value === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return false;
  const cents = Math.round(Number(value) * 100);
  return cents <= CUSTOM_MATCH.maxPriceEur * 100 ? cents : false;
}
