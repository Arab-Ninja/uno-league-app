import { formatPoints } from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { useLibelles, useT } from "@/lib/i18n.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import { Card, EmptyState, SectionTitle } from "@/components/ui/index.js";
import {
  SERIES_COLORS,
  SessionLineChart,
  StatTile,
} from "@/components/stats/session-chart.js";
import { BarChart3 } from "lucide-react";

/**
 * Toutes les statistiques d'un joueur (STAT-001).
 *
 * Le profil montre des totaux ; ils disent ce qu'on a accumulé, pas ce qu'on
 * vaut. Vingt buts en cinq séances et vingt buts en quarante ne racontent pas
 * la même chose. Cet écran ajoute donc les deux lectures qui manquaient : la
 * **moyenne par séance**, et l'**évolution dans le temps**.
 *
 * L'ordre est celui de la question qu'on se pose : d'abord ce que je produis
 * en moyenne, puis comment cela bouge, puis le détail brut.
 */
export function StatisticsScreen() {
  const t = useT();
  const L = useLibelles();
  const stats = trpc.players.statistics.useQuery({ limit: 30 });

  return (
    <Screen title={t("stats.title")} back backTo="/profil">
      <Async query={stats}>
        {(data) =>
          data.totals.matchesPlayed === 0 ? (
            <EmptyState
              icon={<BarChart3 className="size-6" aria-hidden />}
              title={t("stats.emptyTitle")}
              description={t("stats.emptyBody")}
            />
          ) : (
            <div className="space-y-6">
              <section>
                <SectionTitle>{t("stats.perSession")}</SectionTitle>
                <div className="grid grid-cols-3 gap-2">
                  <StatTile
                    label={L.rankingStat.goals}
                    value={String(data.perSession.goals)}
                    hint={t("stats.perSessionUnit")}
                  />
                  <StatTile
                    label={L.rankingStat.assists}
                    value={String(data.perSession.assists)}
                    hint={t("stats.perSessionUnit")}
                  />
                  <StatTile
                    label={L.rankingStat.defenses}
                    value={String(data.perSession.defenses)}
                    hint={t("stats.perSessionUnit")}
                  />
                  <StatTile
                    label={L.rankingStat.saves}
                    value={String(data.perSession.saves)}
                    hint={t("stats.perSessionUnit")}
                  />
                  <StatTile
                    label={t("stats.contribution")}
                    value={String(data.perSession.contributions)}
                    hint={t("stats.contributionHint")}
                  />
                  <StatTile
                    label={t("stats.sessions")}
                    value={String(data.totals.matchesPlayed)}
                    hint={t("stats.inTotal")}
                  />
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  {t("stats.averagesNote")}
                </p>
              </section>

              <section>
                <SectionTitle>{t("stats.goalsAssists")}</SectionTitle>
                <Card>
                  <SessionLineChart
                    sessions={data.sessions}
                    series={[
                      {
                        label: L.rankingStat.goals,
                        color: SERIES_COLORS[0],
                        values: data.sessions.map((session) => session.goals),
                      },
                      {
                        label: L.rankingStat.assists,
                        color: SERIES_COLORS[1],
                        values: data.sessions.map((session) => session.assists),
                      },
                    ]}
                  />
                </Card>
              </section>

              <section>
                <SectionTitle>{t("stats.defencesSaves")}</SectionTitle>
                <Card>
                  <SessionLineChart
                    sessions={data.sessions}
                    series={[
                      {
                        label: L.rankingStat.defenses,
                        color: SERIES_COLORS[0],
                        values: data.sessions.map(
                          (session) => session.defenses,
                        ),
                      },
                      {
                        label: L.rankingStat.saves,
                        color: SERIES_COLORS[1],
                        values: data.sessions.map((session) => session.saves),
                      },
                    ]}
                  />
                </Card>
              </section>

              {/* La note a sa propre échelle : elle ne partage pas le cadre des
                  buts, sous peine de croisements qui n'existent pas. */}
              {data.sessions.some((session) => session.rating !== null) && (
                <section>
                  <SectionTitle>{t("stats.cardRating")}</SectionTitle>
                  <Card>
                    <SessionLineChart
                      sessions={data.sessions.filter((s) => s.rating !== null)}
                      baseline="auto"
                      series={[
                        {
                          label: t("stats.rating"),
                          color: SERIES_COLORS[0],
                          values: data.sessions
                            .filter((s) => s.rating !== null)
                            .map((session) => session.rating ?? 0),
                        },
                      ]}
                    />
                  </Card>
                </section>
              )}

              <section>
                <SectionTitle>{t("stats.careerTotals")}</SectionTitle>
                <Card className="space-y-1.5 text-sm">
                  <Row label={L.rankingStat.goals} value={data.totals.goals} />
                  <Row
                    label={L.rankingStat.assists}
                    value={data.totals.assists}
                  />
                  <Row
                    label={L.rankingStat.defenses}
                    value={data.totals.defenses}
                  />
                  <Row label={L.rankingStat.saves} value={data.totals.saves} />
                  <Row label={t("stats.motm")} value={data.totals.motm} />
                  <Row
                    label={t("stats.played")}
                    value={data.totals.matchesPlayed}
                  />
                  <Row
                    label={t("stats.cardRating")}
                    value={data.totals.rating}
                  />
                  <Row label={t("stats.level")} value={data.totals.level} />
                </Card>
              </section>

              {/* Le tableau double la courbe : une valeur exacte doit rester
                  lisible sans survol, et sans distinguer deux couleurs. */}
              <section>
                <SectionTitle>{t("stats.bySession")}</SectionTitle>
                <Card className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-[11px] uppercase text-muted">
                        <th className="pb-2 font-medium">{t("stats.date")}</th>
                        <th className="pb-2 text-right font-medium">
                          {t("stats.colGoals")}
                        </th>
                        <th className="pb-2 text-right font-medium">
                          {t("stats.colAssists")}
                        </th>
                        <th className="pb-2 text-right font-medium">
                          {t("stats.colDefences")}
                        </th>
                        <th className="pb-2 text-right font-medium">
                          {t("stats.colSaves")}
                        </th>
                        <th className="pb-2 text-right font-medium">
                          {t("stats.colPoints")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.sessions].reverse().map((session) => (
                        <tr
                          key={session.proposalId}
                          className="border-b border-border/30 last:border-0"
                        >
                          <td className="py-2 text-muted">
                            {session.date.slice(8, 10)}/
                            {session.date.slice(5, 7)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {session.goals}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {session.assists}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {session.defenses}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {session.saves}
                          </td>
                          <td className="py-2 text-right font-semibold tabular-nums">
                            {session.points === null
                              ? "—"
                              : formatPoints(session.points)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </section>
            </div>
          )
        }
      </Async>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
