/**
 * PlayerSyncProvider – sits inside the tRPC+QueryClient providers and
 * syncs the current authenticated player to the SQLite database.
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
        email: user.email ?? undefined,
        division: user.division,
        unoPoints: user.unoPoints,
        xp: user.xp,
        level: user.level,
        // stat field names match the playersRouter input schema
        goals: user.stats?.goals ?? 0,
        assists: user.stats?.assists ?? 0,
        defenses: user.stats?.defenses ?? 0,
        saves: user.stats?.saves ?? 0,
        motm: user.stats?.motm ?? 0,
        avatar: user.avatar ?? undefined,
        nationality: user.nationality ?? undefined,
        dateOfBirth: user.dateOfBirth ?? undefined,
        profilePhoto: user.profilePhoto ?? undefined,
      })
      .catch(() => {
        // Server unavailable — data stays in AsyncStorage
      });
  // Sync whenever the user object itself changes (new login or profile update)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return <>{children}</>;
}

