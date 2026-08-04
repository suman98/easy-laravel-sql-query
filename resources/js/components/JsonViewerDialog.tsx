import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  Braces,
  Clipboard,
  ClipboardCheck,
  FoldVertical,
  UnfoldVertical,
  X,
} from "lucide-react";
import JsonTree from "@/components/JsonTree";
import { copyToClipboard } from "@/lib/clipboard";

export default function JsonViewerDialog({
  value,
  column,
  onClose,
}: {
  value: unknown;
  column: string;
  onClose: () => void;
}) {
  const [expandAll, setExpandAll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [raw, setRaw] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pretty = JSON.stringify(value, null, 2);

  async function handleCopy() {
    await copyToClipboard(pretty);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Portalled so the overlay escapes the results table's scroll container.
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="card flex max-h-[80vh] w-full max-w-2xl flex-col p-0"
      >
        <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <Braces className="h-4 w-4 text-indigo-500" />
          <h2 className="flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {column}
          </h2>

          <button
            onClick={() => setRaw((v) => !v)}
            className="btn-secondary"
            title={raw ? "Show tree view" : "Show raw JSON"}
          >
            {raw ? "Tree" : "Raw"}
          </button>

          {!raw && (
            <button
              onClick={() => setExpandAll((v) => !v)}
              className="btn-secondary"
              title={expandAll ? "Collapse all" : "Expand all"}
            >
              {expandAll ? (
                <FoldVertical className="h-3.5 w-3.5" />
              ) : (
                <UnfoldVertical className="h-3.5 w-3.5" />
              )}
              {expandAll ? "Collapse" : "Expand"}
            </button>
          )}

          <button onClick={handleCopy} className="btn-secondary" title="Copy JSON">
            {copied ? (
              <ClipboardCheck className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Clipboard className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>

          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-auto p-4">
          {raw ? (
            <pre className="font-mono text-xs leading-relaxed whitespace-pre text-zinc-800 dark:text-zinc-200">
              {pretty}
            </pre>
          ) : (
            <JsonTree value={value} expandAll={expandAll} />
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
