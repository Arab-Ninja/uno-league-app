import { useState } from "react";
import { Trash2, Users } from "lucide-react";
import { describeError, trpc } from "@/lib/trpc.js";
import { formatLongDate } from "@/lib/format.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Card,
  ConfirmButton,
  ErrorBanner,
  SectionTitle,
} from "@/components/ui/index.js";
import { useT, useLibelles, useNomDeMode } from "@/lib/i18n.js";

/**
 * Supprimer une session, dissoudre un club (ADMIN-011).
 *
 * **Pourquoi ces écrans existent.** Une ligue qui démarre se peuple d'essais :
 * de fausses séances pour voir un classement se remplir, de faux clubs pour
 * voir un défi se jouer. L'application ne sait rien effacer — et c'est le bon
 * réglage une fois la ligue lancée, un résultat qu'on peut faire disparaître
 * n'en étant plus un. Restait à pouvoir nettoyer avant le lancement.
 *
 * **Ce que l'écran doit dire avant d'agir.** Chaque ligne affiche ce qui va
 * être défait : le nombre de places réglées qui seront remboursées, la caisse
 * qui reviendra au fondateur, les défis qui seront annulés. Un bouton
 * « Supprimer » sans ce décompte demanderait de faire confiance à l'aveugle —
 * or c'est de l'argent réel, sur des comptes réels.
 *
 * La confirmation en deux temps vient de `ConfirmButton` : l'écran s'utilise
 * au pouce, et « Supprimer » y voisine avec des boutons pressés tous les
 * jours.
 */

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function AdminProposalPurge() {
  const t = useT();
  const L = useLibelles();
  const nomDeMode = useNomDeMode();
  const utils = trpc.useUtils();
  const proposals = trpc.admin.deletableProposals.useQuery();
  const remove = trpc.admin.deleteProposal.useMutation();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  async function drop(proposalId: number) {
    setError(null);
    setNotice(null);
    setBusy(proposalId);
    try {
      const result = await remove.mutateAsync({
        proposalId,
        reason: "Nettoyage administrateur",
      });

      // Tout ce qui montrait cette session doit être relu : la console, mais
      // aussi le calendrier et le portefeuille des joueurs remboursés.
      await utils.admin.deletableProposals.invalidate();
      await utils.admin.manageableProposals.invalidate();
      await utils.admin.stats.invalidate();
      await utils.proposals.invalidate();
      await utils.wallet.invalidate();

      setNotice(
        t("admin.purge.deleted") +
          (result.seatsRefunded > 0
            ? t("admin.purge.refunded", {
                seats: result.seatsRefunded,
                uno: result.unoRefunded,
              })
            : "") +
          (result.reopened ? t("admin.purge.reopened") : ""),
      );
    } catch (caught) {
      setError(describeError(caught).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <SectionTitle>{t("admin.purge.sessionTitle")}</SectionTitle>

      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        {t("admin.purge.sessionLead")}
      </p>

      {error && <ErrorBanner message={error} />}
      {notice && (
        <div
          role="status"
          className="mb-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
        >
          {notice}
        </div>
      )}

      <Async query={proposals}>
        {(rows) =>
          rows.length === 0 ? (
            <Card>
              <p className="text-center text-xs text-muted">
                {t("admin.purge.noSession")}
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <Card key={row.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold">
                          {nomDeMode(row.modeId)}
                          {row.division && ` · ${L.division[row.division]}`}
                        </p>
                        <Badge>{L.proposalStatus[row.status]}</Badge>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted">
                        {formatLongDate(row.localDate)} · {row.localTimeLabel} ·{" "}
                        {row.venueName}
                      </p>
                      {/*
                        Le décompte des places réglées est le chiffre qui
                        compte : c'est lui qui dit combien d'argent va
                        ressortir de la caisse.
                      */}
                      <p className="mt-1 text-[11px] text-muted">
                        {t("admin.purge.counts", {
                          players: row.participantCount,
                        })}
                        <span
                          className={row.paidCount > 0 ? "text-accent" : ""}
                        >
                          {t("admin.purge.paid", { count: row.paidCount })}
                        </span>
                        {row.paidCount > 0 &&
                          t("admin.purge.toRefund", {
                            uno: row.paidCount * row.priceUno,
                          })}
                      </p>
                    </div>
                    <ConfirmButton
                      label={<Trash2 className="size-4" aria-hidden />}
                      confirmLabel={t("admin.purge.delete")}
                      loading={busy === row.id}
                      onConfirm={() => void drop(row.id)}
                    />
                  </div>
                </Card>
              ))}
            </div>
          )
        }
      </Async>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Clubs
// ---------------------------------------------------------------------------

export function AdminSquads() {
  const t = useT();
  const utils = trpc.useUtils();
  const squads = trpc.admin.squads.useQuery();
  const dissolve = trpc.admin.dissolveSquad.useMutation();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  async function drop(squadId: number) {
    setError(null);
    setNotice(null);
    setBusy(squadId);
    try {
      const result = await dissolve.mutateAsync({
        squadId,
        reason: "Nettoyage administrateur",
      });

      await utils.admin.squads.invalidate();
      await utils.squads.invalidate();
      await utils.wallet.invalidate();

      const parts = [
        t("admin.purge.membersReleased", { count: result.membersReleased }),
      ];
      if (result.treasuryReturned > 0) {
        parts.push(
          t("admin.purge.treasuryReturned", { uno: result.treasuryReturned }),
        );
      }
      if (result.challengesAnnulled > 0) {
        parts.push(
          t("admin.purge.challengesAnnulled", {
            count: result.challengesAnnulled,
          }),
        );
      }
      if (result.transfersCancelled > 0) {
        parts.push(
          t("admin.purge.transfersClosed", {
            count: result.transfersCancelled,
          }),
        );
      }
      if (result.tournamentsWithdrawn > 0) {
        parts.push(
          t("admin.purge.entriesReturned", {
            count: result.tournamentsWithdrawn,
          }),
        );
      }
      setNotice(
        t("admin.purge.dissolved", {
          name: result.name,
          parts: parts.join(", "),
        }),
      );
    } catch (caught) {
      setError(describeError(caught).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-relaxed text-muted">
        {t("admin.purge.clubsLead")}
      </p>

      {error && <ErrorBanner message={error} />}
      {notice && (
        <div
          role="status"
          className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
        >
          {notice}
        </div>
      )}

      <Async query={squads}>
        {(rows) =>
          rows.length === 0 ? (
            <Card>
              <p className="text-center text-xs text-muted">
                {t("admin.purge.noClub")}
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <Card key={row.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold">
                          {row.name}
                        </p>
                        {row.status === "dissolved" && (
                          <Badge>{t("admin.purge.dissolvedBadge")}</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted">
                        {t("admin.purge.foundedBy", { name: row.founderName })}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3" aria-hidden />
                          {row.memberCount}
                        </span>
                        <span className="text-accent">
                          {t("admin.purge.inTreasury", {
                            uno: row.treasuryAvailable,
                          })}
                        </span>
                        {/*
                          Un séquestre signale un défi en cours : il dit à
                          l'administrateur que la dissolution va aussi toucher
                          le club d'en face.
                        */}
                        {row.treasuryLocked > 0 && (
                          <span>
                            {t("admin.purge.locked", {
                              uno: row.treasuryLocked,
                            })}
                          </span>
                        )}
                        {row.openChallenges > 0 && (
                          <span>
                            {t("admin.purge.openChallenges", {
                              count: row.openChallenges,
                            })}
                          </span>
                        )}
                      </p>
                    </div>
                    {row.status === "active" && (
                      <ConfirmButton
                        label={t("admin.purge.dissolve")}
                        confirmLabel={t("admin.purge.confirmDissolve")}
                        loading={busy === row.id}
                        onConfirm={() => void drop(row.id)}
                      />
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )
        }
      </Async>
    </div>
  );
}
