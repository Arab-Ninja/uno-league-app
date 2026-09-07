import type { ReactNode } from "react";
import { describeError } from "@/lib/trpc.js";
import { ErrorState, LoadingState } from "./index.js";

/**
 * Enveloppe les trois états obligatoires d'un écran alimenté par le réseau
 * (§16 : chargement, erreur, contenu). Le message d'erreur affiché est celui
 * renvoyé par le serveur, en français, jamais un détail technique.
 */

interface QueryLike<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

export function Async<T>({
  query,
  children,
  loadingLabel,
}: {
  query: QueryLike<T>;
  children: (data: T) => ReactNode;
  loadingLabel?: string;
}) {
  if (query.isError) {
    const info = describeError(query.error);
    return (
      <ErrorState
        message={info.message}
        detail={info.devCause}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (query.isLoading || query.data === undefined) {
    return <LoadingState {...(loadingLabel ? { label: loadingLabel } : {})} />;
  }

  return <>{children(query.data)}</>;
}
