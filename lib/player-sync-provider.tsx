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
    if (lastSyncedId.current === user.openId) return;
    lastSyncedId.current = user.openId;

    upsertMutation
      .mutateAsync({
        openId: user.openId,
        name: user.name,
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
        email: user.email ?? undefined,
        division: user.division,
        unoPoints: user.unoPoints ?? 0,
        xp: user.xp ?? 0,
        level: user.level ?? 1,
        // stat field names match the playersRouter input schema
        goals: user.statsGoals ?? 0,
        assists: user.statsAssists ?? 0,
        defenses: user.statsDefenses ?? 0,
        saves: user.statsSaves ?? 0,
        motm: user.statsMotm ?? 0,
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

