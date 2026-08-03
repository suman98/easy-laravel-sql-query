import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";

export default function ConfirmWriteDialog({
  isDdl,
  onConfirm,
  onCancel,
}: {
  isDdl: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-md p-5"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {isDdl ? "Confirm schema-changing query" : "Confirm write query"}
            </h2>
            <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              {isDdl
                ? "This statement alters or drops database structure (CREATE/ALTER/DROP/TRUNCATE/RENAME) and cannot be undone. Are you sure you want to run it?"
                : "This statement modifies data (INSERT/UPDATE/DELETE/REPLACE). Are you sure you want to run it?"}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-red-500 hover:shadow-md active:scale-[0.97]"
          >
            Run query
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
