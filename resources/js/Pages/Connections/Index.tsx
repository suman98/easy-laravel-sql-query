import { Link } from "@inertiajs/react";
import { Plus, DatabaseZap } from "lucide-react";
import Brand from "@/components/Brand";
import ConnectionsGrid from "@/components/ConnectionsGrid";
import type { ConnectionRecord } from "@/lib/clientTypes";

export default function Index({ connections }: { connections: ConnectionRecord[] }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200/80 bg-white/80 px-6 py-3.5 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <Brand />
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
          <Link href="/connections/new" className="btn-primary">
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            New connection
          </Link>
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
          <ConnectionsGrid connections={connections} />
        )}
      </div>
    </div>
  );
}
