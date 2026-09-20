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
import { levelProgress, toCardPlayer, xpToNextLevel } from "@uno/shared";
import { LOCALES, LOCALE_NAMES } from "@uno/shared";
import { useAuth } from "@/lib/auth.js";
import { useI18n, useLibelles, useNomDeMode, type Cle } from "@/lib/i18n.js";
import { cn } from "@/lib/cn.js";
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
  const { locale, t } = useI18n();
  const L = useLibelles();
  const nomDeMode = useNomDeMode();
  const utils = trpc.useUtils();
  const setLocale = trpc.players.setLocale.useMutation({
    // La langue voyage dans la session : il faut la relire pour que l'écran
    // bascule sans rechargement.
    onSuccess: () => utils.auth.me.invalidate(),
  });
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
    cle: Cle;
    to?: string;
    href?: string;
  }[] = [
    { icon: Package, cle: "profile.myOrders", to: "/commandes" },
    { icon: Gamepad2, cle: "profile.gameModes", to: "/modes" },
    { icon: Info, cle: "profile.info", to: "/infos" },
    {
      icon: KeyRound,
      cle: "profile.changePassword",
      to: "/profil/mot-de-passe",
    },
    {
      icon: Trash2,
      cle: "profile.deleteAccount",
      href: "https://unoleague.be/suppression-compte.html",
    },
  ];

  return (
    <Screen title={t("profile.title")}>
      <Async query={profile}>
        {(player) => (
          <div className="space-y-5">
            {/* Carte joueur */}
            <Card className="bg-gradient-to-br from-primary/50 via-surface to-surface text-center">
              <div className="flex justify-center py-2">
                <FutCard player={toCardPlayer(player)} size="lg" animated />
              </div>

              <h2 className="mt-3 text-xl font-bold">
                {player.displayName} <Flag countryCode={player.nationality} />
              </h2>
              <div className="mt-2 flex items-center justify-center gap-2">
                <DivisionBadge
                  division={player.division}
                  emptyLabel={t("profile.referee")}
                />
                <Badge tone="primary">{L.position[player.position]}</Badge>
              </div>

              <div className="mt-4 flex items-center justify-center gap-6">
                <div>
                  <p className="text-2xl font-black tabular-nums text-accent">
                    {player.unoPoints}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-muted">
                    UNO
                  </p>
                </div>
                <div className="h-8 w-px bg-border" aria-hidden />
                <div>
                  <p className="text-2xl font-black tabular-nums">
                    {player.level}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-muted">
                    {t("profile.level")}
                  </p>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted">
                {formatEur(player.unoPoints)}
              </p>

              <div className="mt-4 space-y-1.5">
                <ProgressBar
                  value={Math.round(levelProgress(player.xp) * 100)}
                  max={100}
                  tone="accent"
                  label={t("profile.levelProgress")}
                />
                <p className="text-[11px] text-muted">
                  {t("profile.xpToNext", {
                    xp: player.xp,
                    left: xpToNextLevel(player.xp),
                    next: player.level + 1,
                  })}
                </p>
              </div>

              <Button
                variant="secondary"
                className="mt-4"
                fullWidth
                icon={<Pencil className="size-4" aria-hidden />}
                onClick={() => navigate("/profil/modifier")}
              >
                {t("profile.edit")}
              </Button>
            </Card>

            {/* Statistiques cumulées */}
            <section>
              <SectionTitle>{t("profile.statistics")}</SectionTitle>
              <div className="grid grid-cols-3 gap-2">
                <StatBox label={L.rankingStat.goals} value={player.goals} />
                <StatBox label={L.rankingStat.assists} value={player.assists} />
                <StatBox
                  label={L.rankingStat.defenses}
                  value={player.defenses}
                />
                <StatBox label={L.rankingStat.saves} value={player.saves} />
                <StatBox label={L.rankingStat.motm} value={player.motm} />
                <StatBox
                  label={t("profile.sessions")}
                  value={player.matchesPlayed}
                />
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
                {t("profile.allStats")}
              </Button>
            </section>

            {/* Historique des sessions */}
            <section>
              <SectionTitle>{t("profile.history")}</SectionTitle>
              <Async query={history}>
                {(sessions) =>
                  sessions.length === 0 ? (
                    <EmptyState
                      title={t("profile.historyEmptyTitle")}
                      description={t("profile.historyEmptyBody")}
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
                              {nomDeMode(session.modeId)}
                            </p>
                            <p className="mt-0.5 truncate text-xs capitalize text-muted">
                              {formatLongDate(session.localDate)} ·{" "}
                              {session.venueName}
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

              <SectionTitle>{t("settings.language")}</SectionTitle>
              <Card className="mb-4">
                {/*
                 * La langue vit sur le compte, pas sur l'appareil : elle suit
                 * le joueur d'un téléphone à l'autre, et surtout elle décide
                 * de la langue de ses courriels — qui partent du serveur, des
                 * heures plus tard, sans appareil en face.
                 */}
                <div className="flex flex-wrap gap-2">
                  {LOCALES.map((code) => (
                    <button
                      key={code}
                      type="button"
                      disabled={setLocale.isPending}
                      onClick={() => {
                        if (code !== locale) setLocale.mutate({ locale: code });
                      }}
                      className={cn(
                        "min-h-[40px] rounded-full px-4 text-sm font-medium transition-all active:scale-[0.98]",
                        code === locale
                          ? "bg-accent text-ink-inverse"
                          : "bg-surface-raised text-muted",
                      )}
                    >
                      {LOCALE_NAMES[code]}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted">
                  {t("settings.languageHelp")}
                </p>
              </Card>

              <SectionTitle>{t("profile.settings")}</SectionTitle>
              <Card className="space-y-0 py-1">
                {links.map((link) =>
                  link.href ? (
                    <a
                      key={link.cle}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[48px] w-full items-center gap-3 border-b border-border/40 py-3 text-left last:border-0 active:opacity-70"
                    >
                      <link.icon
                        className="size-4 shrink-0 text-muted"
                        aria-hidden
                      />
                      <span className="flex-1 text-sm">{t(link.cle)}</span>
                      <ChevronRight
                        className="size-4 shrink-0 text-muted"
                        aria-hidden
                      />
                    </a>
                  ) : (
                    <button
                      key={link.cle}
                      type="button"
                      onClick={() => {
                        if (link.to) navigate(link.to);
                      }}
                      className="flex min-h-[48px] w-full items-center gap-3 border-b border-border/40 py-3 text-left last:border-0 active:opacity-70"
                    >
                      <link.icon
                        className="size-4 shrink-0 text-muted"
                        aria-hidden
                      />
                      <span className="flex-1 text-sm">{t(link.cle)}</span>
                      <ChevronRight
                        className="size-4 shrink-0 text-muted"
                        aria-hidden
                      />
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
                    <ShieldCheck
                      className="size-4 shrink-0 text-accent"
                      aria-hidden
                    />
                    <span className="flex-1 text-sm font-medium text-accent">
                      {t("profile.supervision")}
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted"
                      aria-hidden
                    />
                  </button>
                )}

                {/* Visible uniquement si le serveur reconnaît le rôle admin */}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => navigate("/admin")}
                    className="flex min-h-[48px] w-full items-center gap-3 py-3 text-left active:opacity-70"
                  >
                    <Shield
                      className="size-4 shrink-0 text-accent"
                      aria-hidden
                    />
                    <span className="flex-1 text-sm font-medium text-accent">
                      {t("profile.administration")}
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted"
                      aria-hidden
                    />
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
              {t("profile.logout")}
            </Button>
          </div>
        )}
      </Async>
    </Screen>
  );
}
