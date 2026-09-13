import { RANKING_STAT_LABELS, formatPoints } from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
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
  const stats = trpc.players.statistics.useQuery({ limit: 30 });

  return (
    <Screen title="Statistiques" back backTo="/profil">
      <Async query={stats}>
        {(data) =>
          data.totals.matchesPlayed === 0 ? (
            <EmptyState
              icon={<BarChart3 className="size-6" aria-hidden />}
              title="Aucune séance jouée"
              description="Vos statistiques apparaîtront après votre première session clôturée."
            />
          ) : (
            <div className="space-y-6">
              <section>
                <SectionTitle>Par séance</SectionTitle>
                <div className="grid grid-cols-3 gap-2">
                  <StatTile
                    label="Buts"
                    value={String(data.perSession.goals)}
                    hint="par séance"
                  />
                  <StatTile
                    label="Passes"
                    value={String(data.perSession.assists)}
                    hint="par séance"
                  />
                  <StatTile
                    label="Défenses"
                    value={String(data.perSession.defenses)}
                    hint="par séance"
                  />
                  <StatTile
                    label="Arrêts"
                    value={String(data.perSession.saves)}
                    hint="par séance"
                  />
                  <StatTile
                    label="Contribution"
                    value={String(data.perSession.contributions)}
                    hint="buts + passes"
                  />
                  <StatTile
                    label="Séances"
                    value={String(data.totals.matchesPlayed)}
                    hint="au total"
                  />
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  Les moyennes portent sur l'ensemble de votre carrière, et non
                  sur les seules séances affichées ci-dessous : un ratio qui
                  changerait selon la fenêtre d'affichage ne voudrait rien dire.
                </p>
              </section>

              <section>
                <SectionTitle>Buts et passes</SectionTitle>
                <Card>
                  <SessionLineChart
                    sessions={data.sessions}
                    series={[
                      {
                        label: "Buts",
                        color: SERIES_COLORS[0],
                        values: data.sessions.map((session) => session.goals),
                      },
                      {
                        label: "Passes",
                        color: SERIES_COLORS[1],
                        values: data.sessions.map((session) => session.assists),
                      },
                    ]}
                  />
                </Card>
              </section>

              <section>
                <SectionTitle>Défenses et arrêts</SectionTitle>
                <Card>
                  <SessionLineChart
                    sessions={data.sessions}
                    series={[
                      {
                        label: "Défenses",
                        color: SERIES_COLORS[0],
                        values: data.sessions.map((session) => session.defenses),
                      },
                      {
                        label: "Arrêts",
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
                  <SectionTitle>Note de carte</SectionTitle>
                  <Card>
                    <SessionLineChart
                      sessions={data.sessions.filter((s) => s.rating !== null)}
                      baseline="auto"
                      series={[
                        {
                          label: "Note",
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
                <SectionTitle>Totaux de carrière</SectionTitle>
                <Card className="space-y-1.5 text-sm">
                  <Row label={RANKING_STAT_LABELS.goals} value={data.totals.goals} />
                  <Row label={RANKING_STAT_LABELS.assists} value={data.totals.assists} />
                  <Row label={RANKING_STAT_LABELS.defenses} value={data.totals.defenses} />
                  <Row label={RANKING_STAT_LABELS.saves} value={data.totals.saves} />
                  <Row label="Homme du match" value={data.totals.motm} />
                  <Row label="Séances jouées" value={data.totals.matchesPlayed} />
                  <Row label="Note de carte" value={data.totals.rating} />
                  <Row label="Niveau" value={data.totals.level} />
                </Card>
              </section>

              {/* Le tableau double la courbe : une valeur exacte doit rester
                  lisible sans survol, et sans distinguer deux couleurs. */}
              <section>
                <SectionTitle>Séance par séance</SectionTitle>
                <Card className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-[11px] uppercase text-muted">
                        <th className="pb-2 font-medium">Date</th>
                        <th className="pb-2 text-right font-medium">But</th>
                        <th className="pb-2 text-right font-medium">Pas</th>
                        <th className="pb-2 text-right font-medium">Déf</th>
                        <th className="pb-2 text-right font-medium">Arr</th>
                        <th className="pb-2 text-right font-medium">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.sessions].reverse().map((session) => (
                        <tr
                          key={session.proposalId}
                          className="border-b border-border/30 last:border-0"
                        >
                          <td className="py-2 text-muted">
                            {session.date.slice(8, 10)}/{session.date.slice(5, 7)}
                          </td>
                          <td className="py-2 text-right tabular-nums">{session.goals}</td>
                          <td className="py-2 text-right tabular-nums">{session.assists}</td>
                          <td className="py-2 text-right tabular-nums">{session.defenses}</td>
                          <td className="py-2 text-right tabular-nums">{session.saves}</td>
                          <td className="py-2 text-right font-semibold tabular-nums">
                            {session.points === null ? "—" : formatPoints(session.points)}
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
