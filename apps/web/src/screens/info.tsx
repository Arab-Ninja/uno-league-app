import {
  DEFAULT_REWARD_POLICY,
  DIVISIONS,
  MATCH_FORMAT,
  MIN_PROPOSAL_LEAD_DAYS,
  REWARD_KIND_LABELS,
  SLOT_DAY_START_HOUR,
  TEAM_SIZE,
  UNO_PER_EUR,
  VENUES,
  type RewardKind,
} from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { Screen } from "@/components/layout/index.js";
import { Card, SectionTitle } from "@/components/ui/index.js";

/**
 * Règlement et informations (INFO-001).
 *
 * Chaque chiffre affiché ici provient des constantes partagées : le ratio
 * UNO/EUR, les barèmes de récompense et le format de match sont donc
 * strictement identiques à ceux appliqués par le serveur — il ne peut pas y
 * avoir de contradiction entre deux écrans.
 */
export function InfoScreen() {
  const formula = trpc.ranking.formula.useQuery();
  const rewardKinds = Object.keys(DEFAULT_REWARD_POLICY) as RewardKind[];

  return (
    <Screen title="Informations" back withTabBar={false}>
      <div className="space-y-6">
        <section>
          <SectionTitle>La monnaie UNO</SectionTitle>
          <Card>
            <p className="text-center text-2xl font-bold">
              {UNO_PER_EUR} UNO = <span className="text-accent">1,00 €</span>
            </p>
            <p className="mt-2 text-center text-xs text-muted">
              Les points UNO sont des entiers. Ils servent à payer votre
              participation aux sessions et vos achats en boutique.
            </p>
          </Card>
        </section>

        <section>
          <SectionTitle>Format des matchs</SectionTitle>
          <Card className="space-y-2 text-sm">
            <Row label="Format" value={`${MATCH_FORMAT.playersPerTeam} contre ${MATCH_FORMAT.playersPerTeam}`} />
            <Row
              label="Durée"
              value={`${MATCH_FORMAT.periods} × ${MATCH_FORMAT.periodMinutes} minutes`}
            />
            <Row label="Joueurs par équipe" value={String(TEAM_SIZE)} />
            <Row
              label="Créneaux"
              value={`de ${SLOT_DAY_START_HOUR}:00 à 00:00`}
            />
            <Row
              label="Délai de création"
              value={`${MIN_PROPOSAL_LEAD_DAYS} jours minimum`}
            />
          </Card>
        </section>

        <section>
          <SectionTitle>Barème des récompenses</SectionTitle>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase text-muted">
                  <th className="pb-2 font-medium">Récompense</th>
                  {DIVISIONS.map((division) => (
                    <th key={division} className="pb-2 text-right font-medium">
                      {division}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rewardKinds.map((kind) => (
                  <tr key={kind} className="border-b border-border/30 last:border-0">
                    <td className="py-2 text-muted">{REWARD_KIND_LABELS[kind]}</td>
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
            <p className="mt-3 text-[11px] text-muted">Montants exprimés en UNO.</p>
          </Card>
        </section>

        <section>
          <SectionTitle>Lieux de jeu</SectionTitle>
          <Card className="space-y-2 text-sm">
            {VENUES.map((venue) => (
              <Row key={venue.id} label={venue.name} value={venue.timezone} />
            ))}
          </Card>
        </section>

        <section>
          <SectionTitle>Règle de classement</SectionTitle>
          <Card className="space-y-2 text-sm">
            <p className="text-xs leading-relaxed text-muted">
              À égalité sur la statistique choisie, les joueurs sont départagés
              par un score interne, puis par ordre alphabétique. Deux joueurs
              strictement ex aequo conservent la même position.
            </p>
            {formula.data && (
              <>
                <div className="mt-3 space-y-1">
                  {Object.entries(formula.data.weights).map(([stat, weight]) => (
                    <Row key={stat} label={stat} value={`× ${weight}`} />
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  Formule version {formula.data.version}.
                </p>
              </>
            )}
          </Card>
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
