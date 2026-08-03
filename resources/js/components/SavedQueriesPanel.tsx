import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, Loader2, Plus, Trash2 } from "lucide-react";
import type { SavedQueryRecord } from "@/lib/clientTypes";
import { apiUrl } from "@/lib/api";

export default function SavedQueriesPanel({
  connectionId,
  savedQueries,
  currentSql,
  onLoad,
  onCreated,
  onDeleted,
}: {
  connectionId: number;
  savedQueries: SavedQueryRecord[];
  currentSql: string;
  onLoad: (sql: string) => void;
  onCreated: (q: SavedQueryRecord) => void;
  onDeleted: (id: number) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/connections/${connectionId}/saved-queries`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, query: currentSql }),
      });
      const data = await res.json();
      if (res.ok) {
        onCreated(data.savedQuery);
        setName("");
        setDescription("");
        setShowForm(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    await fetch(apiUrl(`/connections/${connectionId}/saved-queries/${id}`), { method: "DELETE" });
    onDeleted(id);
    setDeletingId(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence mode="wait" initial={false}>
        {showForm ? (
          <motion.form
            key="form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            onSubmit={handleSave}
            className="flex flex-col gap-2 overflow-hidden rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <input
              className="input"
              placeholder="Query name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
            <input
              className="input"
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500"
              >
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </motion.form>
        ) : (
          <motion.button
            key="trigger"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowForm(true)}
            disabled={!currentSql.trim()}
            className="inline-flex items-center gap-1.5 self-start rounded-md border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-indigo-500/50 dark:hover:text-indigo-300"
          >
            <Plus className="h-3.5 w-3.5" />
            Save current query
          </motion.button>
        )}
      </AnimatePresence>

      {savedQueries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-zinc-400 dark:text-zinc-600">
          <Bookmark className="h-6 w-6" strokeWidth={1.5} />
          <span className="text-xs">No saved queries yet.</span>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          <AnimatePresence initial={false}>
            {savedQueries.map((q) => (
              <motion.li
                key={q.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, height: 0 }}
                className="group flex items-center justify-between gap-2 bg-white px-3 py-2 transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
              >
                <button onClick={() => onLoad(q.query)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {q.name}
                  </div>
                  {q.description && (
                    <div className="truncate text-xs text-zinc-500">{q.description}</div>
                  )}
                </button>
                <button
                  onClick={() => handleDelete(q.id)}
                  disabled={deletingId === q.id}
                  className="shrink-0 text-zinc-300 opacity-0 transition-all duration-150 hover:text-red-500 group-hover:opacity-100 dark:text-zinc-600"
                >
                  {deletingId === q.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
