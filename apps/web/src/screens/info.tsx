import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import {
  DEFAULT_REWARD_POLICY,
  DIVISIONS,
  GAME_MODES,
  MATCH_FORMAT,
  MIN_PROPOSAL_LEAD_DAYS,
  PAYMENT_DEADLINE_HOURS,
  REWARD_KIND_LABELS,
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
  const formula = trpc.ranking.formula.useQuery();
  const venues = trpc.proposals.venues.useQuery();
  const rewardKinds = Object.keys(DEFAULT_REWARD_POLICY) as RewardKind[];

  const league = getGameMode("league");
  const friendly = getGameMode("friendly");
  const squad = getGameMode("squad");
  const features = useFeatures();

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
          <SectionTitle>Les modes de jeu</SectionTitle>

          {/* UNO League : le mode compétitif, celui qui fait le classement. */}
          <Card className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-accent">
                {league?.name ?? "UNO League"}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                La compétition officielle. Une session réunit{" "}
                {league?.minParticipants ?? 15} joueurs d'une même division,
                répartis en {league?.teamCount ?? 3} équipes de {TEAM_SIZE} par
                un tirage pondéré par le niveau. Deux équipes s'affrontent, la
                troisième attend son tour.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                <span className="font-medium text-foreground">
                  Le vainqueur reste sur le terrain
                </span>{" "}
                et affronte l'équipe au repos ; en cas de match nul, c'est
                l'équipe entrante qui reste. Chaque match dure{" "}
                {TRACKER_MATCH_MINUTES} minutes ; leur nombre n'est pas fixé
                d'avance, on enchaîne pendant les {league?.durationHours ?? 2}{" "}
                heures et c'est le terrain qui décide de qui joue ensuite.
              </p>
            </div>

            <div className="space-y-2 border-t border-border/40 pt-3 text-sm">
              <Row label="Joueurs par session" value={String(league?.minParticipants ?? 15)} />
              <Row
                label="Équipes"
                value={`${league?.teamCount ?? 3} × ${TEAM_SIZE} joueurs`}
              />
              <Row label="Durée" value={`${league?.durationHours ?? 2} heures`} />
              <Row
                label="Matchs"
                value={`${TRACKER_MATCH_MINUTES} min, enchaînés, nombre libre`}
              />
              <Row label="Prix" value={`${league?.priceEur ?? 20} € par joueur`} />
              <Row label="Classement" value="Oui, par division" />
            </div>

            {/*
              Le barème vit désormais **dans** la carte du mode.
              Présenté en section autonome, il donnait à croire que ces
              montants valaient partout — alors qu'un amical n'en verse aucun
              et qu'un match SQUAD paie par la mise. Un barème se lit avec le
              mode auquel il s'applique.
            */}
            <div className="space-y-2 border-t border-border/40 pt-3">
              <p className="text-xs font-medium">Récompenses UNO de ce mode</p>
  <div className="overflow-x-auto">
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
            </div>
            </div>

            <div className="space-y-2 border-t border-border/40 pt-3">
              <p className="text-xs font-medium">Montées et descentes</p>
              <p className="text-xs leading-relaxed text-muted">
                À l'issue de chaque session, les joueurs sont classés au barème
                officiel. Les {SESSION_MOVEMENT_COUNT} premiers montent d'une
                division, les {SESSION_MOVEMENT_COUNT} derniers descendent, les{" "}
                {SESSION_MOVEMENT_COUNT} du milieu se maintiennent. Personne ne
                monte au-dessus de la D1 ni ne descend sous la D3.
              </p>
              <p className="text-xs leading-relaxed text-muted">
                L'homme du match est le joueur qui totalise le plus de points
                sur la session, toutes statistiques confondues. Le meilleur
                défenseur est celui qui cumule le plus de défenses et d'arrêts.
              </p>
            </div>
          </Card>

          {/* Match amical : hors compétition, et ce que cela implique. */}
          <Card className="mt-3 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">
                {friendly?.name ?? "Match amical"}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Ouvert à toutes les divisions, sans enjeu de classement. Une
                session réunit {friendly?.minParticipants ?? 10} joueurs en{" "}
                {friendly?.teamCount ?? 2} équipes de {TEAM_SIZE}.
              </p>
            </div>

            <div className="space-y-2 border-t border-border/40 pt-3 text-sm">
              <Row label="Joueurs par session" value={String(friendly?.minParticipants ?? 10)} />
              <Row label="Durée" value={`${friendly?.durationHours ?? 1} heure`} />
              <Row label="Prix" value={`${friendly?.priceEur ?? 10} € par joueur`} />
              <Row label="Classement" value="Non" />
              <Row label="Récompenses UNO" value="Aucune" />
              <Row label="Division" value="Inchangée" />
            </div>

            <p className="border-t border-border/40 pt-3 text-xs leading-relaxed text-muted">
              Les statistiques d'un amical n'entrent pas au classement et ne
              rapportent aucun UNO. Seule l'expérience est acquise : un amical
              reste une session jouée.
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
                  {squad?.name ?? "Match SQUAD"}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Une équipe permanente, à la manière d'un club. Vous fondez ou
                  rejoignez un SQUAD, vous défiez un autre club, et vous jouez
                  à {SQUAD_ROSTER_SIZE} contre {SQUAD_ROSTER_SIZE}. L'équipe
                  survit au match : elle garde ses joueurs, sa caisse et sa
                  cote d'un défi à l'autre.
                </p>
              </div>

              <div className="space-y-2 border-t border-border/40 pt-3 text-sm">
                <Row
                  label="Joueurs par équipe"
                  value={`${SQUAD_ROSTER_SIZE}, sans remplaçant`}
                />
                <Row label="Durée" value="60 ou 120 minutes" />
                <Row
                  label="Prix d'une place"
                  value={`${SQUAD_SEAT_PRICE_EUR[60]} € (1 h) ou ${SQUAD_SEAT_PRICE_EUR[120]} € (2 h)`}
                />
                <Row label="Mise" value="Facultative, engagée par les deux clubs" />
                <Row label="Statistiques et XP" value="Oui" />
                <Row label="Division et note de carte" value="Inchangées" />
              </div>

              <div className="space-y-2 border-t border-border/40 pt-3">
                <p className="text-xs font-medium">La mise et la place</p>
                <p className="text-xs leading-relaxed text-muted">
                  Chaque joueur paie sa place, et la caisse du club peut la
                  prendre en charge sur décision du fondateur. La mise, elle,
                  est engagée par les deux clubs et revient au vainqueur — un
                  nul rend à chacun la sienne. Les places ne sont pas rendues :
                  elles ont payé la salle.
                </p>
                <p className="text-xs leading-relaxed text-muted">
                  La cote du club suit un barème de type Elo, à partir de{" "}
                  {SQUAD_RATING_INITIAL} points, et ne dépend{" "}
                  <span className="font-medium text-foreground/80">jamais</span>{" "}
                  du montant misé : on ne peut pas acheter sa place au
                  classement.
                </p>
                <p className="text-xs leading-relaxed text-muted">
                  Un joueur peut changer de club par le marché des transferts,
                  avec l'accord des deux clubs <em>et</em> le sien. Une carence
                  de {SQUAD_LIMITS.transferCooldownDays} jours suit chaque
                  transfert abouti.
                </p>
              </div>

              <div className="space-y-2 border-t border-border/40 pt-3">
                <p className="text-xs font-medium">Les tournois</p>
                <p className="text-xs leading-relaxed text-muted">
                  Au-delà des défis, des tournois réunissent plusieurs clubs le
                  temps d'une soirée. L'inscription se fait{" "}
                  <span className="font-medium text-foreground/80">
                    par équipe
                  </span>
                  , et se règle en UNO depuis la caisse du club. Le format est
                  celui d'un tournoi classique : élimination directe, des
                  premiers tours à la finale.
                </p>
                <p className="text-xs leading-relaxed text-muted">
                  Le club vainqueur remporte un prix. Les tournois ouverts
                  apparaissent dans l'onglet SQUAD, avec leur tableau et le
                  détail des rencontres.
                </p>
                {/* Décrire une porte sans l'ouvrir oblige à la chercher. */}
                <Link
                  to="/tournois"
                  className="inline-block text-xs font-medium text-accent"
                >
                  Voir les tournois →
                </Link>
              </div>
            </Card>
          )}

          {GAME_MODES.some((mode) => !mode.schedulable && !LIVE_MODE_IDS.has(mode.id)) && (
            <Card className="mt-3 space-y-1.5">
              <p className="text-xs font-medium">Bientôt disponibles</p>
              {GAME_MODES.filter(
                (mode) => !mode.schedulable && !LIVE_MODE_IDS.has(mode.id),
              ).map((mode) => (
                <p key={mode.id} className="text-xs text-muted">
                  <span className="font-medium text-foreground/80">
                    {mode.name}
                  </span>{" "}
                  — {mode.shortDescription}
                </p>
              ))}
            </Card>
          )}
        </section>

        <section>
          <SectionTitle>Règles communes</SectionTitle>
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
              label="Délai de paiement"
              value={`${PAYMENT_DEADLINE_HOURS} heures`}
            />
            <Row
              label="Délai de création"
              value={`${MIN_PROPOSAL_LEAD_DAYS} jours minimum`}
            />
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
        <section>
          <SectionTitle>Lieux de jeu</SectionTitle>
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
                  Aucune salle publiée pour le moment.
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
