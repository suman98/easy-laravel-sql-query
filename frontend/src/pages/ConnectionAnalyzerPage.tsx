import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AnalyzerClient from "@/components/AnalyzerClient";
import Brand from "@/components/Brand";
import { apiUrl } from "@/lib/api";
import type { ConnectionRecord, SavedQueryRecord } from "@/lib/clientTypes";

type LoadState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "ready"; connection: ConnectionRecord; savedQueries: SavedQueryRecord[] };

export default function ConnectionAnalyzerPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });

    Promise.all([
      fetch(apiUrl(`/connections/${id}`)).then((r) => (r.ok ? r.json() : null)),
      fetch(apiUrl(`/connections/${id}/saved-queries`)).then((r) => (r.ok ? r.json() : null)),
    ]).then(([connectionData, savedQueriesData]) => {
      if (!active) return;
      if (!connectionData) {
        setState({ status: "not-found" });
        return;
      }
      setState({
        status: "ready",
        connection: connectionData.connection,
        savedQueries: savedQueriesData?.savedQueries ?? [],
      });
    });

    return () => {
      active = false;
    };
  }, [id]);

  if (state.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
        Loading…
      </div>
    );
  }

  if (state.status === "not-found") {
    return (
      <div className="flex flex-1 flex-col">
        <header className="border-b border-zinc-200/80 bg-white/80 px-6 py-3.5 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80">
          <Brand />
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Connection not found
          </h1>
          <Link to="/connections" className="btn-primary">
            Back to databases
          </Link>
        </div>
      </div>
    );
  }

  return <AnalyzerClient connection={state.connection} initialSavedQueries={state.savedQueries} />;
}
