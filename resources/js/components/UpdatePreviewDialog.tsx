import { motion } from "framer-motion";
import { AlertCircle, Loader2, Pencil } from "lucide-react";

export default function UpdatePreviewDialog({
  table,
  statements,
  running,
  error,
  onConfirm,
  onCancel,
}: {
  table: string;
  statements: string[];
  running: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={running ? undefined : onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="card flex max-h-[80vh] w-full max-w-2xl flex-col p-5"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            <Pencil className="h-5 w-5" strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Update {statements.length} row{statements.length === 1 ? "" : "s"} in {table}
            </h2>
            <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              These statements run in a single transaction. If any fails, nothing is changed.
            </p>
          </div>
        </div>

        <pre className="mt-4 min-h-0 flex-1 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
          {statements.join("\n")}
        </pre>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="font-mono">{error}</span>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} disabled={running} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={running}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-amber-500 hover:shadow-md active:scale-[0.97] disabled:opacity-60"
          >
            {running && <Loader2 className="h-4 w-4 animate-spin" />}
            Run update
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
