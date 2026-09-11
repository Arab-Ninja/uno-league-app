import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { SQUAD_LIMITS, type SquadThreadInput } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { useAuth } from "@/lib/auth.js";
import { tapFeedback } from "@/lib/native.js";
import { Button, Card, ErrorBanner, Input } from "@/components/ui/index.js";

/** Rythme d'interrogation du fil, tant que l'écran est ouvert. */
const POLL_MS = 5000;

/**
 * Fil de discussion (SQUAD-005).
 *
 * **Pas de temps réel, une interrogation périodique.** Une connexion
 * persistante imposerait des contraintes d'hébergement — sessions collantes,
 * montée en charge des connexions ouvertes — sans rapport avec ce qu'une
 * ligue de cinquante joueurs échange en une soirée.
 *
 * L'interrogation s'arrête quand l'onglet passe en arrière-plan : inutile de
 * réveiller le serveur toutes les cinq secondes pour un écran que personne
 * ne regarde, et la notification push prévient déjà dans ce cas.
 */
export function SquadChat({
  thread,
  title,
  emptyLabel,
}: {
  thread: SquadThreadInput;
  title: string;
  emptyLabel: string;
}) {
  const { user } = useAuth();
  const post = trpc.squads.postMessage.useMutation();
  const [body, setBody] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const fil = trpc.squads.messages.useQuery(
    { thread, limit: 60 },
    { refetchInterval: POLL_MS, refetchIntervalInBackground: false },
  );

  const messages = fil.data?.messages ?? [];
  const writable = fil.data?.writable ?? false;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send() {
    const text = body.trim();
    if (text.length === 0) return;

    void tapFeedback();
    setFailure(null);
    try {
      await post.mutateAsync({ thread, body: text });
      setBody("");
      await fil.refetch();
    } catch (caught) {
      setFailure(describeError(caught).message);
    }
  }

  return (
    <section className="space-y-2">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </p>

      <Card className="space-y-3">
        <div className="max-h-[320px] space-y-2 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted">{emptyLabel}</p>
          ) : (
            messages.map((message) => {
              const mine = message.playerId === user?.playerId;
              return (
                <div
                  key={message.id}
                  className={cn("flex", mine ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3 py-2",
                      mine
                        ? "bg-accent/20 text-foreground"
                        : "bg-surface-raised text-foreground",
                    )}
                  >
                    {!mine && (
                      <p className="text-[10px] font-medium text-muted">
                        {message.playerName}
                        {message.squadName ? ` · ${message.squadName}` : ""}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {message.body}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottom} />
        </div>

        {failure && <ErrorBanner message={failure} />}

        {writable ? (
          <div className="flex gap-2 border-t border-border/40 pt-3">
            <Input
              value={body}
              placeholder="Votre message"
              maxLength={SQUAD_LIMITS.messageMax}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <Button
              variant="accent"
              loading={post.isPending}
              disabled={body.trim().length === 0}
              onClick={() => void send()}
            >
              <Send className="size-4" aria-hidden />
            </Button>
          </div>
        ) : (
          <p className="border-t border-border/40 pt-3 text-center text-[11px] text-muted">
            Ce fil est clos : il reste lisible, mais ne reçoit plus de message.
          </p>
        )}
      </Card>
    </section>
  );
}
