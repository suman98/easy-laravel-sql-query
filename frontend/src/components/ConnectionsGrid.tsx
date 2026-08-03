import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { DRIVER_META } from "@/lib/driverMeta";
import type { ConnectionRecord } from "@/lib/clientTypes";

export default function ConnectionsGrid({
  connections,
}: {
  connections: ConnectionRecord[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {connections.map((c, i) => {
        const meta = DRIVER_META[c.driver];
        const Icon = meta.icon;
        return (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
          >
            <Link
              to={`/connections/${c.id}`}
              className="group relative flex h-full flex-col gap-4 overflow-hidden rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
            >
              <div
                className={`pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-linear-to-br ${meta.glowClass} to-transparent opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100`}
              />

              <div className="flex items-start justify-between">
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${meta.badgeClass}`}>
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <ArrowUpRight className="h-4 w-4 text-zinc-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-zinc-500 dark:text-zinc-700 dark:group-hover:text-zinc-400" />
              </div>

              <div className="flex-1">
                <div className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
                  {c.name}
                </div>
                <div className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {c.driver === "sqlite" ? c.filePath : `${c.host}:${c.port}/${c.database}`}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-zinc-100 pt-3 text-xs dark:border-zinc-800">
                <span className={`rounded-full px-2 py-0.5 font-medium ${meta.badgeClass}`}>
                  {meta.label}
                </span>
                <span className="text-zinc-400 dark:text-zinc-500">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </div>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
