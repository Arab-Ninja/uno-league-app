import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Award,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  Info,
  MapPin,
  ShieldAlert,
  Users,
  Wrench,
} from "lucide-react";
import {
  getGameMode,
  type AnnouncementType,
  type Division,
  type ProposalSummary,
  type TransactionLink,
  type TransactionType,
} from "@uno/shared";
import { imageSrc } from "@/lib/images.js";
import { useLibelles, useT } from "@/lib/i18n.js";
import { tapFeedback } from "@/lib/native.js";
import { cn } from "@/lib/cn.js";
import {
  formatLongDate,
  formatRelative,
  formatSignedUno,
  initials,
} from "@/lib/format.js";
import { Flag } from "@/components/flag.js";
import { Badge, PressableCard, ProgressBar } from "@/components/ui/index.js";

/** Composants métier réutilisés entre écrans. */

export function Avatar({
  name,
  url,
  size = "md",
  division,
}: {
  name: string;
  url?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  /** `null` pour un arbitre, qui n'a pas de division : pas d'anneau. */
  division?: Division | null;
}) {
  const sizes = {
    sm: "size-8 text-xs",
    md: "size-11 text-sm",
    lg: "size-16 text-lg",
    xl: "size-24 text-2xl",
  };

  const ring = {
    D1: "ring-accent",
    D2: "ring-muted",
    D3: "ring-border",
  };

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "bg-gradient-to-br from-primary to-primary-bright font-bold text-foreground",
        division &&
          `ring-2 ring-offset-2 ring-offset-background ${ring[division]}`,
        sizes[size],
      )}
    >
      {url ? (
        <img
          src={imageSrc(url)}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </div>
  );
}

/**
 * Division d'une proposition ou d'un joueur.
 *
 * `emptyLabel` distingue les deux absences : une proposition sans division est
 * ouverte à toute la ligue, un joueur sans division est un arbitre (ROLE-003).
 * Les confondre afficherait « toutes divisions » sous une carte d'arbitre.
 */
export function DivisionBadge({
  division,
  emptyLabel,
}: {
  division: Division | null;
  emptyLabel?: string;
}) {
  const t = useT();
  if (!division) {
    return (
      <Badge tone="neutral">{emptyLabel ?? t("session.allDivisions")}</Badge>
    );
  }
  const tone =
    division === "D1" ? "accent" : division === "D2" ? "primary" : "neutral";
  return (
    <Badge tone={tone} className="uppercase">
      {division}
    </Badge>
  );
}

export function DivisionLabel({ division }: { division: Division }) {
  const L = useLibelles();
  return <>{L.division[division]}</>;
}

/**
 * La teinte d'un état de proposition — son libellé vit au dictionnaire.
 *
 * Deux vocabulaires cohabitent pour ces cinq états : la pastille dit l'objet
 * (« Réservation »), l'écran de détail dit ce qu'on attend (« Paiements
 * attendus »). Les fondre en un seul mot ferait perdre l'une des deux.
 */
const STATUS_TONE = {
  proposal: "primary" as const,
  reservation: "warning" as const,
  session: "success" as const,
  completed: "neutral" as const,
  cancelled: "error" as const,
};

export function ProposalStatusBadge({
  status,
}: {
  status: ProposalSummary["status"];
}) {
  const L = useLibelles();
  return <Badge tone={STATUS_TONE[status]}>{L.proposalBadge[status]}</Badge>;
}

/** Carte de session utilisée sur le dashboard et dans le calendrier. */
export function SessionCard({
  proposal,
  onOpen,
}: {
  proposal: ProposalSummary;
  onOpen: () => void;
}) {
  const t = useT();
  const L = useLibelles();
  const mode = getGameMode(proposal.modeId);
  const isFull = proposal.participantCount >= proposal.minParticipants;
  const modeName = mode ? L.gameMode[mode.id] : proposal.modeId;

  return (
    <PressableCard
      onClick={onOpen}
      label={t("session.label", {
        mode: modeName,
        date: proposal.localDate,
      })}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{modeName}</p>
          <p className="mt-0.5 text-xs capitalize text-muted">
            {formatLongDate(proposal.localDate)}
          </p>
        </div>
        <ProposalStatusBadge status={proposal.status} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5" aria-hidden />
          {proposal.localTimeLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <MapPin className="size-3.5" aria-hidden />
          {proposal.venueName}
        </span>
        <DivisionBadge division={proposal.division} />
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-muted">
            <Users className="size-3.5" aria-hidden />
            {/*
              Une réservation ouverte aux remplaçants compte plus d'inscrits
              que de places : le surnombre est fait de remplaçants qui ont
              déjà réglé, pas d'une erreur de compte.
            */}
            {proposal.participantCount > proposal.minParticipants
              ? `${t("session.slots", { count: proposal.minParticipants })} · ${t(
                  proposal.participantCount - proposal.minParticipants > 1
                    ? "session.substitutesPlural"
                    : "session.substitutes",
                  {
                    count: proposal.participantCount - proposal.minParticipants,
                  },
                )}`
              : t("session.filled", {
                  count: proposal.participantCount,
                  total: proposal.minParticipants,
                })}
          </span>
          {proposal.viewer?.hasPaid ? (
            <span className="flex items-center gap-1 font-medium text-success">
              <CheckCircle2 className="size-3.5" aria-hidden />
              {t("session.paid")}
            </span>
          ) : (
            <span className="font-medium text-accent">
              {proposal.priceUno} UNO
            </span>
          )}
        </div>
        <ProgressBar
          value={proposal.participantCount}
          max={proposal.minParticipants}
          tone={isFull ? "success" : "accent"}
          label={t("session.progress")}
        />
      </div>
    </PressableCard>
  );
}

const ANNOUNCEMENT_META: Record<
  AnnouncementType,
  { icon: typeof Info; tone: string }
> = {
  info: { icon: Info, tone: "text-blue-300 bg-primary/20" },
  alert: { icon: ShieldAlert, tone: "text-red-300 bg-error/15" },
  reward: { icon: Award, tone: "text-accent bg-accent/15" },
  maintenance: { icon: Wrench, tone: "text-warning bg-warning/15" },
};

export function AnnouncementRow({
  announcement,
  onOpen,
}: {
  announcement: {
    id: number;
    type: AnnouncementType;
    title: string;
    publishedAt: string;
    read: boolean;
  };
  onOpen: () => void;
}) {
  const t = useT();
  const L = useLibelles();
  const meta = ANNOUNCEMENT_META[announcement.type];
  const Icon = meta.icon;

  return (
    <PressableCard
      onClick={onOpen}
      label={t("session.announcement", { title: announcement.title })}
      className="flex items-center gap-3"
    >
      <div className={cn("rounded-xl p-2.5", meta.tone)}>
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm",
            announcement.read ? "font-normal text-muted" : "font-semibold",
          )}
        >
          {announcement.title}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {L.announcementType[announcement.type]} ·{" "}
          {formatRelative(announcement.publishedAt)}
        </p>
      </div>
      {!announcement.read && (
        <span
          aria-label={t("session.unread")}
          className="size-2 shrink-0 rounded-full bg-accent"
        />
      )}
    </PressableCard>
  );
}

/**
 * Ligne du registre (WAL-004).
 *
 * Une écriture renvoie presque toujours à quelque chose de consultable : la
 * session payée, la commande passée, le joueur d'en face. La ligne devient
 * alors cliquable et mène droit à l'objet — le serveur ayant déjà résolu la
 * destination, l'interface n'a rien à deviner.
 *
 * Les écritures sans suite — bonus de bienvenue, ajustement administratif —
 * restent de simples lignes : rendre cliquable ce qui ne mène nulle part est
 * une promesse rompue.
 */
export function TransactionRow({
  transaction,
}: {
  transaction: {
    id: number;
    type: TransactionType;
    amount: number;
    balanceAfter: number;
    description: string;
    createdAt: string;
    counterpartyName?: string | null;
    link?: TransactionLink | null;
  };
}) {
  const t = useT();
  const L = useLibelles();
  const navigate = useNavigate();
  const isCredit = transaction.amount > 0;
  const link = transaction.link ?? null;

  function open() {
    if (!link) return;
    void tapFeedback();
    if (link.kind === "session") navigate(`/sessions/${link.id}`);
    else if (link.kind === "order") navigate("/commandes");
    else navigate(`/classement?joueur=${link.id}`);
  }

  const body = (
    <>
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          isCredit
            ? "bg-success/15 text-success"
            : "bg-surface-raised text-muted",
        )}
      >
        {isCredit ? "+" : "−"}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {transaction.description}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
          <span className="truncate">
            {L.transactionType[transaction.type] ?? transaction.type} ·{" "}
            {formatRelative(transaction.createdAt)}
          </span>
        </p>
      </div>
      <div className="text-right">
        <p
          className={cn(
            "text-sm font-semibold tabular-nums",
            isCredit ? "text-success" : "text-foreground",
          )}
        >
          {formatSignedUno(transaction.amount)}
        </p>
        <p className="text-[11px] text-muted tabular-nums">
          {t("session.balance", { amount: transaction.balanceAfter })}
        </p>
      </div>
      {link && (
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
      )}
    </>
  );

  if (!link) {
    return (
      <div className="flex items-center gap-3 border-b border-border/40 py-3 last:border-0">
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      aria-label={`${transaction.description} — ${link.label}`}
      className="flex w-full items-center gap-3 border-b border-border/40 py-3 text-left transition-colors last:border-0 hover:bg-surface-raised/50 active:opacity-70"
    >
      {body}
    </button>
  );
}

export function PlayerRow({
  position,
  displayName,
  nationality,
  profilePhotoUrl,
  division,
  value,
  statLabel,
  highlighted,
  onOpen,
}: {
  position: number;
  displayName: string;
  nationality: string;
  profilePhotoUrl: string | null;
  division: Division;
  value: number;
  statLabel: string;
  highlighted?: boolean;
  /** Ouvre la carte du joueur ; la ligne devient alors un bouton. */
  onOpen?: () => void;
}) {
  const t = useT();
  const L = useLibelles();
  const medal =
    position === 1
      ? "🥇"
      : position === 2
        ? "🥈"
        : position === 3
          ? "🥉"
          : null;
  const Element = onOpen ? "button" : "div";

  return (
    <Element
      {...(onOpen
        ? {
            type: "button" as const,
            onClick: onOpen,
            "aria-label": t("session.openCard", { name: displayName }),
          }
        : {})}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
        onOpen && "active:opacity-70",
        highlighted
          ? "bg-accent/10 ring-1 ring-accent/40"
          : "hover:bg-surface-raised/60",
      )}
    >
      <span className="w-7 shrink-0 text-center text-sm font-bold tabular-nums text-muted">
        {medal ?? position}
      </span>
      <Avatar name={displayName} url={profilePhotoUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {displayName} <Flag countryCode={nationality} />
        </p>
        <p className="text-xs text-muted">{L.division[division]}</p>
      </div>
      <div className="text-right">
        <p className="text-base font-bold tabular-nums text-accent">{value}</p>
        <p className="text-[10px] uppercase tracking-wide text-muted">
          {statLabel}
        </p>
      </div>
    </Element>
  );
}

export function StatBox({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-3 py-3 text-center">
      {icon && (
        <div className="mb-1 flex justify-center text-muted">{icon}</div>
      )}
      <p className="font-display text-[26px] font-extrabold italic leading-none tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
        {label}
      </p>
    </div>
  );
}

export function UnreadBell({ count }: { count: number }) {
  const t = useT();
  return (
    <span className="relative inline-flex">
      <Bell className="size-5" aria-hidden />
      {count > 0 && (
        <span
          aria-label={t("session.unreadCount", { count })}
          className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-background"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </span>
  );
}
