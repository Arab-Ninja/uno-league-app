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

  const links = [
    { icon: Package, label: "Mes commandes", to: "/commandes" },
    { icon: Gamepad2, label: "Modes de jeu", to: "/modes" },
    { icon: Info, label: "Informations et règlement", to: "/infos" },
    { icon: KeyRound, label: "Changer mon mot de passe", to: "/profil/mot-de-passe" },
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
              <SectionTitle>Notifications</SectionTitle>
              <PushSettings />

              <SectionTitle>Paramètres</SectionTitle>
              <Card className="space-y-0 py-1">
                {links.map((link) => (
                  <button
                    key={link.to}
                    type="button"
                    onClick={() => navigate(link.to)}
                    className="flex min-h-[48px] w-full items-center gap-3 border-b border-border/40 py-3 text-left last:border-0 active:opacity-70"
                  >
                    <link.icon className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="flex-1 text-sm">{link.label}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                  </button>
                ))}

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
