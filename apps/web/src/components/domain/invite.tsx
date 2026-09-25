import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import type { ProposalSummary } from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { useLibelles, useT } from "@/lib/i18n.js";
import { formatLongDate } from "@/lib/format.js";
import { tapFeedback } from "@/lib/native.js";
import { shareLink } from "@/lib/share.js";
import { Button } from "@/components/ui/index.js";

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
 * Le message dit l'essentiel sans ouvrir le lien — le mode, le jour, l'heure,
 * la salle, et combien de places restent — parce que c'est ce qu'on lit dans
 * une conversation avant de décider de toucher quoi que ce soit.
 *
 * Le lien mène à la séance sur le site : l'ami sans l'application peut s'y
 * inscrire depuis son navigateur, et celui qui n'a pas encore de compte y
 * revient après s'être inscrit (voir `return-to`).
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
  const L = useLibelles();
  const config = trpc.proposals.config.useQuery();
  const [copied, setCopied] = useState(false);

  async function invite() {
    void tapFeedback();

    // Dans l'application, la page vit sur `https://localhost` : seule
    // l'adresse publique configurée côté serveur peut être partagée.
    const base = Capacitor.isNativePlatform()
      ? (config.data?.publicWebUrl ?? null)
      : window.location.origin;
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
    <Button
      variant={variant}
      className={className}
      onClick={() => void invite()}
    >
      {copied ? (
        <Check className="size-[18px]" aria-hidden />
      ) : (
        <Share2 className="size-[18px]" aria-hidden />
      )}
      <span aria-live="polite">
        {copied ? t("invite.copied") : t("invite.button")}
      </span>
    </Button>
  );
}
