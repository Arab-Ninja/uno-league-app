import { useEffect, useState } from "react";
import { Check, RefreshCw, Search, Share2, UserPlus, X } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import type { SquadView } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { useT, type Cle } from "@/lib/i18n.js";
import { notificationFeedback, tapFeedback } from "@/lib/native.js";
import { shareLink } from "@/lib/share.js";
import { Button, ErrorBanner, Input } from "@/components/ui/index.js";
import { Avatar, DivisionBadge } from "@/components/domain/index.js";

type InvitableSquad = Pick<SquadView, "id" | "name" | "slug">;

/**
 * Inviter des joueurs dans son club (CLUB-004).
 *
 * Deux chemins dans la même feuille, comme pour une séance : un joueur de
 * l'application, cherché par son nom et prévenu par notification ; ou un
 * lien à partager, pour qui n'a pas encore l'application — il s'inscrit, et
 * le lien le ramène sur le club, qu'il rejoint d'un geste.
 */
export function SquadInviteButton({
  squad,
  className,
  initiallyOpen = false,
  onClosed,
}: {
  squad: InvitableSquad;
  className?: string;
  /** Ouvrir la feuille d'emblée : juste après la fondation du club. */
  initiallyOpen?: boolean;
  onClosed?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <>
      <Button
        variant="secondary"
        fullWidth
        className={className}
        onClick={() => {
          void tapFeedback();
          setOpen(true);
        }}
      >
        <UserPlus className="size-[18px]" aria-hidden />
        {t("clubInvite.button")}
      </Button>
      {open && (
        <SquadInviteSheet
          squad={squad}
          onClose={() => {
            setOpen(false);
            onClosed?.();
          }}
        />
      )}
    </>
  );
}

const STATE_LABEL: Record<"member" | "otherClub", Cle> = {
  member: "clubInvite.stateMember",
  otherClub: "clubInvite.stateOtherClub",
};

function SquadInviteSheet({
  squad,
  onClose,
}: {
  squad: InvitableSquad;
  onClose: () => void;
}) {
  const t = useT();
  const utils = trpc.useUtils();
  const invite = trpc.squads.invite.useMutation();
  const cancel = trpc.squads.cancelInvitation.useMutation();
  const sent = trpc.squads.sentInvitations.useQuery({ squadId: squad.id });

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);

  // On attend que la frappe se pose : une requête par lettre ne sert à rien.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const candidates = trpc.squads.inviteCandidates.useQuery(
    { squadId: squad.id, query },
    { enabled: query.length >= 2 },
  );

  async function inviteOne(playerId: number) {
    void tapFeedback();
    setFailure(null);
    setPending(playerId);
    try {
      await invite.mutateAsync({ squadId: squad.id, playerIds: [playerId] });
      await notificationFeedback();
      await utils.squads.inviteCandidates.invalidate();
      await utils.squads.sentInvitations.invalidate({ squadId: squad.id });
    } catch (caught) {
      setFailure(describeError(caught).message);
    } finally {
      setPending(null);
    }
  }

  async function cancelOne(invitationId: number) {
    void tapFeedback();
    setFailure(null);
    try {
      await cancel.mutateAsync({ invitationId });
      await utils.squads.sentInvitations.invalidate({ squadId: squad.id });
      await utils.squads.inviteCandidates.invalidate();
    } catch (caught) {
      setFailure(describeError(caught).message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("clubInvite.sheetTitle")}
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-[520px] animate-rise overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-3xl border-t border-border bg-background px-5 pt-4"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 1.5rem)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full bg-border"
          aria-hidden
        />

        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[24px] font-extrabold uppercase italic leading-none">
            {t("clubInvite.sheetTitle")}
          </h2>
          <button
            type="button"
            aria-label={t("invite.close")}
            onClick={() => {
              void tapFeedback();
              onClose();
            }}
            className="flex size-11 items-center justify-center rounded-full text-muted hover:text-foreground active:opacity-70"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {/* Un joueur de l'application */}
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
          {t("clubInvite.inAppTitle")}
        </p>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("invite.searchPlaceholder")}
            aria-label={t("invite.searchPlaceholder")}
            className="pl-10"
          />
        </div>

        {failure && (
          <div className="mt-3">
            <ErrorBanner message={failure} />
          </div>
        )}

        <div className="mt-3 min-h-[64px]">
          {query.length < 2 ? (
            <p className="py-3 text-center text-[13px] text-muted">
              {t("invite.searchHint")}
            </p>
          ) : candidates.isPending ? (
            <p className="py-3 text-center text-[13px] text-muted">
              {t("invite.searching")}
            </p>
          ) : (candidates.data ?? []).length === 0 ? (
            <p className="py-3 text-center text-[13px] text-muted">
              {t("invite.noResult")}
            </p>
          ) : (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-card border border-border bg-surface">
              {candidates.data!.map(({ player, state }) => (
                <li
                  key={player.id}
                  className="flex min-h-[56px] items-center gap-3 px-3.5 py-2"
                >
                  <Avatar
                    name={player.displayName}
                    url={player.profilePhotoUrl}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">
                      {player.displayName}
                    </span>
                    {player.division && (
                      <span className="mt-0.5 block">
                        <DivisionBadge division={player.division} />
                      </span>
                    )}
                  </span>
                  {state === "invitable" ? (
                    <button
                      type="button"
                      disabled={pending !== null}
                      onClick={() => void inviteOne(player.id)}
                      className="shrink-0 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-bold text-background transition-opacity active:opacity-80 disabled:opacity-60"
                    >
                      {pending === player.id
                        ? t("invite.sending")
                        : t("invite.inviteOne")}
                    </button>
                  ) : state === "invited" ? (
                    <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-success">
                      <Check className="size-4" aria-hidden />
                      {t("invite.invited")}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[12px] text-muted">
                      {t(STATE_LABEL[state])}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          {t("clubInvite.notifyNote")}
        </p>

        {/* Les invitations qui attendent une réponse */}
        {(sent.data ?? []).length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
              {t("clubInvite.pendingTitle", { count: sent.data!.length })}
            </p>
            <ul className="divide-y divide-border/60 overflow-hidden rounded-card border border-border bg-surface">
              {sent.data!.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex min-h-[48px] items-center gap-3 px-3.5 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-[14px]">
                    {invitation.player.displayName}
                  </span>
                  <button
                    type="button"
                    disabled={cancel.isPending}
                    onClick={() => void cancelOne(invitation.id)}
                    className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] text-muted hover:text-red-300 disabled:opacity-60"
                  >
                    {t("clubInvite.cancel")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Ou un lien, pour qui n'a pas encore l'application */}
        <div className="my-5 flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            {t("invite.or")}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <ShareSquadLink squad={squad} onError={setFailure} />
      </div>
    </div>
  );
}

/**
 * Le lien d'invitation du club, par la feuille de partage du téléphone.
 *
 * Il ouvre la page du club avec l'invitation ; sans compte, on passe par
 * l'inscription et on y revient. Le renouveler rend l'ancien inutilisable —
 * c'est le geste à faire quand il a circulé plus loin que prévu.
 */
function ShareSquadLink({
  squad,
  onError,
}: {
  squad: InvitableSquad;
  onError: (message: string | null) => void;
}) {
  const t = useT();
  const config = trpc.proposals.config.useQuery();
  const link = trpc.squads.inviteLink.useMutation();
  const [copied, setCopied] = useState(false);
  const [renewed, setRenewed] = useState(false);

  /*
   * L'adresse publique configurée côté serveur passe avant celle de la page :
   * dans l'application, la page vit sur `https://localhost`, et un lien vers
   * elle ne mènerait nulle part.
   */
  const base =
    config.data?.publicWebUrl ??
    (Capacitor.isNativePlatform() ? null : window.location.origin);

  async function share(renew: boolean) {
    void tapFeedback();
    onError(null);
    try {
      const { token } = await link.mutateAsync({ squadId: squad.id, renew });
      if (renew) {
        setRenewed(true);
        setTimeout(() => setRenewed(false), 2500);
        return;
      }
      const url = base
        ? `${base}/squad/${encodeURIComponent(squad.slug)}?invitation=${encodeURIComponent(token)}`
        : null;
      const outcome = await shareLink({
        title: t("clubInvite.shareTitle"),
        text: t("clubInvite.shareText", { club: squad.name }),
        url,
      });
      if (outcome === "copied") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (caught) {
      onError(describeError(caught).message);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        fullWidth
        loading={link.isPending}
        onClick={() => void share(false)}
      >
        {copied ? (
          <Check className="size-[18px]" aria-hidden />
        ) : (
          <Share2 className="size-[18px]" aria-hidden />
        )}
        <span aria-live="polite" className={cn(copied && "text-success")}>
          {copied ? t("invite.copied") : t("clubInvite.shareLink")}
        </span>
      </Button>
      <p className="text-center text-[12px] text-muted">
        {t("clubInvite.shareHint")}
      </p>
      <button
        type="button"
        disabled={link.isPending}
        onClick={() => void share(true)}
        className="mx-auto flex items-center gap-1.5 text-[12px] text-muted hover:text-foreground disabled:opacity-60"
      >
        <RefreshCw className="size-3.5" aria-hidden />
        <span aria-live="polite" className={cn(renewed && "text-success")}>
          {renewed ? t("clubInvite.renewed") : t("clubInvite.renew")}
        </span>
      </button>
    </div>
  );
}

/**
 * Les invitations reçues, à accepter ou refuser (CLUB-004).
 *
 * Accepter fait entrer dans le club : il n'y a pas d'étape de plus, le club
 * a déjà dit oui en invitant.
 */
export function SquadInvitationActions({
  invitationId,
  onDone,
}: {
  invitationId: number;
  onDone?: () => void;
}) {
  const t = useT();
  const utils = trpc.useUtils();
  const respond = trpc.squads.respondInvitation.useMutation();
  const [failure, setFailure] = useState<string | null>(null);

  async function run(accept: boolean) {
    void tapFeedback();
    setFailure(null);
    try {
      await respond.mutateAsync({ invitationId, accept });
      if (accept) await notificationFeedback();
      await utils.squads.mine.invalidate();
      await utils.squads.detail.invalidate();
      await utils.squads.get.invalidate();
      onDone?.();
    } catch (caught) {
      setFailure(describeError(caught).message);
    }
  }

  return (
    <div className="space-y-2">
      {failure && <ErrorBanner message={failure} />}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          loading={respond.isPending}
          onClick={() => void run(false)}
        >
          {t("clubInvite.decline")}
        </Button>
        <Button
          variant="accent"
          className="flex-1"
          loading={respond.isPending}
          onClick={() => void run(true)}
        >
          {t("clubInvite.accept")}
        </Button>
      </div>
    </div>
  );
}
