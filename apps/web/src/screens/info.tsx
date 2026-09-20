import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import {
  DEFAULT_REWARD_POLICY,
  DIVISIONS,
  GAME_MODES,
  MATCH_FORMAT,
  MIN_PROPOSAL_LEAD_DAYS,
  TOURNAMENT_PROPOSAL_LEAD_DAYS,
  PAYMENT_DEADLINE_HOURS,
  SESSION_MOVEMENT_COUNT,
  SLOT_DAY_START_HOUR,
  SQUAD_LIMITS,
  SQUAD_RATING_INITIAL,
  SQUAD_ROSTER_SIZE,
  SQUAD_SEAT_PRICE_EUR,
  TEAM_SIZE,
  TRACKER_MATCH_MINUTES,
  UNO_PER_EUR,
  getGameMode,
  type GameModeId,
  type RewardKind,
} from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { formatEur } from "@/lib/format.js";
import { useLibelles, useT } from "@/lib/i18n.js";
import { useFeatures } from "@/lib/features.js";
import { Screen } from "@/components/layout/index.js";
import { ImageCarousel } from "@/components/ui/image-carousel.js";
import { Card, SectionTitle } from "@/components/ui/index.js";

/**
 * Règlement et informations (INFO-001).
 *
 * Chaque chiffre affiché ici provient des constantes partagées : le ratio
 * UNO/EUR, les barèmes de récompense et le format de match sont donc
 * strictement identiques à ceux appliqués par le serveur — il ne peut pas y
 * avoir de contradiction entre deux écrans.
 */
/**
 * Les modes qui existent sans passer par le calendrier.
 *
 * `schedulable` répond à « se réserve-t-il depuis le calendrier ? », pas à
 * « existe-t-il ? ». Les confondre affichait « Tournois — bientôt disponible »
 * juste sous le paragraphe qui décrit les tournois et le lien qui y mène.
 */
const LIVE_MODE_IDS = new Set<GameModeId>(["squad", "tournaments"]);

export function InfoScreen() {
  const t = useT();
  const L = useLibelles();
  const formula = trpc.ranking.formula.useQuery();
  const venues = trpc.proposals.venues.useQuery();
  const rewardKinds = Object.keys(DEFAULT_REWARD_POLICY) as RewardKind[];

  const league = getGameMode("league");
  const friendly = getGameMode("friendly");
  const squad = getGameMode("squad");
  const features = useFeatures();

  return (
    <Screen title={t("info.title")} back withTabBar={false}>
      <div className="space-y-6">
        <section>
          <SectionTitle>{t("info.currency")}</SectionTitle>
          <Card>
            <p className="text-center text-2xl font-bold">
              {t("info.rate", { rate: UNO_PER_EUR })}{" "}
              <span className="text-accent">{formatEur(UNO_PER_EUR)}</span>
            </p>
            <p className="mt-2 text-center text-xs text-muted">
              {t("info.currencyNote")}
            </p>
          </Card>
        </section>

        <section>
          <SectionTitle>{t("info.modes")}</SectionTitle>

          {/* UNO League : le mode compétitif, celui qui fait le classement. */}
          <Card className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-accent">
                {L.gameMode.league}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {t("info.leagueP1", {
                  players: league?.minParticipants ?? 15,
                  teams: league?.teamCount ?? 3,
                  size: TEAM_SIZE,
                })}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                {t("info.leagueDraw")}{" "}
                <span className="font-medium text-foreground">
                  {t("info.leagueSlotBold")}
                </span>{" "}
                {t("info.leagueSlotRest")}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                <span className="font-medium text-foreground">
                  {t("info.leagueWinnerBold")}
                </span>{" "}
                {t("info.leagueWinnerRest", {
                  minutes: TRACKER_MATCH_MINUTES,
                  hours: league?.durationHours ?? 2,
                })}
              </p>
            </div>

            <div className="space-y-2 border-t border-border/40 pt-3 text-sm">
              <Row
                label={t("info.rowPlayersPerSession")}
                value={String(league?.minParticipants ?? 15)}
              />
              <Row
                label={t("info.rowTeams")}
                value={t("info.teamsValue", {
                  teams: league?.teamCount ?? 3,
                  size: TEAM_SIZE,
                })}
              />
              <Row
                label={t("info.rowDuration")}
                value={t("info.hoursValue", {
                  hours: league?.durationHours ?? 2,
                })}
              />
              <Row
                label={t("info.rowMatches")}
                value={t("info.matchesValue", {
                  minutes: TRACKER_MATCH_MINUTES,
                })}
              />
              <Row
                label={t("info.rowPrice")}
                value={t("info.priceValue", { eur: league?.priceEur ?? 20 })}
              />
              <Row
                label={t("info.rowRanking")}
                value={t("info.rankedByDivision")}
              />
            </div>

            {/*
              Le barème vit désormais **dans** la carte du mode.
              Présenté en section autonome, il donnait à croire que ces
              montants valaient partout — alors qu'un amical n'en verse aucun
              et qu'un match SQUAD paie par la mise. Un barème se lit avec le
              mode auquel il s'applique.
            */}
            <div className="space-y-2 border-t border-border/40 pt-3">
              <p className="text-xs font-medium">{t("info.rewardsOfMode")}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs uppercase text-muted">
                      <th className="pb-2 font-medium">
                        {t("info.rewardColumn")}
                      </th>
                      {DIVISIONS.map((division) => (
                        <th
                          key={division}
                          className="pb-2 text-right font-medium"
                        >
                          {division}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rewardKinds.map((kind) => (
                      <tr
                        key={kind}
                        className="border-b border-border/30 last:border-0"
                      >
                        <td className="py-2 text-muted">
                          {L.rewardKind[kind]}
                        </td>
                        {DIVISIONS.map((division) => (
                          <td
                            key={division}
                            className="py-2 text-right font-semibold tabular-nums"
                          >
                            {DEFAULT_REWARD_POLICY[kind][division]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-[11px] text-muted">
                  {t("info.amountsInUno")}
                </p>
              </div>
            </div>

            <div className="space-y-2 border-t border-border/40 pt-3">
              <p className="text-xs font-medium">{t("info.movements")}</p>
              <p className="text-xs leading-relaxed text-muted">
                {t("info.movementsBody", { count: SESSION_MOVEMENT_COUNT })}
              </p>
              <p className="text-xs leading-relaxed text-muted">
                {t("info.motmBody")}
              </p>
            </div>
          </Card>

          {/* Match amical : hors compétition, et ce que cela implique. */}
          <Card className="mt-3 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">{L.gameMode.friendly}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {t("info.friendlyP1", {
                  players: friendly?.minParticipants ?? 10,
                  teams: friendly?.teamCount ?? 2,
                  size: TEAM_SIZE,
                })}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                {t("info.friendlySidesLead")}{" "}
                <span className="font-medium text-foreground">
                  {t("info.friendlySidesBold")}
                </span>
                {t("info.friendlySidesRest")}
              </p>
            </div>

            <div className="space-y-2 border-t border-border/40 pt-3 text-sm">
              <Row
                label={t("info.rowPlayersPerSession")}
                value={String(friendly?.minParticipants ?? 10)}
              />
              <Row
                label={t("info.rowDuration")}
                value={t("info.hourValue", {
                  hours: friendly?.durationHours ?? 1,
                })}
              />
              <Row
                label={t("info.rowPrice")}
                value={t("info.priceValue", { eur: friendly?.priceEur ?? 10 })}
              />
              <Row label={t("info.rowRanking")} value={t("info.no")} />
              <Row label={t("info.rowRewards")} value={t("info.none")} />
              <Row label={t("info.rowDivision")} value={t("info.unchanged")} />
            </div>

            <p className="border-t border-border/40 pt-3 text-xs leading-relaxed text-muted">
              {t("info.friendlyNote")}
            </p>
          </Card>

          {/*
            Le mode SQUAD (SQUAD-001). Il ne se propose pas au calendrier —
            une rencontre naît d'un défi entre deux clubs — mais il existe
            bel et bien, et le ranger parmi les « bientôt disponibles »
            reviendrait à le dire absent.
          */}
          {features.squad && (
            <Card className="mt-3 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-accent">
                  {L.gameMode.squad}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {t("info.squadP1", { size: SQUAD_ROSTER_SIZE })}
                </p>
              </div>

              <div className="space-y-2 border-t border-border/40 pt-3 text-sm">
                <Row
                  label={t("info.rowPlayersPerTeam")}
                  value={t("info.squadRosterValue", {
                    size: SQUAD_ROSTER_SIZE,
                  })}
                />
                <Row
                  label={t("info.rowDuration")}
                  value={t("info.squadDurationValue")}
                />
                <Row
                  label={t("info.rowSeatPrice")}
                  value={t("info.squadSeatValue", {
                    one: SQUAD_SEAT_PRICE_EUR[60],
                    two: SQUAD_SEAT_PRICE_EUR[120],
                  })}
                />
                <Row
                  label={t("info.rowStake")}
                  value={t("info.squadStakeValue")}
                />
                <Row label={t("info.rowStatsXp")} value={t("info.yes")} />
                <Row
                  label={t("info.rowDivisionCard")}
                  value={t("info.unchangedPlural")}
                />
              </div>

              <div className="space-y-2 border-t border-border/40 pt-3">
                <p className="text-xs font-medium">{t("info.stakeAndSeat")}</p>
                <p className="text-xs leading-relaxed text-muted">
                  {t("info.stakeBody1")}
                </p>
                <p className="text-xs leading-relaxed text-muted">
                  {t("info.ratingLead", { start: SQUAD_RATING_INITIAL })}{" "}
                  <span className="font-medium text-foreground/80">
                    {t("info.ratingNever")}
                  </span>{" "}
                  {t("info.ratingRest")}
                </p>
                <p className="text-xs leading-relaxed text-muted">
                  {t("info.transferBody", {
                    days: SQUAD_LIMITS.transferCooldownDays,
                  })}
                </p>
              </div>

              <div className="space-y-2 border-t border-border/40 pt-3">
                <p className="text-xs font-medium">{t("info.tournaments")}</p>
                <p className="text-xs leading-relaxed text-muted">
                  {t("info.tournamentsLead")}{" "}
                  <span className="font-medium text-foreground/80">
                    {t("info.tournamentsByTeam")}
                  </span>
                  {t("info.tournamentsRest")}
                </p>
                <p className="text-xs leading-relaxed text-muted">
                  {t("info.tournamentsBody2", {
                    days: TOURNAMENT_PROPOSAL_LEAD_DAYS,
                  })}
                </p>
                {/* Décrire une porte sans l'ouvrir oblige à la chercher. */}
                <Link
                  to="/tournois"
                  className="inline-block text-xs font-medium text-accent"
                >
                  {t("info.tournamentsLink")}
                </Link>
              </div>
            </Card>
          )}

          {GAME_MODES.some(
            (mode) => !mode.schedulable && !LIVE_MODE_IDS.has(mode.id),
          ) && (
            <Card className="mt-3 space-y-1.5">
              <p className="text-xs font-medium">{t("info.comingSoon")}</p>
              {GAME_MODES.filter(
                (mode) => !mode.schedulable && !LIVE_MODE_IDS.has(mode.id),
              ).map((mode) => (
                <p key={mode.id} className="text-xs text-muted">
                  <span className="font-medium text-foreground/80">
                    {L.gameMode[mode.id]}
                  </span>{" "}
                  — {L.gameModeAbout[mode.id]}
                </p>
              ))}
            </Card>
          )}
        </section>

        <section>
          <SectionTitle>{t("info.commonRules")}</SectionTitle>
          <Card className="space-y-2 text-sm">
            <Row
              label={t("info.rowFormat")}
              value={t("info.formatValue", {
                n: MATCH_FORMAT.playersPerTeam,
              })}
            />
            <Row
              label={t("info.rowDuration")}
              value={t("info.periodsValue", {
                periods: MATCH_FORMAT.periods,
                minutes: MATCH_FORMAT.periodMinutes,
              })}
            />
            <Row
              label={t("info.rowPlayersPerTeam")}
              value={String(TEAM_SIZE)}
            />
            <Row
              label={t("info.rowSlots")}
              value={t("info.slotsValue", { start: SLOT_DAY_START_HOUR })}
            />
            <Row
              label={t("info.rowPaymentDeadline")}
              value={t("info.deadlineValue", {
                hours: PAYMENT_DEADLINE_HOURS,
              })}
            />
            <Row
              label={t("info.rowCreationDelay")}
              value={t("info.leadValue", { days: MIN_PROPOSAL_LEAD_DAYS })}
            />
          </Card>
        </section>

        <section>
          <SectionTitle>{t("info.rankingRule")}</SectionTitle>
          <Card className="space-y-2 text-sm">
            <p className="text-xs leading-relaxed text-muted">
              {t("info.rankingRuleBody")}
            </p>
            {formula.data && (
              <>
                <div className="mt-3 space-y-1">
                  {Object.entries(formula.data.weights).map(
                    ([stat, weight]) => (
                      <Row key={stat} label={stat} value={`× ${weight}`} />
                    ),
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  {t("info.formulaVersion", { version: formula.data.version })}
                </p>
              </>
            )}
          </Card>
        </section>
        <section>
          <SectionTitle>{t("info.venues")}</SectionTitle>
          <div className="space-y-3">
            {(venues.data ?? []).map((venue) => (
              <Card key={venue.id} className="space-y-3 p-0 pb-4">
                {venue.images.length > 0 && (
                  <ImageCarousel
                    images={venue.images}
                    alt={venue.name}
                    className="rounded-b-none border-0 border-b border-border/60"
                  />
                )}
                <div className="space-y-1.5 px-4 pt-4">
                  <h3 className="text-sm font-semibold">{venue.name}</h3>
                  {venue.headline && (
                    <p className="text-xs font-medium text-accent">
                      {venue.headline}
                    </p>
                  )}
                  {venue.description && (
                    <p className="text-xs leading-relaxed text-muted">
                      {venue.description}
                    </p>
                  )}
                  {venue.address && (
                    <p className="flex items-start gap-1.5 pt-1 text-xs text-muted">
                      <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden />
                      {venue.address}
                    </p>
                  )}
                </div>
              </Card>
            ))}
            {venues.data?.length === 0 && (
              <Card>
                <p className="text-center text-xs text-muted">
                  {t("info.noVenue")}
                </p>
              </Card>
            )}
          </div>
        </section>
      </div>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
