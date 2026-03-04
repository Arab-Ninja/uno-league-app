/**
 * Proposals context – manages proposals in state (AsyncStorage) and
 * optionally syncs to the backend via tRPC when the server is reachable.
 *
 * The tRPC calls are fire-and-forget: if they fail (e.g. no DATABASE_URL
 * configured), the app continues working with the local state persisted
 * in AsyncStorage.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc } from "./trpc";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProposalParticipant {
  id: string; // playerOpenId (email)
  name: string;
}

export interface ProposalLocation {
  id: string;
  name: string;
  color: string;
}

export interface ProposalMode {
  id: string;
  name: string;
  minParticipants: number;
  price: number;
  duration: number;
}

export interface Proposal {
  /** Numeric DB id when persisted, or temporary string id for local-only proposals. */
  id: string;
  date: Date;
  time: string;
  location: ProposalLocation;
  mode: ProposalMode;
  participants: ProposalParticipant[];
  price: number;
  rewards: string;
  /** proposition → reservation (full) → session (all paid) */
  status: "proposition" | "reservation" | "session";
}

// ── Context type ──────────────────────────────────────────────────────────────

interface ProposalsContextType {
  proposals: Proposal[];
  isLoading: boolean;
  createProposal: (
    proposal: Omit<Proposal, "id" | "status"> & { creatorOpenId: string },
  ) => Promise<void>;
  joinProposal: (proposalId: string, player: ProposalParticipant) => Promise<void>;
  leaveProposal: (proposalId: string, playerOpenId: string) => Promise<void>;
  refreshProposals: (locationId: string, modeId: string) => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ProposalsContext = createContext<ProposalsContextType | undefined>(undefined);

const STORAGE_KEY = "uno_proposals_v2";

// ── Helper ────────────────────────────────────────────────────────────────────

function dateReviver(_key: string, value: unknown) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value);
  }
  return value;
}

async function loadFromStorage(): Promise<Proposal[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw, dateReviver) as Proposal[];
  } catch {
    return [];
  }
}

async function saveToStorage(data: Proposal[]) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ProposalsProvider({ children }: { children: React.ReactNode }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // tRPC utils for manual cache invalidation (not strictly needed here since
  // we manage state ourselves, but kept for future use).
  const utils = trpc.useUtils();

  // Load from AsyncStorage on mount
  useEffect(() => {
    loadFromStorage().then((stored) => {
      setProposals(stored);
      setIsLoading(false);
    });
  }, []);

  // ── Persist to AsyncStorage whenever proposals change ──────────────────────
  useEffect(() => {
    if (!isLoading) {
      saveToStorage(proposals);
    }
  }, [proposals, isLoading]);

  // ── Create proposal ────────────────────────────────────────────────────────

  const createProposalMutation = trpc.proposals.create.useMutation();

  const createProposal = useCallback(
    async (
      data: Omit<Proposal, "id" | "status"> & { creatorOpenId: string },
    ) => {
      const tempId = `local-${Date.now()}`;
      const newProposal: Proposal = {
        id: tempId,
        date: data.date,
        time: data.time,
        location: data.location,
        mode: data.mode,
        participants: [{ id: data.creatorOpenId, name: data.participants[0]?.name ?? "Joueur" }],
        price: data.price,
        rewards: data.rewards,
        status: "proposition",
      };

      // Optimistic local update
      setProposals((prev) => [...prev, newProposal]);

      // Attempt server persist
      try {
        const result = await createProposalMutation.mutateAsync({
          date: data.date.toISOString(),
          time: data.time,
          locationId: data.location.id,
          locationName: data.location.name,
          locationColor: data.location.color,
          modeId: data.mode.id,
          modeName: data.mode.name,
          minParticipants: data.mode.minParticipants,
          price: data.price,
          rewards: data.rewards,
          creatorOpenId: data.creatorOpenId,
          creatorName: data.participants[0]?.name ?? "Joueur",
        });
        // Replace temp id with real DB id
        const realId = String(result.id);
        setProposals((prev) =>
          prev.map((p) => (p.id === tempId ? { ...p, id: realId } : p)),
        );
      } catch {
        // Keep local-only proposal if server is unavailable
      }
    },
    [createProposalMutation],
  );

  // ── Join proposal ──────────────────────────────────────────────────────────

  const joinMutation = trpc.proposals.join.useMutation();

  const joinProposal = useCallback(
    async (proposalId: string, player: ProposalParticipant) => {
      setProposals((prev) =>
        prev.map((p) => {
          if (p.id !== proposalId) return p;
          const alreadyIn = p.participants.some((x) => x.id === player.id);
          if (alreadyIn) return p;
          const updatedParticipants = [...p.participants, player];
          const newStatus: Proposal["status"] =
            updatedParticipants.length >= p.mode.minParticipants ? "reservation" : "proposition";
          return { ...p, participants: updatedParticipants, status: newStatus };
        }),
      );

      // Attempt server sync if it looks like a DB id (numeric string)
      if (/^\d+$/.test(proposalId)) {
        try {
          await joinMutation.mutateAsync({
            proposalId: Number(proposalId),
            playerOpenId: player.id,
            playerName: player.name,
          });
        } catch {
          // Local state already updated
        }
      }
    },
    [joinMutation],
  );

  // ── Leave proposal ─────────────────────────────────────────────────────────

  const leaveMutation = trpc.proposals.leave.useMutation();

  const leaveProposal = useCallback(
    async (proposalId: string, playerOpenId: string) => {
      setProposals((prev) =>
        prev.flatMap((p) => {
          if (p.id !== proposalId) return [p];
          const updatedParticipants = p.participants.filter((x) => x.id !== playerOpenId);
          if (updatedParticipants.length === 0) return []; // auto-delete
          return [{ ...p, participants: updatedParticipants, status: "proposition" as const }];
        }),
      );

      if (/^\d+$/.test(proposalId)) {
        try {
          await leaveMutation.mutateAsync({ proposalId: Number(proposalId), playerOpenId });
        } catch {
          // Local state already updated
        }
      }
    },
    [leaveMutation],
  );

  // ── Refresh from server ────────────────────────────────────────────────────

  const refreshProposals = useCallback(
    async (locationId: string, modeId: string) => {
      try {
        const statuses: Array<"proposition" | "reservation" | "session"> = [
          "proposition",
          "reservation",
          "session",
        ];
        const fetched = await Promise.all(
          statuses.map((status) =>
            utils.proposals.list.fetch({ locationId, modeId, status }),
          ),
        );
        const fromServer: Proposal[] = fetched.flat().map((row) => ({
          id: String(row.id),
          date: row.date instanceof Date ? row.date : new Date(row.date),
          time: row.time,
          location: {
            id: row.locationId,
            name: row.locationName,
            color: row.locationColor,
          },
          mode: {
            id: row.modeId,
            name: row.modeName,
            minParticipants: row.minParticipants,
            price: row.price,
            duration: row.modeId === "league" ? 2 : 1,
          },
          participants: row.participants.map((pp: { playerOpenId: string; playerName: string }) => ({
            id: pp.playerOpenId,
            name: pp.playerName,
          })),
          price: row.price,
          rewards: row.rewards,
          status: row.status,
        }));

        if (fromServer.length > 0) {
          // Merge: server data wins for DB proposals, keep local-only proposals
          setProposals((prev) => {
            const localOnly = prev.filter((p) => p.id.startsWith("local-"));
            const merged = [...fromServer, ...localOnly];
            return merged;
          });
        }
      } catch {
        // Server unavailable – keep using local state
      }
    },
    [utils],
  );

  return (
    <ProposalsContext.Provider
      value={{ proposals, isLoading, createProposal, joinProposal, leaveProposal, refreshProposals }}
    >
      {children}
    </ProposalsContext.Provider>
  );
}

export function useProposals() {
  const ctx = useContext(ProposalsContext);
  if (!ctx) throw new Error("useProposals must be used within a ProposalsProvider");
  return ctx;
}
