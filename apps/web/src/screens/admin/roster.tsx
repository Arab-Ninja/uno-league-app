import { useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
  Wand2,
} from "lucide-react";
import {
  venuesForMode,
  type AdminProposalRow,
  type SchedulableModeId,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { formatLongDate } from "@/lib/format.js";
import { tapFeedback } from "@/lib/native.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  SectionTitle,
  Select,
} from "@/components/ui/index.js";
import { useT, useLibelles, useNomDeMode } from "@/lib/i18n.js";

/**
 * Ouvrir une session et en composer l'effectif (ADMIN-008).
 *
 * L'application se teste mal de l'extérieur : pour voir une session de ligue
 * aller jusqu'au classement, il faut quinze comptes, quinze connexions et
 * quinze paiements. Cet écran fait le même chemin en trois gestes.
 *
 * **Le même chemin**, littéralement : inscrire appelle `joinProposal`, régler
 * appelle `payProposal`. Division contrôlée, compte arbitre refusé, quota,
 * échéance, caisse débitée pour de bon. Un raccourci qui écrirait directement
 * en base composerait des séances qu'aucun joueur n'aurait pu former, et ne
 * prouverait rien de ce qu'on cherche à vérifier.
 */
export function AdminRoster() {
  const t = useT();
  const [selected, setSelected] = useState<number | null>(null);
  const proposals = trpc.admin.manageableProposals.useQuery();

  return (
    <div className="space-y-5">
      <CreateSession onCreated={setSelected} />

      <section>
        <SectionTitle>{t("admin.roster.compose")}</SectionTitle>
        <Async query={proposals}>
          {(rows) =>
            rows.length === 0 ? (
              <Card>
                <p className="text-center text-xs text-muted">
                  {t("admin.roster.noSession")}
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => (
                  <SessionRow
                    key={row.id}
                    row={row}
                    open={selected === row.id}
                    onToggle={() =>
                      setSelected((current) =>
                        current === row.id ? null : row.id,
                      )
                    }
                  />
                ))}
              </div>
            )
          }
        </Async>
      </section>
    </div>
  );
}

/**
 * Ouverture d'une session.
 *
 * Le préavis de deux jours ne s'applique pas ici — c'est la seule dérogation
 * de tout l'écran, et elle se justifie : le délai laisse aux joueurs le temps
 * de voir passer une proposition, il n'a rien à protéger quand
 * l'administration enregistre une séance d'aujourd'hui.
 */
function CreateSession({ onCreated }: { onCreated: (id: number) => void }) {
  const t = useT();
  const nomDeMode = useNomDeMode();
  const utils = trpc.useUtils();
  const config = trpc.proposals.config.useQuery();
  const create = trpc.admin.createProposal.useMutation();

  const today = new Date().toISOString().slice(0, 10);
  const [modeId, setModeId] = useState("league");
  const [venueId, setVenueId] = useState("");
  const [date, setDate] = useState(today);
  const [hour, setHour] = useState<string>("");
  const [playersPerTeam, setPlayersPerTeam] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Un mode fermé ne s'ouvre pas davantage depuis la console : le serveur le
  // refuse pour tout le monde, administration comprise (MODE-003).
  const modes = (config.data?.modes ?? []).filter(
    (mode) =>
      mode.schedulable &&
      (mode.id !== "bigfoot" || config.data?.features.bigfoot === true),
  );
  const mode = modes.find((row) => row.id === modeId);
  const slots = useMemo(() => mode?.slots ?? [], [mode]);
  // Un terrain réservé à un mode ne s'offre qu'à lui : même règle qu'à
  // l'écran des joueurs, et c'est le paquet partagé qui la porte.
  const venues = venuesForMode(config.data?.venues ?? [], modeId);

  // Le premier créneau du mode fait un défaut raisonnable : un écran d'essai
  // ne doit pas demander de choisir une heure pour fonctionner.
  const slotStartHour =
    hour === "" ? (slots[0]?.startHour ?? null) : Number(hour);

  async function submit() {
    if (slotStartHour === null || venueId === "") return;
    setError(null);
    setNotice(null);
    try {
      const result = await create.mutateAsync({
        modeId: modeId as SchedulableModeId,
        venueId,
        date,
        slotStartHour,
        ...(playersPerTeam !== null ? { playersPerTeam } : {}),
      });
      await utils.admin.manageableProposals.invalidate();
      await utils.proposals.list.invalidate();
      setNotice(
        result.joinedExisting
          ? t("admin.roster.joinedExisting")
          : t("admin.roster.opened"),
      );
      onCreated(result.proposal.id);
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <section>
      <SectionTitle>{t("admin.roster.openTitle")}</SectionTitle>
      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("admin.roster.mode")} htmlFor="roster-mode">
            <Select
              id="roster-mode"
              value={modeId}
              onChange={(event) => {
                const next = event.target.value;
                setModeId(next);
                setHour("");
                // Le lieu et l'effectif appartiennent au mode : les garder
                // soumettrait un terrain que le nouveau mode refuse.
                setVenueId("");
                const range = modes.find(
                  (row) => row.id === next,
                )?.teamSizeRange;
                setPlayersPerTeam(range ? range.min : null);
              }}
            >
              {modes.map((row) => (
                <option key={row.id} value={row.id}>
                  {nomDeMode(row.id)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("admin.roster.venue")} htmlFor="roster-venue">
            <Select
              id="roster-venue"
              value={venueId}
              onChange={(event) => setVenueId(event.target.value)}
            >
              <option value="">{t("admin.roster.choose")}</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("admin.roster.date")} htmlFor="roster-date">
            <Input
              id="roster-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <Field label={t("admin.roster.slot")} htmlFor="roster-hour">
            <Select
              id="roster-hour"
              value={String(slotStartHour ?? "")}
              onChange={(event) => setHour(event.target.value)}
            >
              {slots.map((slot) => (
                <option key={slot.startHour} value={slot.startHour}>
                  {slot.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {mode?.teamSizeRange && (
          <Field label={t("admin.roster.teamSize")} htmlFor="roster-team-size">
            <Select
              id="roster-team-size"
              value={String(playersPerTeam ?? mode.teamSizeRange.min)}
              onChange={(event) =>
                setPlayersPerTeam(Number(event.target.value))
              }
            >
              {Array.from(
                { length: mode.teamSizeRange.max - mode.teamSizeRange.min + 1 },
                (_, index) => mode.teamSizeRange!.min + index,
              ).map((size) => (
                <option key={size} value={size}>
                  {t("admin.roster.sizeOption", { size, total: size * 2 })}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <p className="text-xs leading-relaxed text-muted">
          {mode
            ? mode.teamSizeRange
              ? mode.priceEur === 0
                ? t("admin.roster.freeFormat")
                : t("admin.roster.freeFormatPaid", { price: mode.priceEur })
              : t("admin.roster.fixedFormat", {
                  players: mode.minParticipants,
                  price: mode.priceEur,
                })
            : ""}{" "}
          {t("admin.roster.noLeadTime")}
          {mode?.divisionLocked && <> {t("admin.roster.leagueDivision")}</>}
        </p>

        {error && <ErrorBanner message={error} />}
        {notice && (
          <p role="status" className="text-center text-xs text-success">
            {notice}
          </p>
        )}

        <Button
          variant="accent"
          fullWidth
          loading={create.isPending}
          disabled={venueId === "" || slotStartHour === null}
          onClick={() => void submit()}
        >
          <CalendarPlus className="size-4" aria-hidden />
          {t("admin.roster.openSession")}
        </Button>
      </Card>
    </section>
  );
}

/**
 * Déplacer une séance gratuite (MODE-003).
 *
 * Seuls la date et l'heure bougent : changer de terrain reviendrait à créer
 * une autre séance. Et seulement là où rien n'est engagé — le serveur refuse
 * les modes payants, l'écran n'offre donc pas un bouton qui échouerait.
 *
 * Les inscrits sont prévenus par le service : quelqu'un a posé sa soirée sur
 * l'ancienne heure.
 */
function RescheduleSession({
  row,
  onDone,
}: {
  row: AdminProposalRow;
  onDone: () => void;
}) {
  const t = useT();
  const reschedule = trpc.admin.rescheduleProposal.useMutation();
  // Les créneaux viennent du serveur, comme partout ailleurs : le client
  // n'invente aucun horaire (INFO-001).
  const config = trpc.proposals.config.useQuery();

  const mode = config.data?.modes.find((row_) => row_.id === row.modeId);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(row.localDate);
  const [hour, setHour] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Le mode porte ses créneaux : on ne propose jamais une heure que le
  // serveur refuserait ensuite.
  const slots = mode?.slots ?? [];
  const slotStartHour =
    hour === "" ? (slots[0]?.startHour ?? null) : Number(hour);

  const deplacable =
    mode !== undefined &&
    mode.priceEur === 0 &&
    row.status !== "cancelled" &&
    row.status !== "completed";
  if (!deplacable) return null;

  async function submit() {
    if (slotStartHour === null) return;
    setError(null);
    setNotice(null);
    try {
      const moved = await reschedule.mutateAsync({
        proposalId: row.id,
        date,
        slotStartHour,
      });
      setNotice(
        t("admin.roster.moved", {
          date: formatLongDate(moved.localDate),
          time: moved.localTimeLabel,
        }),
      );
      setOpen(false);
      onDone();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        fullWidth
        onClick={() => {
          void tapFeedback();
          setOpen((current) => !current);
          setNotice(null);
          setError(null);
        }}
      >
        <CalendarClock className="size-4" aria-hidden />
        {open ? t("admin.roster.dontMove") : t("admin.roster.move")}
      </Button>

      {open && (
        <div className="space-y-2 rounded-xl border border-border/60 bg-surface-raised p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={t("admin.roster.newDate")}
              htmlFor={`move-date-${row.id}`}
            >
              <Input
                id={`move-date-${row.id}`}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <Field
              label={t("admin.roster.newSlot")}
              htmlFor={`move-hour-${row.id}`}
            >
              <Select
                id={`move-hour-${row.id}`}
                value={String(slotStartHour ?? "")}
                onChange={(event) => setHour(event.target.value)}
              >
                {slots.map((slot) => (
                  <option key={slot.startHour} value={slot.startHour}>
                    {slot.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {error && <ErrorBanner message={error} />}

          <Button
            variant="accent"
            fullWidth
            loading={reschedule.isPending}
            disabled={slotStartHour === null}
            onClick={() => void submit()}
          >
            {t("admin.roster.confirmMove")}
          </Button>
        </div>
      )}

      {notice && (
        <p role="status" className="text-xs text-success">
          {notice}
        </p>
      )}
    </div>
  );
}

function SessionRow({
  row,
  open,
  onToggle,
}: {
  row: AdminProposalRow;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const L = useLibelles();
  const nomDeMode = useNomDeMode();
  const full = row.participantCount >= row.minParticipants;

  return (
    <Card className="space-y-3">
      <button
        type="button"
        className="w-full text-left"
        onClick={() => {
          void tapFeedback();
          onToggle();
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {nomDeMode(row.modeId)}
              {row.division && ` · ${L.division[row.division]}`}
            </p>
            <p className="text-xs text-muted">
              {formatLongDate(row.localDate)} · {row.localTimeLabel} ·{" "}
              {row.venueName}
            </p>
            <p className="mt-0.5 text-xs">
              <span className={full ? "text-success" : "text-muted"}>
                {t("admin.roster.signedUp", {
                  count: row.participantCount,
                  min: row.minParticipants,
                })}
              </span>
              <span className="text-muted">
                {" · "}
                {t(
                  row.paidCount > 1
                    ? "admin.roster.paidMany"
                    : "admin.roster.paidOne",
                  { count: row.paidCount },
                )}
              </span>
            </p>
          </div>
          <Badge tone={row.status === "session" ? "accent" : "primary"}>
            {L.proposalStatus[row.status]}
          </Badge>
        </div>
      </button>

      {open && <RosterEditor row={row} />}
    </Card>
  );
}

/**
 * L'effectif d'une session, ouvert en accordéon.
 *
 * Les inscrits viennent de `proposals.get`, la même lecture que la fiche
 * publique : composer une session et la consulter ne doivent pas raconter
 * deux histoires différentes.
 */
function RosterEditor({ row }: { row: AdminProposalRow }) {
  const t = useT();
  const utils = trpc.useUtils();
  const detail = trpc.proposals.get.useQuery({ proposalId: row.id });
  const eligible = trpc.admin.eligiblePlayers.useQuery({ proposalId: row.id });

  const add = trpc.admin.addParticipant.useMutation();
  const remove = trpc.admin.removeParticipant.useMutation();
  const fill = trpc.admin.fillProposal.useMutation();
  const settle = trpc.admin.settleProposal.useMutation();

  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    await Promise.all([
      utils.admin.manageableProposals.invalidate(),
      utils.admin.eligiblePlayers.invalidate({ proposalId: row.id }),
      utils.proposals.get.invalidate({ proposalId: row.id }),
      utils.supervision.pending.invalidate(),
    ]);
  }

  async function run(action: () => Promise<unknown>, done: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (done !== "") setNotice(done);
      await refresh();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  const missing = row.minParticipants - row.participantCount;
  const candidates = (eligible.data ?? []).filter((player) =>
    player.displayName.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="space-y-3 border-t border-border/50 pt-3">
      {/*
        Déplacer la séance vient avant de la composer : c'est la question à
        trancher en premier quand le terrain change d'heure, et personne ne
        veut la chercher sous la liste des inscrits.
      */}
      <RescheduleSession row={row} onDone={() => void refresh()} />

      {/*
        Deux gestes, dans cet ordre, parce que le domaine l'impose : on ne paie
        qu'une réservation, donc qu'un plateau déjà complet. Les présenter
        comme une seule case à cocher aurait échoué sur tout le monde sauf le
        dernier inscrit.
      */}
      {missing > 0 && (
        <Button
          variant="secondary"
          fullWidth
          loading={fill.isPending}
          onClick={() =>
            void run(async () => {
              const result = await fill.mutateAsync({ proposalId: row.id });
              setNotice(
                t("admin.roster.filled", { count: result.added }) +
                  (result.failed.length > 0
                    ? t("admin.roster.refused", {
                        count: result.failed.length,
                        reason: result.failed[0]?.reason ?? "",
                      })
                    : "."),
              );
            }, "")
          }
        >
          <Wand2 className="size-4" aria-hidden />
          {t("admin.roster.fill", { count: missing })}
        </Button>
      )}

      {row.status === "reservation" && (
        <Button
          variant="accent"
          fullWidth
          loading={settle.isPending}
          onClick={() =>
            void run(async () => {
              const result = await settle.mutateAsync({ proposalId: row.id });
              setNotice(
                t("admin.roster.settled", { count: result.settled }) +
                  (result.failed.length > 0
                    ? t("admin.roster.failed", {
                        count: result.failed.length,
                        reason: result.failed[0]?.reason ?? "",
                      })
                    : t("admin.roster.confirmed")),
              );
            }, "")
          }
        >
          <Wallet className="size-4" aria-hidden />
          {t("admin.roster.settle", { price: row.priceUno })}
        </Button>
      )}

      {row.status === "reservation" && (
        <p className="text-xs leading-relaxed text-muted">
          {t("admin.roster.settleNote")}
        </p>
      )}

      {error && <ErrorBanner message={error} />}
      {notice && (
        <p role="status" className="text-xs text-success">
          {notice}
        </p>
      )}

      <Async query={detail}>
        {(data) => (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
              <Users className="size-3.5" aria-hidden />
              {t("admin.roster.participants", {
                count: data.participants.length,
              })}
            </p>
            <ul className="space-y-1">
              {data.participants.map((participant) => (
                <li
                  key={participant.player.id}
                  className="flex items-center gap-2 rounded-lg bg-surface-raised px-2.5 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {participant.player.displayName}
                  </span>
                  {participant.hasPaid ? (
                    <span className="flex items-center gap-0.5 text-[10px] text-success">
                      <Check className="size-3" aria-hidden />
                      {t("admin.roster.paid")}
                    </span>
                  ) : (
                    <span className="text-[10px] text-warning">
                      {t("admin.roster.unpaid")}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={t("admin.roster.removeNamed", {
                      name: participant.player.displayName,
                    })}
                    disabled={remove.isPending}
                    onClick={() =>
                      void run(
                        () =>
                          remove.mutateAsync({
                            proposalId: row.id,
                            playerId: participant.player.id,
                          }),
                        t("admin.roster.removed", {
                          name: participant.player.displayName,
                        }),
                      )
                    }
                    className="flex size-7 items-center justify-center rounded-md text-muted hover:text-error"
                  >
                    <UserMinus className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Async>

      <div>
        <Input
          placeholder={t("admin.roster.searchPlayer")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {candidates.length === 0 && (
            <li className="py-2 text-center text-xs text-muted">
              {/* Une liste vide a deux causes très différentes : le dire
                  évite de chercher un bug là où il n'y en a pas. */}
              {(eligible.data ?? []).length === 0
                ? t("admin.roster.noEligible")
                : t("admin.roster.noMatch")}
            </li>
          )}
          {candidates.slice(0, 40).map((player) => (
            <li key={player.id}>
              <button
                type="button"
                disabled={add.isPending}
                onClick={() =>
                  void run(
                    () =>
                      add.mutateAsync({
                        proposalId: row.id,
                        playerId: player.id,
                      }),
                    t("admin.roster.added", { name: player.displayName }),
                  )
                }
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                  "hover:bg-surface-raised disabled:opacity-50",
                )}
              >
                <UserPlus
                  className="size-3.5 shrink-0 text-accent"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-xs">
                  {player.displayName}
                </span>
                <span className="text-[10px] text-muted">
                  {player.division} · {player.rating}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
