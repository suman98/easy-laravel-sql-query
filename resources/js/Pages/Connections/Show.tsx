import AnalyzerClient from "@/components/AnalyzerClient";
import type { ConnectionRecord, SavedQueryRecord } from "@/lib/clientTypes";

export default function Show({
  connection,
  savedQueries,
}: {
  connection: ConnectionRecord;
  savedQueries: SavedQueryRecord[];
}) {
  return <AnalyzerClient connection={connection} initialSavedQueries={savedQueries} />;
}
