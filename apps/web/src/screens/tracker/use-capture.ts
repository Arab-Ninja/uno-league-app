import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TrackerEventView, TrackerSheet } from "@uno/shared";
import { trpc } from "@/lib/trpc.js";

/**
 * Magasin local des actions saisies (TRACK-001).
 *
 * Le principe : **la saisie n'attend jamais le réseau**. Toute action est
 * écrite en mémoire, affichée immédiatement, persistée dans le stockage du
 * navigateur, puis poussée au serveur par lots en arrière-plan. Un match ne
 * s'arrête pas parce qu'une requête met deux secondes.
 *
 * L'état affiché est une fusion, jamais une copie : actions du serveur,
 * complétées des ajouts locaux en attente, privées des suppressions locales en
 * attente. Il n'existe donc pas deux vérités qui pourraient diverger — quand
 * le serveur confirme, la file se vide et la fusion donne exactement le même
 * résultat.
 *
 * La file survit à un rafraîchissement de page, à une coupure réseau et à une
 * fermeture d'onglet : c'est ce qui manquait à la saisie par tableau, où un
 * rechargement perdait tout.
 */

export interface PendingState {
  upserts: TrackerEventView[];
  deletions: string[];
}

const EMPTY: PendingState = { upserts: [], deletions: [] };

function storageKey(sessionId: number): string {
  return `uno.tracker.pending.${sessionId}`;
}

function loadPending(sessionId: number): PendingState {
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<PendingState>;
    return {
      upserts: Array.isArray(parsed.upserts) ? parsed.upserts : [],
      deletions: Array.isArray(parsed.deletions) ? parsed.deletions : [],
    };
  } catch {
    // Un stockage illisible ne doit pas empêcher de saisir : on repart d'une
    // file vide plutôt que de faire échouer l'écran.
    return EMPTY;
  }
}

function savePending(sessionId: number, pending: PendingState): void {
  try {
    if (pending.upserts.length === 0 && pending.deletions.length === 0) {
      window.localStorage.removeItem(storageKey(sessionId));
      return;
    }
    window.localStorage.setItem(storageKey(sessionId), JSON.stringify(pending));
  } catch {
    // Quota dépassé ou mode privé : la saisie continue en mémoire.
  }
}

/** Identifiant d'action, unique par appareil et par saisie. */
export function newClientId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type SyncState = "idle" | "pending" | "syncing" | "error";

export interface CaptureStore {
  /** Actions à afficher : serveur + file locale. */
  events: TrackerEventView[];
  pendingCount: number;
  syncState: SyncState;
  syncError: string | null;
  /** Ajoute ou corrige une action. */
  record: (event: TrackerEventView) => void;
  /** Retire une action. */
  remove: (clientId: string) => void;
  /** Annule la dernière action saisie sur cet appareil. */
  undo: () => TrackerEventView | null;
  canUndo: boolean;
  /** Force l'envoi immédiat de la file, et attend qu'il aboutisse. */
  flush: () => Promise<void>;
}

export function useCapture(
  sessionId: number,
  sheet: TrackerSheet | undefined,
): CaptureStore {
  const utils = trpc.useUtils();
  const sync = trpc.tracker.sync.useMutation();

  const [pending, setPending] = useState<PendingState>(() => loadPending(sessionId));
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  // Rechargement d'une autre feuille : on repart de sa propre file.
  useEffect(() => {
    setPending(loadPending(sessionId));
    setHistory([]);
  }, [sessionId]);

  useEffect(() => {
    savePending(sessionId, pending);
  }, [sessionId, pending]);

  const serverEvents = useMemo(() => sheet?.events ?? [], [sheet]);

  const events = useMemo(() => {
    const merged = new Map(serverEvents.map((event) => [event.clientId, event]));
    for (const event of pending.upserts) merged.set(event.clientId, event);
    for (const clientId of pending.deletions) merged.delete(clientId);
    return [...merged.values()];
  }, [serverEvents, pending]);

  const record = useCallback((event: TrackerEventView) => {
    setPending((current) => ({
      upserts: [
        ...current.upserts.filter((item) => item.clientId !== event.clientId),
        event,
      ],
      deletions: current.deletions.filter((id) => id !== event.clientId),
    }));
    setHistory((current) => [...current, event.clientId]);
  }, []);

  const remove = useCallback((clientId: string) => {
    setPending((current) => ({
      upserts: current.upserts.filter((item) => item.clientId !== clientId),
      deletions: current.deletions.includes(clientId)
        ? current.deletions
        : [...current.deletions, clientId],
    }));
    setHistory((current) => current.filter((id) => id !== clientId));
  }, []);

  const eventsRef = useRef(events);
  eventsRef.current = events;
  const historyRef = useRef(history);
  historyRef.current = history;

  // `remove` retire déjà l'action de l'historique : annuler n'a donc qu'à
  // désigner la dernière saisie. Rien n'est fait à l'intérieur d'un updateur
  // d'état, qui doit rester pur.
  const undo = useCallback((): TrackerEventView | null => {
    const last = historyRef.current[historyRef.current.length - 1];
    if (last === undefined) return null;
    const undone =
      eventsRef.current.find((item) => item.clientId === last) ?? null;
    remove(last);
    return undone;
  }, [remove]);

  // --- Envoi par lots ------------------------------------------------------
  //
  // Un envoi part au repos, pas à chaque frappe : pendant une action rapide —
  // but, puis passeur — deux requêtes partiraient pour un seul fait de jeu.
  // Le délai est court pour que « en attente » ne s'installe jamais
  // durablement à l'écran.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const syncingRef = useRef(false);

  const flush = useCallback(async () => {
    const batch = pendingRef.current;
    if (batch.upserts.length === 0 && batch.deletions.length === 0) return;
    if (syncingRef.current) return;

    syncingRef.current = true;
    setSyncing(true);

    const sentUpserts = batch.upserts.map((event) => event.clientId);
    const sentDeletions = [...batch.deletions];

    try {
      const sheetAfterSync = await sync.mutateAsync({
        sessionId,
        upserts: batch.upserts.map((event) => ({
          clientId: event.clientId,
          matchId: event.matchId,
          type: event.type as "goal" | "own_goal" | "defense" | "save" | "gk_in",
          participantId: event.participantId,
          assistParticipantId: event.assistParticipantId,
          teamId: event.teamId,
          clockMs: event.clockMs,
          videoMs: event.videoMs,
        })),
        deletions: sentDeletions,
      });

      // Seules les entrées réellement envoyées sortent de la file : celles
      // saisies pendant la requête doivent rester, sans quoi une action tapée
      // au mauvais moment disparaîtrait sans jamais atteindre le serveur.
      setPending((current) => ({
        upserts: current.upserts.filter(
          (event) => !sentUpserts.includes(event.clientId),
        ),
        deletions: current.deletions.filter((id) => !sentDeletions.includes(id)),
      }));
      // La réponse EST la feuille d'après synchronisation : la poser
      // directement évite un aller-retour, et surtout évite qu'une réponse
      // plus ancienne arrivée entre-temps écrase les actions tout juste
      // enregistrées.
      utils.tracker.get.setData({ sessionId }, sheetAfterSync);
      setSyncError(null);
    } catch (caught) {
      // La file est conservée telle quelle : le prochain essai la rejouera,
      // et les écritures sont idempotentes.
      setSyncError(
        caught instanceof Error
          ? caught.message
          : "Les actions n'ont pas pu être envoyées.",
      );
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [sessionId, sync, utils]);

  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    if (pending.upserts.length === 0 && pending.deletions.length === 0) return;
    const timer = window.setTimeout(() => void flushRef.current(), 1200);
    return () => window.clearTimeout(timer);
  }, [pending]);

  // Le retour du réseau relance la file sans attendre la prochaine action.
  useEffect(() => {
    const onOnline = (): void => void flushRef.current();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const pendingCount = pending.upserts.length + pending.deletions.length;

  return {
    events,
    pendingCount,
    syncState: syncing
      ? "syncing"
      : syncError
        ? "error"
        : pendingCount > 0
          ? "pending"
          : "idle",
    syncError,
    record,
    remove,
    undo,
    canUndo: history.length > 0,
    flush: () => flushRef.current(),
  };
}
