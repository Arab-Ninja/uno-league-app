/**
 * PlayerSyncProvider – sits inside the tRPC+QueryClient providers and
 * syncs the current authenticated player to the database.
 *
 * This keeps auth-context.tsx (which lives outside the tRPC providers)
 * clean while still persisting player data to the real database.
 *
 * Syncs are triggered whenever the player's id, unoPoints, name or
 * profilePhoto change – not just once per session – so that UNO balance
 * updates made in screens (e.g. wallet transfers, shop purchases) are
 * always reflected in the database.
 */
import React, { useEffect, useRef } from "react";
import { useAuth } from "./auth-context";
import { trpc } from "./trpc";

export function PlayerSyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const upsertMutation = trpc.players.upsert.useMutation();
  // Track a fingerprint of the fields we care about persisting.
  // Using a string lets us detect any change with a simple equality check.
  const lastSyncedFingerprint = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fingerprint = JSON.stringify({
      id: user.id,
      unoPoints: user.unoPoints,
      xp: user.xp,
      level: user.level,
      name: user.name,
      division: user.division,
      profilePhoto: user.profilePhoto ?? null,
      avatar: user.avatar ?? null,
      nationality: user.nationality ?? null,
    });

    if (lastSyncedFingerprint.current === fingerprint) return;
    lastSyncedFingerprint.current = fingerprint;

    upsertMutation
      .mutateAsync({
        openId: user.email ?? user.id,
        name: user.name,
        email: user.email,
        division: user.division,
        unoPoints: user.unoPoints,
        xp: user.xp,
        level: user.level,
        // stat field names match the playersRouter input schema
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return <>{children}</>;
}

