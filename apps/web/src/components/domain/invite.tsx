import { useEffect, useState } from "react";
import { Check, Search, Share2, UserPlus, X } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import type { ProposalSummary } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { useLibelles, useT, type Cle } from "@/lib/i18n.js";
import { formatLongDate } from "@/lib/format.js";
import { notificationFeedback, tapFeedback } from "@/lib/native.js";
import { shareLink } from "@/lib/share.js";
import { Button, ErrorBanner, Input } from "@/components/ui/index.js";
import { Avatar, DivisionBadge } from "./index.js";

type Invitable = Pick<
  ProposalSummary,
  | "id"
  | "modeId"
  | "localDate"
  | "localTimeLabel"
  | "venueName"
  | "minParticipants"
  | "participantCount"
>;

/**
 * Inviter des amis à une séance qui cherche encore des joueurs.
 *
 * Il vit sur l'écran de la séance, et là seulement : c'est là qu'on décide
 * d'en parler autour de soi, pas en passant sur l'accueil.
 *
 * Deux chemins dans la même feuille (CAL-012) : un joueur de l'application,
 * qu'on cherche par son nom et qui reçoit une notification ; ou un lien à
 * partager, pour ceux qui n'y sont pas encore.
 */
export function InviteFriendsButton({
  proposal,
  variant = "secondary",
  className,
}: {
  proposal: Invitable;
  variant?: "primary" | "secondary" | "accent";
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        className={className}
        onClick={() => {
          void tapFeedback();
          setOpen(true);
        }}
      >
        <UserPlus className="size-[18px]" aria-hidden />
        {t("invite.button")}
      </Button>
      {open && (
        <InviteSheet proposal={proposal} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/** Ce que dit une ligne de résultat, selon ce que le serveur a tranché. */
const STATE_LABEL: Record<"participant" | "otherDivision" | "referee", Cle> = {
  participant: "invite.stateParticipant",
  otherDivision: "invite.stateOtherDivision",
  referee: "invite.stateReferee",
};

function InviteSheet({
  proposal,
  onClose,
}: {
  proposal: Invitable;
  onClose: () => void;
}) {
  const t = useT();
  const utils = trpc.useUtils();
  const invite = trpc.proposals.invite.useMutation();

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);

  // On attend que la frappe se pose : une requête par lettre ne sert à rien.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const candidates = trpc.proposals.inviteCandidates.useQuery(
    { proposalId: proposal.id, query },
    { enabled: query.length >= 2 },
  );

  async function inviteOne(playerId: number) {
    void tapFeedback();
    setFailure(null);
    setPending(playerId);
    try {
      await invite.mutateAsync({
        proposalId: proposal.id,
        playerIds: [playerId],
      });
      await notificationFeedback();
      await utils.proposals.inviteCandidates.invalidate();
    } catch (caught) {
      setFailure(describeError(caught).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("invite.sheetTitle")}
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-[520px] animate-rise overflow-y-auto rounded-t-3xl border-t border-border bg-background px-5 pt-4"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 1.5rem)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full bg-border"
          aria-hidden
        />

        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[24px] font-extrabold uppercase italic leading-none">
            {t("invite.sheetTitle")}
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
          {t("invite.inAppTitle")}
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
            autoFocus
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
          {t("invite.notifyNote")}
        </p>

        {/* Ou un lien, pour qui n'a pas encore l'application */}
        <div className="my-5 flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            {t("invite.or")}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <ShareLinkButton proposal={proposal} />
        <p className="mt-2 text-center text-[12px] text-muted">
          {t("invite.shareHint")}
        </p>
      </div>
    </div>
  );
}

/**
 * Le lien de la séance, par la feuille de partage du téléphone.
 *
 * Le message dit l'essentiel sans ouvrir le lien — le mode, le jour, l'heure,
 * la salle, et combien de places restent — parce que c'est ce qu'on lit dans
 * une conversation avant de décider de toucher quoi que ce soit.
 */
function ShareLinkButton({ proposal }: { proposal: Invitable }) {
  const t = useT();
  const L = useLibelles();
  const config = trpc.proposals.config.useQuery();
  const [copied, setCopied] = useState(false);

  async function share() {
    void tapFeedback();

    /*
     * L'adresse publique configurée côté serveur (`PUBLIC_WEB_URL`) passe
     * avant celle de la page : on partage le domaine de la ligue, pas
     * l'adresse technique de l'hébergeur par laquelle on est peut-être arrivé.
     * Dans l'application, la page vit sur `https://localhost` : sans adresse
     * configurée, le message part sans lien plutôt qu'avec un lien mort.
     */
    const base =
      config.data?.publicWebUrl ??
      (Capacitor.isNativePlatform() ? null : window.location.origin);
    const url = base ? `${base}/sessions/${proposal.id}` : null;

    const missing = Math.max(
      0,
      proposal.minParticipants - proposal.participantCount,
    );
    const values = {
      mode: L.gameMode[proposal.modeId],
      date: formatLongDate(proposal.localDate),
      time: proposal.localTimeLabel.split(/\s*[-–]\s*/)[0] ?? "",
      venue: proposal.venueName,
      count: missing,
    };
    const text =
      missing > 1
        ? t("invite.textMany", values)
        : missing === 1
          ? t("invite.textOne", values)
          : t("invite.textFull", values);

    const outcome = await shareLink({ title: t("invite.title"), text, url });
    if (outcome === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <Button variant="secondary" fullWidth onClick={() => void share()}>
      {copied ? (
        <Check className="size-[18px]" aria-hidden />
      ) : (
        <Share2 className="size-[18px]" aria-hidden />
      )}
      <span aria-live="polite" className={cn(copied && "text-success")}>
        {copied ? t("invite.copied") : t("invite.shareLink")}
      </span>
    </Button>
  );
}
