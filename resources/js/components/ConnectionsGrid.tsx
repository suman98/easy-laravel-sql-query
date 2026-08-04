import { useEffect, useState } from "react";
import { Link } from "@inertiajs/react";
import { motion } from "framer-motion";
import { ArrowUpRight, GripVertical, Pencil } from "lucide-react";
import { DRIVER_META } from "@/lib/driverMeta";
import type { ConnectionRecord } from "@/lib/clientTypes";

function moveItem(list: ConnectionRecord[], fromId: number, toId: number): ConnectionRecord[] {
  const fromIndex = list.findIndex((c) => c.id === fromId);
  const toIndex = list.findIndex((c) => c.id === toId);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return list;

  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export default function ConnectionsGrid({
  connections,
  sortable = false,
  onReorder,
}: {
  connections: ConnectionRecord[];
  sortable?: boolean;
  onReorder?: (next: ConnectionRecord[]) => void;
}) {
  const [order, setOrder] = useState(connections);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  useEffect(() => {
    if (draggingId === null) setOrder(connections);
  }, [connections]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {order.map((c, i) => {
        const meta = DRIVER_META[c.driver];
        const Icon = meta.icon;
        return (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
            className="group relative h-full"
          >
            <div
              draggable={sortable}
              onDragStart={sortable ? () => setDraggingId(c.id) : undefined}
              onDragOver={
                sortable
                  ? (e) => {
                      e.preventDefault();
                      if (draggingId !== null && draggingId !== c.id) {
                        setOrder((prev) => moveItem(prev, draggingId, c.id));
                      }
                    }
                  : undefined
              }
              onDrop={sortable ? (e) => e.preventDefault() : undefined}
              onDragEnd={
                sortable
                  ? () => {
                      setDraggingId(null);
                      onReorder?.(order);
                    }
                  : undefined
              }
              className={`relative flex h-full flex-col gap-4 overflow-hidden rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-zinc-300 group-hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:group-hover:border-zinc-700 ${
                sortable ? "cursor-grab active:cursor-grabbing" : ""
              } ${draggingId === c.id ? "opacity-50" : ""}`}
              style={
                c.color
                  ? { borderLeft: `3px solid ${c.color}`, backgroundColor: `${c.color}14` }
                  : undefined
              }
            >
              <Link
                href={`/connections/${c.id}`}
                className="absolute inset-0 z-0"
                aria-label={c.name}
                draggable={false}
              />

              <div
                className={`pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-linear-to-br ${meta.glowClass} to-transparent opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100`}
              />

              <div className="relative z-10 flex items-start justify-between pointer-events-none">
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${meta.badgeClass}`}>
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="flex items-center gap-1">
                  {sortable && (
                    <GripVertical className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-700" />
                  )}
                  {c.color && (
                    <span
                      className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                      style={{ backgroundColor: c.color }}
                      title={c.color}
                    />
                  )}
                  <Link
                    href={`/connections/${c.id}/edit`}
                    className="relative z-20 pointer-events-auto rounded-md p-1.5 text-zinc-300 opacity-0 transition-all duration-150 hover:bg-zinc-100 hover:text-zinc-600 group-hover:opacity-100 dark:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                    aria-label={`Edit ${c.name}`}
                    draggable={false}
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                  </Link>
                  <ArrowUpRight className="h-4 w-4 text-zinc-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-zinc-500 dark:text-zinc-700 dark:group-hover:text-zinc-400" />
                </div>
              </div>

              <div className="relative z-10 flex-1 pointer-events-none">
                <div className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
                  {c.name}
                </div>
                <div className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {c.driver === "sqlite" ? c.filePath : `${c.host}:${c.port}/${c.database}`}
                </div>
              </div>

              <div className="relative z-10 flex items-center justify-between border-t border-zinc-100 pt-3 text-xs dark:border-zinc-800 pointer-events-none">
                <span className={`rounded-full px-2 py-0.5 font-medium ${meta.badgeClass}`}>
                  {meta.label}
                </span>
                <span className="text-zinc-400 dark:text-zinc-500">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
