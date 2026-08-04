import { Link } from "@inertiajs/react";
import { useEffect, useMemo, useState } from "react";
import { Plus, DatabaseZap, ArrowUpDown } from "lucide-react";
import Brand from "@/components/Brand";
import ThemeToggle from "@/components/ThemeToggle";
import ConnectionsGrid from "@/components/ConnectionsGrid";
import { DRIVER_META } from "@/lib/driverMeta";
import { apiUrl } from "@/lib/api";
import type { ConnectionRecord } from "@/lib/clientTypes";

type SortKey = "custom" | "name" | "driver" | "newest" | "oldest";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "custom", label: "Custom (drag to reorder)" },
  { value: "name", label: "Name (A-Z)" },
  { value: "driver", label: "Driver" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

function sortConnections(connections: ConnectionRecord[], sortBy: SortKey): ConnectionRecord[] {
  const sorted = [...connections];
  switch (sortBy) {
    case "custom":
      return sorted;
    case "name":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "driver":
      return sorted.sort(
        (a, b) =>
          DRIVER_META[a.driver].label.localeCompare(DRIVER_META[b.driver].label) ||
          a.name.localeCompare(b.name)
      );
    case "newest":
      return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    case "oldest":
      return sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
}

export default function Index({ connections }: { connections: ConnectionRecord[] }) {
  const [sortBy, setSortBy] = useState<SortKey>("custom");
  const [items, setItems] = useState(connections);
  useEffect(() => setItems(connections), [connections]);

  const sorted = useMemo(() => sortConnections(items, sortBy), [items, sortBy]);

  function handleReorder(next: ConnectionRecord[]) {
    const repositioned = next.map((c, i) => ({ ...c, position: i }));
    setItems(repositioned);
    fetch(apiUrl("/connections/reorder"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((c) => c.id) }),
    }).catch(() => {});
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200/80 bg-white/80 px-6 py-3.5 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <Brand />
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
        <div className="flex animate-slide-up items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Databases
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {connections.length === 0
                ? "Connect a database to start querying."
                : `${connections.length} saved connection${connections.length === 1 ? "" : "s"}.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {connections.length > 0 && (
              <label className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                <ArrowUpDown className="h-3.5 w-3.5" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-700 focus:border-indigo-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Link href="/connections/new" className="btn-primary">
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              New connection
            </Link>
          </div>
        </div>

        {connections.length === 0 ? (
          <div className="animate-scale-in flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 py-20 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
              <DatabaseZap className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              No databases yet
            </div>
            <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
              Add a MySQL, PostgreSQL, or SQLite connection to browse tables and run queries.
            </p>
            <Link href="/connections/new" className="btn-primary mt-2">
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              New connection
            </Link>
          </div>
        ) : (
          <ConnectionsGrid
            connections={sorted}
            sortable={sortBy === "custom"}
            onReorder={handleReorder}
          />
        )}
      </div>
    </div>
  );
}
