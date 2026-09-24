import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy, X } from "lucide-react";
import {
  TOURNAMENT_DURATION_HOURS,
  TOURNAMENT_SIZES,
  formatNameForSize,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { formatLongDate } from "@/lib/format.js";
import { tapFeedback } from "@/lib/native.js";
import { Async } from "@/components/ui/async.js";
import { TournamentCoverField } from "@/components/admin/images-field.js";
import { imageSrc } from "@/lib/images.js";
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
import { useT, useLibelles } from "@/lib/i18n.js";

/**
 * Création et suivi des tournois (TOUR-001).
 *
 * Les paramètres sont ceux d'une séance — salle, date, créneau — plus ce qui
 * fait un tournoi : un plateau, un droit d'engagement et une dotation. Le
 * tirage et la saisie des résultats, eux, se font sur la fiche du tournoi, au
 * milieu du tableau : les faire d'ici aurait obligé à se souvenir de qui joue
 * contre qui.
 */
const EMPTY = {
  name: "",
  size: 8,
  entryFeeUno: 200,
  prizeUno: 1000,
  active: true,
  /** Zéro ou une affiche — la galerie partagée raisonne en liste. */
  cover: [] as string[],
};

/**
 * La ligue ouvre des formats ; les clubs posent les dates (TOUR-005).
 *
 * L'administration ne crée plus les tournois un par un. Elle déclare ce qui
 * existe — « huitièmes de finale, seize clubs, tant à l'engagement, tant au
 * vainqueur » — et les clubs proposent ensuite leurs rencontres depuis leur
 * onglet. Sans cela, chaque match aurait demandé une intervention de la
 * ligue, et un club qui veut jouer mardi aurait dû attendre qu'on le lui
 * propose.
 *
 * La durée n'est pas un champ : tous les tournois durent deux heures.
 */
/** Le tour par lequel un tableau de cette taille commence. */
const PREMIER_TOUR = {
  4: "semi",
  8: "quarter",
  16: "of16",
  32: "of32",
} as const;

export function AdminTournaments() {
  const t = useT();
  const L = useLibelles();
  const nomDuTour = (size: 4 | 8 | 16 | 32) =>
    L.tournamentRound[PREMIER_TOUR[size]];
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const tournaments = trpc.tournaments.list.useQuery({ mineOnly: false });
  /*
   * Les annulés à part, et demandés explicitement.
   *
   * Depuis TOUR-006, la liste ordinaire les écarte — un tournoi annulé n'a pas
   * eu lieu, et n'a rien à faire là où l'on cherche un tournoi à jouer. La
   * console, elle, en a besoin : c'est ici qu'on vient si un club conteste le
   * remboursement de son droit d'engagement.
   */
  const cancelled = trpc.tournaments.list.useQuery({
    mineOnly: false,
    status: "cancelled",
  });
  const formats = trpc.tournaments.allFormats.useQuery();
  const save = trpc.tournaments.saveFormat.useMutation();
  const cancel = trpc.tournaments.cancel.useMutation();

  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    // Invalide les deux lectures de `list` — l'ordinaire et celle des annulés :
    // une annulation fait précisément passer un tournoi de l'une à l'autre.
    await utils.tournaments.list.invalidate();
    await utils.tournaments.allFormats.invalidate();
    await utils.tournaments.formats.invalidate();
  }

  async function submit() {
    setError(null);
    setNotice(null);
    try {
      await save.mutateAsync({
        ...(editing === null ? {} : { formatId: editing }),
        name: form.name,
        size: form.size as 4 | 8 | 16 | 32,
        entryFeeUno: form.entryFeeUno,
        prizeUno: form.prizeUno,
        active: form.active,
        coverImageUrl: form.cover[0] ?? null,
      });
      setForm(EMPTY);
      setEditing(null);
      setNotice(
        editing === null
          ? t("admin.tournaments.opened")
          : t("admin.tournaments.updated"),
      );
      await refresh();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  async function drop(tournamentId: number) {
    setError(null);
    setNotice(null);
    try {
      await cancel.mutateAsync({ tournamentId });
      setNotice(t("admin.tournaments.cancelled"));
      await refresh();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>
          {editing === null
            ? t("admin.tournaments.openTitle")
            : t("admin.tournaments.editTitle")}
        </SectionTitle>
        <Card className="space-y-3">
          <Field label={t("admin.name")} htmlFor="format-name">
            <Input
              id="format-name"
              value={form.name}
              placeholder={nomDuTour(16)}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </Field>

          <Field
            label={t("admin.tournaments.clubs")}
            htmlFor="format-size"
            hint={t("admin.tournaments.clubsHint")}
          >
            <Select
              id="format-size"
              value={String(form.size)}
              onChange={(event) => {
                const size = Number(event.target.value) as 4 | 8 | 16 | 32;
                // Le nom d'usage suit la taille tant qu'on ne l'a pas écrit
                // soi-même : c'est ce que le client a demandé, mot pour mot.
                const suggested = nomDuTour(size);
                setForm((current) => ({
                  ...current,
                  size,
                  name:
                    current.name === "" ||
                    TOURNAMENT_SIZES.some(
                      (other) =>
                        formatNameForSize(other) === current.name ||
                        nomDuTour(other) === current.name,
                    )
                      ? suggested
                      : current.name,
                }));
              }}
            >
              {TOURNAMENT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {t("admin.tournaments.sizeOption", {
                    size,
                    name: nomDuTour(size),
                  })}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("admin.tournaments.fee")} htmlFor="format-fee">
              <Input
                id="format-fee"
                type="number"
                min={0}
                inputMode="numeric"
                value={String(form.entryFeeUno)}
                onChange={(event) =>
                  setForm({ ...form, entryFeeUno: Number(event.target.value) })
                }
              />
            </Field>
            <Field label={t("admin.tournaments.prize")} htmlFor="format-prize">
              <Input
                id="format-prize"
                type="number"
                min={0}
                inputMode="numeric"
                value={String(form.prizeUno)}
                onChange={(event) =>
                  setForm({ ...form, prizeUno: Number(event.target.value) })
                }
              />
            </Field>
          </div>

          <TournamentCoverField
            images={form.cover}
            onChange={(cover) => setForm((current) => ({ ...current, cover }))}
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) =>
                setForm({ ...form, active: event.target.checked })
              }
              className="size-4 accent-[#F97316]"
            />
            {t("admin.tournaments.active")}
          </label>

          <p className="text-xs text-muted">
            {t("admin.tournaments.duration", {
              hours: TOURNAMENT_DURATION_HOURS,
            })}
          </p>

          {error && <ErrorBanner message={error} />}
          {notice && (
            <p role="status" className="text-center text-xs text-success">
              {notice}
            </p>
          )}

          <div className="flex gap-2">
            {editing !== null && (
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setForm(EMPTY);
                  setEditing(null);
                }}
              >
                {t("common.cancel")}
              </Button>
            )}
            <Button
              variant="accent"
              className="flex-1"
              loading={save.isPending}
              disabled={form.name.trim().length < 3}
              onClick={() => void submit()}
            >
              <Trophy className="size-4" aria-hidden />
              {editing === null
                ? t("admin.tournaments.openFormat")
                : t("admin.save")}
            </Button>
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>{t("admin.tournaments.formats")}</SectionTitle>
        <Async query={formats}>
          {(list) =>
            list.length === 0 ? (
              <Card>
                <p className="text-center text-xs text-muted">
                  {t("admin.tournaments.noFormat")}
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {list.map((format) => (
                  <Card key={format.id} className="flex items-start gap-3 py-3">
                    {/* L'affiche telle qu'elle paraîtra aux clubs : la juger
                        sur la vignette évite de l'ouvrir pour s'apercevoir
                        qu'elle est de travers. */}
                    {format.coverImageUrl && (
                      <img
                        src={imageSrc(format.coverImageUrl)}
                        alt=""
                        className="size-12 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        void tapFeedback();
                        setEditing(format.id);
                        setForm({
                          name: format.name,
                          size: format.size,
                          entryFeeUno: format.entryFeeUno,
                          prizeUno: format.prizeUno,
                          active: format.active,
                          cover: format.coverImageUrl
                            ? [format.coverImageUrl]
                            : [],
                        });
                      }}
                    >
                      <p className="truncate text-sm font-semibold">
                        {format.name}
                      </p>
                      <p className="text-xs text-muted">
                        {t("admin.tournaments.formatLine", {
                          size: format.size,
                          fee: format.entryFeeUno,
                          prize: format.prizeUno,
                        })}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {t(
                          format.openCount > 1
                            ? "admin.tournaments.waitingMany"
                            : "admin.tournaments.waitingOne",
                          { count: format.openCount },
                        )}
                      </p>
                    </button>
                    <Badge tone={format.active ? "primary" : "neutral"}>
                      {format.active
                        ? t("admin.tournaments.open")
                        : t("admin.tournaments.withdrawn")}
                    </Badge>
                  </Card>
                ))}
              </div>
            )
          }
        </Async>
      </section>

      <section>
        <SectionTitle>{t("admin.tournaments.tournaments")}</SectionTitle>
        <Async query={tournaments}>
          {(list) =>
            list.length === 0 ? (
              <Card>
                <p className="text-center text-xs text-muted">
                  {t("admin.tournaments.noTournament")}
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {list.map((tournament) => (
                  <Card key={tournament.id} className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          void tapFeedback();
                          navigate(`/tournois/${tournament.id}`);
                        }}
                      >
                        <p className="truncate text-sm font-semibold">
                          {tournament.name}
                        </p>
                        <p className="text-xs text-muted">
                          {formatLongDate(tournament.localDate)} ·{" "}
                          {tournament.venueName} ·{" "}
                          {t("admin.tournaments.clubsCount", {
                            entries: tournament.entryCount,
                            size: tournament.size,
                          })}
                        </p>
                      </button>
                      <Badge
                        tone={
                          tournament.status === "completed"
                            ? "accent"
                            : tournament.status === "cancelled"
                              ? "neutral"
                              : "primary"
                        }
                      >
                        {L.tournamentStatus[tournament.status]}
                      </Badge>
                    </div>

                    {/*
                      Un tournoi terminé ne s'annule pas : ses caisses sont
                      réglées, et défaire cela demanderait de reprendre une
                      dotation déjà dépensée.
                    */}
                    {tournament.status !== "completed" &&
                      tournament.status !== "cancelled" && (
                        <Button
                          variant="ghost"
                          className="min-h-[36px] w-full py-1.5 text-xs"
                          loading={cancel.isPending}
                          onClick={() => void drop(tournament.id)}
                        >
                          <X className="size-3.5" aria-hidden />
                          {t("admin.tournaments.cancelAndRefund")}
                        </Button>
                      )}
                  </Card>
                ))}
              </div>
            )
          }
        </Async>
      </section>

      {(cancelled.data ?? []).length > 0 && (
        <section>
          <SectionTitle>{t("admin.tournaments.cancelledTitle")}</SectionTitle>
          <div className="space-y-2">
            {(cancelled.data ?? []).map((tournament) => (
              <Card key={tournament.id} className="flex items-start gap-3 py-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    void tapFeedback();
                    navigate(`/tournois/${tournament.id}`);
                  }}
                >
                  <p className="truncate text-sm font-medium text-muted">
                    {tournament.name}
                  </p>
                  <p className="text-xs text-muted">
                    {formatLongDate(tournament.localDate)} ·{" "}
                    {tournament.venueName} ·{" "}
                    {t("admin.tournaments.entriesReturned")}
                  </p>
                </button>
                <Badge tone="neutral">
                  {L.tournamentStatus[tournament.status]}
                </Badge>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
