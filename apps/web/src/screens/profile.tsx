import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Gamepad2,
  Info,
  KeyRound,
  LogOut,
  Package,
  Pencil,
  Shield,
  ShieldCheck,
  BarChart3,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  POSITION_LABELS,
  RANKING_STAT_LABELS,
  levelProgress,
  toCardPlayer,
  xpToNextLevel,
  gameModeName,
} from "@uno/shared";
import { useAuth } from "@/lib/auth.js";
import { trpc } from "@/lib/trpc.js";
import { tapFeedback } from "@/lib/native.js";
import { formatEur, formatLongDate } from "@/lib/format.js";
import { Screen } from "@/components/layout/index.js";
import { PushSettings } from "@/components/push-settings.js";
import { DivisionBadge, StatBox } from "@/components/domain/index.js";
import { Flag } from "@/components/flag.js";
import { FutCard } from "@/components/fut-card/fut-card.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ProgressBar,
  SectionTitle,
} from "@/components/ui/index.js";

/** Profil joueur : statistiques, progression et historique (MATCH-006). */
export function ProfileScreen() {
  const navigate = useNavigate();
  const { logout, isAdmin, isSupervisor } = useAuth();

  const profile = trpc.players.me.useQuery();
  const history = trpc.players.history.useQuery({ limit: 20 });

  /*
   * `to` mène à un écran de l'application, `href` à une page publique ouverte
   * dans le navigateur du système.
   *
   * La dernière entrée est une obligation de Google Play : une application qui
   * permet de créer un compte doit offrir, **depuis l'application**, un chemin
   * vers la demande de suppression — et non seulement une adresse enfouie dans
   * la fiche du Store. Le lien mène à la page publique plutôt qu'à un écran
   * interne : la procédure, les durées de conservation et les limites légales
   * n'existent alors qu'à un seul endroit, celui que la console déclare.
   */
  const links: {
    icon: LucideIcon;
    label: string;
    to?: string;
    href?: string;
  }[] = [
    { icon: Package, label: "Mes commandes", to: "/commandes" },
    { icon: Gamepad2, label: "Modes de jeu", to: "/modes" },
    { icon: Info, label: "Informations et règlement", to: "/infos" },
    { icon: KeyRound, label: "Changer mon mot de passe", to: "/profil/mot-de-passe" },
    {
      icon: Trash2,
      label: "Supprimer mon compte",
      href: "https://unoleague.be/suppression-compte.html",
    },
  ];

  return (
    <Screen title="Profil">
      <Async query={profile}>
        {(player) => (
          <div className="space-y-5">
            {/* Carte joueur */}
            <Card className="bg-gradient-to-br from-primary/50 via-surface to-surface text-center">
              <div className="flex justify-center py-2">
                <FutCard player={toCardPlayer(player)} size="lg" animated />
              </div>

              <h2 className="mt-3 text-xl font-bold">
                {player.displayName}{" "}
                <Flag countryCode={player.nationality} />
              </h2>
              <div className="mt-2 flex items-center justify-center gap-2">
                <DivisionBadge division={player.division} emptyLabel="Arbitre" />
                <Badge tone="primary">{POSITION_LABELS[player.position]}</Badge>
              </div>

              <div className="mt-4 flex items-center justify-center gap-6">
                <div>
                  <p className="text-2xl font-black tabular-nums text-accent">
                    {player.unoPoints}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-muted">UNO</p>
                </div>
                <div className="h-8 w-px bg-border" aria-hidden />
                <div>
                  <p className="text-2xl font-black tabular-nums">{player.level}</p>
                  <p className="text-[11px] uppercase tracking-wide text-muted">Niveau</p>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted">{formatEur(player.unoPoints)}</p>

              <div className="mt-4 space-y-1.5">
                <ProgressBar
                  value={Math.round(levelProgress(player.xp) * 100)}
                  max={100}
                  tone="accent"
                  label="Progression du niveau"
                />
                <p className="text-[11px] text-muted">
                  {player.xp} XP · {xpToNextLevel(player.xp)} XP avant le niveau{" "}
                  {player.level + 1}
                </p>
              </div>

              <Button
                variant="secondary"
                className="mt-4"
                fullWidth
                icon={<Pencil className="size-4" aria-hidden />}
                onClick={() => navigate("/profil/modifier")}
              >
                Modifier mon profil
              </Button>
            </Card>

            {/* Statistiques cumulées */}
            <section>
              <SectionTitle>Statistiques</SectionTitle>
              <div className="grid grid-cols-3 gap-2">
                <StatBox label={RANKING_STAT_LABELS.goals} value={player.goals} />
                <StatBox label={RANKING_STAT_LABELS.assists} value={player.assists} />
                <StatBox label={RANKING_STAT_LABELS.defenses} value={player.defenses} />
                <StatBox label={RANKING_STAT_LABELS.saves} value={player.saves} />
                <StatBox label={RANKING_STAT_LABELS.motm} value={player.motm} />
                <StatBox label="Sessions" value={player.matchesPlayed} />
              </div>

              {/* Les totaux disent ce qu'on a accumulé, pas ce qu'on produit :
                  les moyennes et l'évolution vivent derrière ce bouton. */}
              <Button
                variant="secondary"
                fullWidth
                className="mt-2"
                onClick={() => {
                  void tapFeedback();
                  navigate("/profil/statistiques");
                }}
              >
                <BarChart3 className="size-4" aria-hidden />
                Toutes les statistiques
              </Button>
            </section>

            {/* Historique des sessions */}
            <section>
              <SectionTitle>Historique des sessions</SectionTitle>
              <Async query={history}>
                {(sessions) =>
                  sessions.length === 0 ? (
                    <EmptyState
                      title="Aucune session jouée"
                      description="Vos sessions terminées apparaîtront ici."
                    />
                  ) : (
                    <Card className="space-y-3 py-3">
                      {sessions.map((session) => (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => navigate(`/sessions/${session.id}`)}
                          className="flex w-full items-center justify-between gap-3 border-b border-border/40 pb-3 text-left last:border-0 last:pb-0 active:opacity-70"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {gameModeName(session.modeId)}
                            </p>
                            <p className="mt-0.5 truncate text-xs capitalize text-muted">
                              {formatLongDate(session.localDate)} · {session.venueName}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                            {session.localTimeLabel}
                            <ChevronRight className="size-4" aria-hidden />
                          </div>
                        </button>
                      ))}
                    </Card>
                  )
                }
              </Async>
            </section>

            {/* Liens secondaires */}
            <section>
              {/* Le titre vit dans le composant : sans push configuré, la
                  section entière s'efface au lieu de laisser un intitulé seul. */}
              <PushSettings />

              <SectionTitle>Paramètres</SectionTitle>
              <Card className="space-y-0 py-1">
                {links.map((link) =>
                  link.href ? (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[48px] w-full items-center gap-3 border-b border-border/40 py-3 text-left last:border-0 active:opacity-70"
                    >
                      <link.icon className="size-4 shrink-0 text-muted" aria-hidden />
                      <span className="flex-1 text-sm">{link.label}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                    </a>
                  ) : (
                    <button
                      key={link.label}
                      type="button"
                      onClick={() => {
                        if (link.to) navigate(link.to);
                      }}
                      className="flex min-h-[48px] w-full items-center gap-3 border-b border-border/40 py-3 text-left last:border-0 active:opacity-70"
                    >
                      <link.icon className="size-4 shrink-0 text-muted" aria-hidden />
                      <span className="flex-1 text-sm">{link.label}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                    </button>
                  ),
                )}

                {/*
                  SUP-001 : un superviseur qui n'est pas administrateur a sa
                  propre entrée. L'administrateur, lui, saisit depuis la
                  console : deux portes vers le même écran l'égareraient.
                */}
                {isSupervisor && !isAdmin && (
                  <button
                    type="button"
                    onClick={() => navigate("/supervision")}
                    className="flex min-h-[48px] w-full items-center gap-3 py-3 text-left active:opacity-70"
                  >
                    <ShieldCheck className="size-4 shrink-0 text-accent" aria-hidden />
                    <span className="flex-1 text-sm font-medium text-accent">
                      Supervision
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                  </button>
                )}

                {/* Visible uniquement si le serveur reconnaît le rôle admin */}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => navigate("/admin")}
                    className="flex min-h-[48px] w-full items-center gap-3 py-3 text-left active:opacity-70"
                  >
                    <Shield className="size-4 shrink-0 text-accent" aria-hidden />
                    <span className="flex-1 text-sm font-medium text-accent">
                      Administration
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                  </button>
                )}
              </Card>
            </section>

            <Button
              variant="ghost"
              fullWidth
              icon={<LogOut className="size-4" aria-hidden />}
              onClick={() => void logout()}
            >
              Se déconnecter
            </Button>
          </div>
        )}
      </Async>
    </Screen>
  );
}
