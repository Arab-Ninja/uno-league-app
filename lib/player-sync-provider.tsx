/**
 * PlayerSyncProvider – sits inside the tRPC+QueryClient providers and
 * syncs the current authenticated player to the MySQL database.
 *
 * This keeps auth-context.tsx (which lives outside the tRPC providers)
 * clean while still persisting player data to the real database.
 */
import React, { useEffect, useRef } from "react";
import { useAuth } from "./auth-context";
import { trpc } from "./trpc";

export function PlayerSyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const upsertMutation = trpc.players.upsert.useMutation();
  const lastSyncedId = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    // Only sync once per user session to avoid hammering the DB
    if (lastSyncedId.current === user.id) return;
    lastSyncedId.current = user.id;

    upsertMutation
      .mutateAsync({
        openId: user.email ?? user.id,
        name: user.name,
        email: user.email,
        division: user.division,
        unoPoints: user.unoPoints,
        xp: user.xp,
        level: user.level,
        goals: user.stats.goals,
        assists: user.stats.assists,
        defenses: user.stats.defenses,
        saves: user.stats.saves,
        motm: user.stats.motm,
        avatar: user.avatar,
        nationality: user.nationality,
        dateOfBirth: user.dateOfBirth,
        profilePhoto: user.profilePhoto,
      })
      .catch(() => {
        // Server unavailable — data stays in AsyncStorage
      });
  }, [user?.id]);

  return <>{children}</>;
}
