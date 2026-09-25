import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  ChevronRight,
  Gamepad2,
  Info,
  KeyRound,
  LogOut,
  Package,
  Pencil,
  Shield,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { levelProgress, toCardPlayer, xpToNextLevel } from "@uno/shared";
import { LOCALES, LOCALE_NAMES } from "@uno/shared";
import { useAuth } from "@/lib/auth.js";
import { useI18n, useLibelles, useNomDeMode, type Cle } from "@/lib/i18n.js";
import { cn } from "@/lib/cn.js";
import { trpc } from "@/lib/trpc.js";
import { tapFeedback } from "@/lib/native.js";
import { bcp47, formatEur, formatLongDate } from "@/lib/format.js";
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
  // Le rang vit dans le tableau de bord, déjà en cache depuis l'accueil.
  const rankingPosition =
    trpc.players.dashboard.useQuery().data?.rankingPosition ?? null;
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
    { icon: Pencil, cle: "profile.edit", to: "/profil/modifier" },
    { icon: Wallet, cle: "wallet.title", to: "/wallet" },
    { icon: ShoppingBag, cle: "shop.title", to: "/boutique" },
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
            {/* Carte joueur : le modèle FUT, inchangé, posé sur la nuit */}
            <section className="relative text-center">
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-4 h-[440px] w-[540px] -translate-x-1/2"
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 42%, rgb(255 120 40 / 0.16) 0%, rgb(76 141 255 / 0.1) 34%, transparent 66%)",
                }}
              />
              <div className="relative flex justify-center pt-1">
                <FutCard player={toCardPlayer(player)} size="lg" animated />
              </div>

              <h2 className="relative mt-4 text-xl font-bold">
                {player.displayName} <Flag countryCode={player.nationality} />
              </h2>
              <div className="relative mt-2 flex items-center justify-center gap-2">
                <DivisionBadge
                  division={player.division}
                  emptyLabel={t("profile.referee")}
                />
                <Badge tone="accent">{L.position[player.position]}</Badge>
              </div>
            </section>

            {/* Niveau */}
            <Card>
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-baseline gap-2">
                  <span className="font-display text-[30px] font-extrabold uppercase italic leading-none">
                    {t("profile.levelShort", { level: player.level })}
                  </span>
                  <span className="text-[13px] text-muted">
                    → {t("profile.levelNext", { next: player.level + 1 })}
                  </span>
                </p>
                <span className="font-display text-[16px] font-bold tabular-nums text-flood">
                  {player.xp} XP
                </span>
              </div>
              <div className="mt-3">
                <ProgressBar
                  value={Math.round(levelProgress(player.xp) * 100)}
                  max={100}
                  tone="primary"
                  label={t("profile.levelProgress")}
                />
              </div>
              <p className="mt-2 text-[13px] text-muted">
                {t("profile.xpLeftReward", { left: xpToNextLevel(player.xp) })}
              </p>
            </Card>

            {/* Solde et classement */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  void tapFeedback();
                  navigate("/wallet");
                }}
                className="rounded-card border border-accent/30 bg-surface px-4 py-3.5 text-left transition-all active:scale-[0.98] active:opacity-70"
              >
                <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                  {t("profile.balance")}
                </span>
                <span className="mt-1 block font-display text-[30px] font-extrabold italic leading-none tabular-nums text-orange-300">
                  {new Intl.NumberFormat(bcp47()).format(player.unoPoints)}{" "}
                  <span className="text-[16px] not-italic">UNO</span>
                </span>
                <span className="mt-1 block text-[12px] text-muted">
                  {formatEur(player.unoPoints)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  void tapFeedback();
                  navigate("/classement");
                }}
                className="rounded-card border border-border bg-surface px-4 py-3.5 text-left transition-all active:scale-[0.98] active:opacity-70"
              >
                <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                  {t("home.rankTile")}
                </span>
                <span className="mt-1 block font-display text-[30px] font-extrabold italic leading-none tabular-nums">
                  {rankingPosition
                    ? t("home.rankValue", { position: rankingPosition })
                    : "—"}
                </span>
                <span className="mt-1 block text-[12px] text-muted">
                  {player.division
                    ? t("home.divisionName", { n: player.division.slice(1) })
                    : t("profile.referee")}
                </span>
              </button>
            </div>

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

            {/*
              Chaque bloc a sa propre section : l'espacement entre sections
              les sépare. Réunis dans une seule, le titre « Langue » venait
              buter contre la carte des notifications.

              Le titre des notifications vit dans le composant : sans push
              configuré, la section entière s'efface (`empty:hidden`) au lieu
              de laisser un intitulé seul — ou un espace vide.
            */}
            <section className="empty:hidden">
              <PushSettings />
            </section>

            <section>
              <SectionTitle>{t("settings.language")}</SectionTitle>
              <Card>
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
                          ? "bg-accent font-semibold text-background"
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
            </section>

            {/* Liens secondaires */}
            <section>
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
                      <span className="flex-1 text-[15px] font-semibold">
                        {t(link.cle)}
                      </span>
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
                      <span className="flex-1 text-[15px] font-semibold">
                        {t(link.cle)}
                      </span>
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
