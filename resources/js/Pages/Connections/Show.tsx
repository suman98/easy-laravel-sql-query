import AnalyzerClient from "@/components/AnalyzerClient";
import type { ConnectionRecord, SavedQueryRecord, QueryHistoryRecord } from "@/lib/clientTypes";

export default function Show({
  connection,
  savedQueries,
  queryHistory,
}: {
  connection: ConnectionRecord;
  savedQueries: SavedQueryRecord[];
  queryHistory: QueryHistoryRecord[];
}) {
  return (
    <AnalyzerClient
      connection={connection}
      initialSavedQueries={savedQueries}
      initialQueryHistory={queryHistory}
    />
  );
}
