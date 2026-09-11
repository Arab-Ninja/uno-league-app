import { useState } from "react";
import { Search } from "lucide-react";
import { DIVISIONS, type Division } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { Async } from "@/components/ui/async.js";
import {
  Button,
  Card,
  Field,
  Input,
  Select,
} from "@/components/ui/index.js";

/** Gestion des joueurs : division et solde UNO (ADMIN-002, ADMIN-003). */
export function AdminPlayers() {
  const utils = trpc.useUtils();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  const players = trpc.admin.players.useQuery({
    limit: 50,
    ...(query.trim() ? { query: query.trim() } : {}),
  });

  const setDivision = trpc.admin.setDivision.useMutation();
  const setSupervisor = trpc.admin.setSupervisor.useMutation();
  const adjustUno = trpc.admin.adjustUno.useMutation();

  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    await utils.admin.players.invalidate();
    await utils.admin.stats.invalidate();
  }

  async function changeDivision(playerId: number, division: Division) {
    setError(null);
    setNotice(null);
    try {
      await setDivision.mutateAsync({ playerId, division });
      await refresh();
      setNotice("Division mise à jour.");
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  /**
   * Accorde ou retire le droit de saisir les feuilles de match (SUP-001).
   *
   * Le superviseur reste joueur ou arbitre : ce droit s'ajoute à son compte,
   * il ne le remplace pas.
   */
  async function toggleSupervisor(playerId: number, isSupervisor: boolean) {
    setError(null);
    setNotice(null);
    try {
      await setSupervisor.mutateAsync({ playerId, isSupervisor });
      await refresh();
      setNotice(
        isSupervisor
          ? "Ce joueur peut désormais saisir les feuilles de match."
          : "Droit de supervision retiré.",
      );
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  async function applyAdjustment(playerId: number) {
    setError(null);
    setNotice(null);
    const value = Number.parseInt(amount, 10);
    if (!Number.isInteger(value) || value <= 0) {
      setError("Saisissez un montant entier positif.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Indiquez un motif (3 caractères minimum).");
      return;
    }

    try {
      const result = await adjustUno.mutateAsync({
        playerId,
        amount: value,
        direction,
        reason: reason.trim(),
      });
      await refresh();
      setAmount("");
      setReason("");
      setNotice(`Nouveau solde : ${result.balanceAfter} UNO.`);
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          className="pl-10"
          placeholder="Rechercher un joueur ou un email"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
        >
          {notice}
        </div>
      )}

      <Async query={players}>
        {(page) => (
          <div className="space-y-3">
            {page.items.map((player) => (
              <Card key={player.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 text-left"
                  onClick={() =>
                    setSelected(selected === player.id ? null : player.id)
                  }
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {player.displayName}
                      {player.role === "admin" && (
                        <span className="ml-2 text-[10px] uppercase text-accent">
                          admin
                        </span>
                      )}
                      {player.isSupervisor && player.role !== "admin" && (
                        <span className="ml-2 text-[10px] uppercase text-emerald-300">
                          superviseur
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted">{player.email}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-accent">
                      {player.unoPoints}
                    </p>
                    <p className="text-[11px] text-muted">
                      {player.accountType === "referee"
                        ? "Arbitre"
                        : player.division}
                    </p>
                  </div>
                </button>

                {selected === player.id && (
                  <div className="mt-4 space-y-3 border-t border-border/50 pt-4">
                    {/*
                      SUP-001 : le droit de saisie se donne joueur par joueur.
                      L'administration l'a d'office, il n'y a donc rien à lui
                      proposer.
                    */}
                    {player.role !== "admin" && (
                      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface-raised px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">Superviseur</p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                            Peut saisir les feuilles de match, sauf celles des
                            sessions qu'il a jouées.
                          </p>
                        </div>
                        <Button
                          variant={player.isSupervisor ? "secondary" : "accent"}
                          loading={setSupervisor.isPending}
                          onClick={() =>
                            void toggleSupervisor(
                              player.id,
                              !player.isSupervisor,
                            )
                          }
                        >
                          {player.isSupervisor ? "Retirer" : "Nommer"}
                        </Button>
                      </div>
                    )}

                    {player.accountType === "referee" ? (
                      <p className="rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-xs text-muted">
                        Un arbitre n'a pas de division : il n'entre ni au
                        classement ni dans les montées et descentes.
                      </p>
                    ) : (
                      <Field label="Division" htmlFor={`division-${player.id}`}>
                        <Select
                          id={`division-${player.id}`}
                          value={player.division}
                          onChange={(event) =>
                            void changeDivision(
                              player.id,
                              event.target.value as Division,
                            )
                          }
                        >
                          {DIVISIONS.map((division) => (
                            <option key={division} value={division}>
                              {division}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Montant UNO" htmlFor={`amount-${player.id}`}>
                        <Input
                          id={`amount-${player.id}`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={amount}
                          onChange={(event) =>
                            setAmount(event.target.value.replace(/\D/g, ""))
                          }
                        />
                      </Field>
                      <Field label="Sens" htmlFor={`direction-${player.id}`}>
                        <Select
                          id={`direction-${player.id}`}
                          value={direction}
                          onChange={(event) =>
                            setDirection(event.target.value as "credit" | "debit")
                          }
                        >
                          <option value="credit">Créditer (+)</option>
                          <option value="debit">Débiter (−)</option>
                        </Select>
                      </Field>
                    </div>

                    <Field label="Motif" htmlFor={`reason-${player.id}`}>
                      <Input
                        id={`reason-${player.id}`}
                        placeholder="Journalisé dans l'audit"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </Field>

                    <Button
                      variant="accent"
                      fullWidth
                      loading={adjustUno.isPending}
                      onClick={() => void applyAdjustment(player.id)}
                    >
                      Appliquer l'ajustement
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </Async>
    </div>
  );
}
