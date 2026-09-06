import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Send } from "lucide-react";
import { formatEur } from "@/lib/format.js";
import { describeError, newIdempotencyKey, trpc } from "@/lib/trpc.js";
import { notificationFeedback, tapFeedback } from "@/lib/native.js";
import { useOnline } from "@/lib/use-online.js";
import { Screen } from "@/components/layout/index.js";
import { Avatar } from "@/components/domain/index.js";
import {
  Button,
  Card,
  Field,
  Input,
  LoadingState,
} from "@/components/ui/index.js";

/**
 * Envoi de points UNO (WAL-002).
 *
 * Le destinataire est choisi parmi les joueurs réels renvoyés par le serveur :
 * il n'existe aucun moyen de saisir un identifiant arbitraire.
 */
export function SendUnoScreen() {
  const navigate = useNavigate();
  const online = useOnline();
  const utils = trpc.useUtils();

  const wallet = trpc.wallet.summary.useQuery();
  const send = trpc.wallet.send.useMutation();

  const [query, setQuery] = useState("");
  const [recipient, setRecipient] = useState<{ id: number; displayName: string; profilePhotoUrl: string | null } | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const search = trpc.wallet.searchRecipients.useQuery(
    { query, limit: 10 },
    { enabled: query.trim().length >= 2 },
  );

  const balance = wallet.data?.balance ?? 0;
  const parsedAmount = Number.parseInt(amount, 10);
  const amountValid =
    Number.isInteger(parsedAmount) && parsedAmount > 0 && parsedAmount <= balance;

  async function submit() {
    if (!recipient || !amountValid) return;
    setError(null);
    setSuccess(null);

    try {
      await send.mutateAsync({
        toPlayerId: recipient.id,
        amount: parsedAmount,
        ...(note.trim() ? { note: note.trim() } : {}),
        idempotencyKey: newIdempotencyKey(),
      });
      await notificationFeedback();
      await utils.wallet.summary.invalidate();
      await utils.players.dashboard.invalidate();
      setSuccess(`${parsedAmount} UNO envoyés à ${recipient.displayName}.`);
      setTimeout(() => navigate("/wallet"), 1200);
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <Screen title="Envoyer des UNO" back withTabBar={false}>
      <div className="space-y-5">
        <Card className="text-center">
          <p className="text-xs uppercase tracking-wide text-muted">Solde disponible</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{balance}</p>
          <p className="text-xs text-muted">{formatEur(balance)}</p>
        </Card>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </div>
        )}
        {success && (
          <div
            role="status"
            className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
          >
            {success}
          </div>
        )}

        {recipient ? (
          <Card className="flex items-center gap-3">
            <Avatar name={recipient.displayName} url={recipient.profilePhotoUrl} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">Destinataire</p>
              <p className="truncate text-sm font-semibold">{recipient.displayName}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                void tapFeedback();
                setRecipient(null);
              }}
              className="text-xs font-medium text-accent"
            >
              Changer
            </button>
          </Card>
        ) : (
          <Field label="Destinataire" htmlFor="recipient">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                id="recipient"
                className="pl-10"
                placeholder="Nom du joueur (2 caractères min.)"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            {query.trim().length >= 2 && (
              <div className="mt-2 space-y-1">
                {search.isLoading && <LoadingState label="Recherche..." />}
                {search.data?.length === 0 && (
                  <p className="py-3 text-center text-sm text-muted">
                    Aucun joueur trouvé.
                  </p>
                )}
                {(search.data ?? []).map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => {
                      void tapFeedback();
                      setRecipient(player);
                      setQuery("");
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-raised active:opacity-70"
                  >
                    <Avatar name={player.displayName} url={player.profilePhotoUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {player.displayName}
                    </span>
                    <span className="text-xs text-muted">{player.division}</span>
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}

        <Field
          label="Montant (UNO)"
          htmlFor="amount"
          error={
            amount !== "" && !amountValid
              ? parsedAmount > balance
                ? "Montant supérieur à votre solde"
                : "Saisissez un nombre entier positif"
              : undefined
          }
          hint={amountValid ? `Soit ${formatEur(parsedAmount)}` : undefined}
        >
          <Input
            id="amount"
            type="number"
            inputMode="numeric"
            min={1}
            max={balance}
            step={1}
            placeholder="0"
            value={amount}
            invalid={amount !== "" && !amountValid}
            onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))}
          />
        </Field>

        <Field label="Message (optionnel)" htmlFor="note">
          <Input
            id="note"
            maxLength={140}
            placeholder="Merci pour la passe !"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        {!online && (
          <p className="rounded-xl bg-warning/10 px-4 py-3 text-xs text-warning">
            Vous êtes hors ligne : l'envoi nécessite une connexion.
          </p>
        )}

        <Button
          variant="accent"
          fullWidth
          icon={<Send className="size-4" aria-hidden />}
          disabled={!online || !recipient || !amountValid}
          loading={send.isPending}
          onClick={() => void submit()}
        >
          Envoyer
        </Button>
      </div>
    </Screen>
  );
}
