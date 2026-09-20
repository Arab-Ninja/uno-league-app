import { useState } from "react";
import { Trash2, Users } from "lucide-react";
import {
  DIVISION_LABELS,
  GAME_MODES,
  PROPOSAL_STATUS_LABELS,
} from "@uno/shared";
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

function modeName(modeId: string): string {
  return GAME_MODES.find((mode) => mode.id === modeId)?.name ?? modeId;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function AdminProposalPurge() {
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
        `Session supprimée.` +
          (result.seatsRefunded > 0
            ? ` ${result.seatsRefunded} place(s) remboursée(s), ${result.unoRefunded} UNO rendus.`
            : "") +
          (result.reopened
            ? " La clôture a d'abord été défaite : statistiques, notes et divisions sont revenues en arrière."
            : ""),
      );
    } catch (caught) {
      setError(describeError(caught).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <SectionTitle>Supprimer une session</SectionTitle>

      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        La session disparaît pour de bon, avec ses inscriptions, ses paiements
        et ses matchs. Les places déjà réglées sont remboursées en UNO.
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
                Aucune session en base.
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
                          {modeName(row.modeId)}
                          {row.division &&
                            ` · ${DIVISION_LABELS[row.division]}`}
                        </p>
                        <Badge>{PROPOSAL_STATUS_LABELS[row.status]}</Badge>
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
                        {row.participantCount} inscrit(s),{" "}
                        <span
                          className={row.paidCount > 0 ? "text-accent" : ""}
                        >
                          {row.paidCount} réglé(s)
                        </span>
                        {row.paidCount > 0 &&
                          ` — ${row.paidCount * row.priceUno} UNO à rembourser`}
                      </p>
                    </div>
                    <ConfirmButton
                      label={<Trash2 className="size-4" aria-hidden />}
                      confirmLabel="Supprimer"
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

      const parts = [`${result.membersReleased} membre(s) libéré(s)`];
      if (result.treasuryReturned > 0) {
        parts.push(`${result.treasuryReturned} UNO rendus au fondateur`);
      }
      if (result.challengesAnnulled > 0) {
        parts.push(`${result.challengesAnnulled} défi(s) annulé(s)`);
      }
      if (result.transfersCancelled > 0) {
        parts.push(`${result.transfersCancelled} transfert(s) clos`);
      }
      if (result.tournamentsWithdrawn > 0) {
        parts.push(`${result.tournamentsWithdrawn} engagement(s) rendu(s)`);
      }
      setNotice(`Club « ${result.name} » dissous : ${parts.join(", ")}.`);
    } catch (caught) {
      setError(describeError(caught).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-relaxed text-muted">
        Un club se <strong>dissout</strong> : il quitte toutes les listes,
        libère son nom et rend ses membres libres de rejoindre ailleurs. Son
        histoire de matchs reste lisible, ce qui est la raison pour laquelle la
        ligne survit. Les défis en cours sont annulés — mises et places rendues
        des deux côtés — et la caisse revient au fondateur.
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
              <p className="text-center text-xs text-muted">Aucun club.</p>
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
                        {row.status === "dissolved" && <Badge>Dissous</Badge>}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted">
                        Fondé par {row.founderName}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3" aria-hidden />
                          {row.memberCount}
                        </span>
                        <span className="text-accent">
                          {row.treasuryAvailable} UNO en caisse
                        </span>
                        {/*
                          Un séquestre signale un défi en cours : il dit à
                          l'administrateur que la dissolution va aussi toucher
                          le club d'en face.
                        */}
                        {row.treasuryLocked > 0 && (
                          <span>{row.treasuryLocked} UNO séquestrés</span>
                        )}
                        {row.openChallenges > 0 && (
                          <span>{row.openChallenges} défi(s) en cours</span>
                        )}
                      </p>
                    </div>
                    {row.status === "active" && (
                      <ConfirmButton
                        label="Dissoudre"
                        confirmLabel="Oui, dissoudre"
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
