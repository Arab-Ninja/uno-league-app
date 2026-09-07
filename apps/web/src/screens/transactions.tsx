import { trpc } from "@/lib/trpc.js";
import { Screen } from "@/components/layout/index.js";
import { TransactionRow } from "@/components/domain/index.js";
import { Button, Card, EmptyState, ErrorState, LoadingState } from "@/components/ui/index.js";
import { describeError } from "@/lib/trpc.js";

/** Historique complet des transactions, paginé côté serveur (NFR-003). */
export function TransactionsScreen() {
  const query = trpc.wallet.transactions.useInfiniteQuery(
    { limit: 25 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  if (query.isError) {
    return (
      <Screen title="Historique" back withTabBar={false}>
        <ErrorState
          message={describeError(query.error).message}
          detail={describeError(query.error).devCause}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  if (query.isLoading || !query.data) {
    return (
      <Screen title="Historique" back withTabBar={false}>
        <LoadingState />
      </Screen>
    );
  }

  const transactions = query.data.pages.flatMap((page) => page.items);

  return (
    <Screen title="Historique" back withTabBar={false}>
      {transactions.length === 0 ? (
        <EmptyState
          title="Aucune transaction"
          description="Vos mouvements de points apparaîtront ici."
        />
      ) : (
        <>
          <Card className="py-0">
            {transactions.map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} />
            ))}
          </Card>

          {query.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="secondary"
                loading={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                Charger plus
              </Button>
            </div>
          )}
        </>
      )}
    </Screen>
  );
}
