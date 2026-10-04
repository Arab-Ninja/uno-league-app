import { useState } from "react";
import { Gift } from "lucide-react";
import { formatUno } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { formatDateTime } from "@/lib/format.js";
import { useT } from "@/lib/i18n.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
} from "@/components/ui/index.js";

/**
 * Parrainages (REF-001).
 *
 * Le garde-fou contre les faux comptes : un même joueur inscrit deux fois se
 * repère ici — même visage, parrainé jamais vu au terrain — et s'annule. Les
 * UNO déjà versés sont repris au parrain, dans la limite de son solde.
 */
export function AdminReferrals() {
  const t = useT();
  const utils = trpc.useUtils();
  const referrals = trpc.admin.referrals.useQuery();
  const cancel = trpc.admin.cancelReferral.useMutation();
  const [confirming, setConfirming] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function confirmCancel(referralId: number) {
    setFailure(null);
    setNotice(null);
    try {
      const { reclaimedUno } = await cancel.mutateAsync({ referralId });
      setNotice(
        t("admin.referrals.cancelled", { amount: formatUno(reclaimedUno) }),
      );
      setConfirming(null);
      await utils.admin.referrals.invalidate();
    } catch (caught) {
      setFailure(describeError(caught).message);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{t("admin.referrals.intro")}</p>
      {failure && <ErrorBanner message={failure} />}
      {notice && (
        <div
          role="status"
          className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
        >
          {notice}
        </div>
      )}
      <Async query={referrals}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState
              title={t("admin.referrals.empty")}
              icon={<Gift className="size-6" aria-hidden />}
            />
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <Card key={row.id} className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <p className="truncate font-semibold">
                        {row.referred.displayName}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {t("admin.referrals.by", {
                          name: row.referrer.displayName,
                        })}
                      </p>
                    </div>
                    {row.cancelledAt ? (
                      <Badge tone="error">{t("referral.cancelled")}</Badge>
                    ) : (
                      <Badge tone={row.rewardedUno > 0 ? "success" : "neutral"}>
                        {formatUno(row.rewardedUno)}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    {formatDateTime(row.createdAt.toISOString())}
                    {" · "}
                    {t("admin.referrals.sessions", { count: row.paidSessions })}
                  </p>
                  {!row.cancelledAt &&
                    (confirming === row.id ? (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => setConfirming(null)}
                        >
                          {t("admin.referrals.keep")}
                        </Button>
                        <Button
                          variant="danger"
                          loading={cancel.isPending}
                          onClick={() => void confirmCancel(row.id)}
                        >
                          {t("admin.referrals.confirm")}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => setConfirming(row.id)}
                      >
                        {t("admin.referrals.cancel")}
                      </Button>
                    ))}
                </Card>
              ))}
            </div>
          )
        }
      </Async>
    </div>
  );
}
