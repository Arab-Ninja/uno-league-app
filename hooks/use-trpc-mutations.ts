/**
 * Hook to access tRPC mutations for database operations
 * This centralizes all backend calls in one place
 */

import { trpc } from "@/lib/trpc";

export function useTRPCMutations() {
  const playersUpsert = trpc.players.upsert.useMutation();
  const playersAddPoints = trpc.players.addPoints.useMutation();
  const proposalsCreate = trpc.proposals.create.useMutation();
  const proposalsJoin = trpc.proposals.join.useMutation();
  const proposalsLeave = trpc.proposals.leave.useMutation();

  return {
    playersUpsert,
    playersAddPoints,
    proposalsCreate,
    proposalsJoin,
    proposalsLeave,
  };
}
