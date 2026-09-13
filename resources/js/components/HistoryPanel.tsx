import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, History, Loader2, Play, Trash2 } from "lucide-react";
import type { QueryHistoryRecord } from "@/lib/clientTypes";
import { apiUrl } from "@/lib/api";

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function HistoryPanel({
  connectionId,
  history,
  onLoad,
  onRun,
  onDeleted,
  onCleared,
}: {
  connectionId: number;
  history: QueryHistoryRecord[];
  onLoad: (sql: string) => void;
  onRun: (sql: string) => void;
  onDeleted: (id: number) => void;
  onCleared: () => void;
}) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  async function handleDelete(id: number) {
    setDeletingId(id);
    await fetch(apiUrl(`/connections/${connectionId}/history/${id}`), { method: "DELETE" });
    onDeleted(id);
    setDeletingId(null);
  }

  async function handleClear() {
    setClearing(true);
    try {
      await fetch(apiUrl(`/connections/${connectionId}/history`), { method: "DELETE" });
      onCleared();
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {history.length > 0 && (
        <button
          onClick={handleClear}
          disabled={clearing}
          className="inline-flex items-center gap-1.5 self-start rounded-md border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-red-300 hover:text-red-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-500/50 dark:hover:text-red-300"
        >
          {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Clear history
        </button>
      )}

      {history.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-zinc-400 dark:text-zinc-600">
          <History className="h-6 w-6" strokeWidth={1.5} />
          <span className="text-xs">No queries run yet.</span>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          <AnimatePresence initial={false}>
            {history.map((h) => (
              <motion.li
                key={h.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, height: 0 }}
                className="group flex items-start justify-between gap-2 bg-white px-3 py-2 transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
              >
                <button
                  onClick={() => onLoad(h.sql)}
                  className="min-w-0 flex-1 text-left"
                  title="Load into editor"
                >
                  <div className="flex items-center gap-1.5">
                    {!h.success && <AlertCircle className="h-3 w-3 shrink-0 text-red-500" />}
                    <div className="truncate font-mono text-xs text-zinc-800 dark:text-zinc-200">
                      {h.sql}
                    </div>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                    <span>{timeAgo(h.created_at)}</span>
                    {h.success && h.row_count !== null && (
                      <>
                        <span>·</span>
                        <span>{h.row_count} row{h.row_count === 1 ? "" : "s"}</span>
                      </>
                    )}
                    {h.execution_time !== null && (
                      <>
                        <span>·</span>
                        <span>{h.execution_time}ms</span>
                      </>
                    )}
                    {!h.success && h.error && (
                      <span className="truncate text-red-500 dark:text-red-400">· {h.error}</span>
                    )}
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => onRun(h.sql)}
                    className="text-zinc-300 opacity-0 transition-all duration-150 hover:text-indigo-500 group-hover:opacity-100 dark:text-zinc-600"
                    title="Run again"
                  >
                    <Play className="h-3.5 w-3.5" fill="currentColor" />
                  </button>
                  <button
                    onClick={() => handleDelete(h.id)}
                    disabled={deletingId === h.id}
                    className="text-zinc-300 opacity-0 transition-all duration-150 hover:text-red-500 group-hover:opacity-100 dark:text-zinc-600"
                    title="Remove"
                  >
                    {deletingId === h.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
