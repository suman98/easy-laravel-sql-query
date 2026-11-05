import { useEffect, useState } from "react";
import { Link, router } from "@inertiajs/react";
import { AnimatePresence, motion } from "framer-motion";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import ConfirmDeleteConnectionDialog from "@/components/ConfirmDeleteConnectionDialog";
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

export default function ConnectionsTable({
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
  const [pendingDelete, setPendingDelete] = useState<ConnectionRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (draggingId === null) setOrder(connections);
  }, [connections]);

  function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    router.delete(`/connections/${pendingDelete.id}`, {
      preserveScroll: true,
      onFinish: () => {
        setDeleting(false);
        setPendingDelete(null);
      },
    });
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
              {sortable && <th className="w-8 px-2 py-2.5" />}
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Driver</th>
              <th className="px-4 py-2.5 font-medium">Host / Path</th>
              <th className="px-4 py-2.5 font-medium">Created</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {order.map((c, i) => {
              const meta = DRIVER_META[c.driver];
              const Icon = meta.icon;
              return (
                <motion.tr
                  key={c.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: i * 0.02 }}
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
                  className={`group relative border-b border-zinc-100 bg-white transition-colors last:border-0 hover:bg-zinc-50 dark:border-zinc-800/60 dark:bg-zinc-900 dark:hover:bg-zinc-800/50 ${
                    sortable ? "cursor-grab active:cursor-grabbing" : ""
                  } ${draggingId === c.id ? "opacity-50" : ""}`}
                >
                  {sortable && (
                    <td className="px-2 py-2.5 pointer-events-none">
                      <GripVertical className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-700" />
                    </td>
                  )}
                  <td className="relative px-4 py-2.5">
                    <Link
                      href={`/connections/${c.id}`}
                      className="absolute inset-0 z-0"
                      aria-label={c.name}
                      draggable={false}
                    />
                    <span className="relative z-10 flex items-center gap-2 pointer-events-none">
                      {c.color && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                          style={{ backgroundColor: c.color }}
                        />
                      )}
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {c.name}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 pointer-events-none">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${meta.badgeClass}`}
                    >
                      <Icon className="h-3 w-3" strokeWidth={2.25} />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500 pointer-events-none dark:text-zinc-400">
                    {c.driver === "sqlite" ? c.filePath : `${c.host}:${c.port}/${c.database}`}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400 pointer-events-none dark:text-zinc-500">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td className="relative z-10 px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Link
                        href={`/connections/${c.id}/edit`}
                        className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                        aria-label={`Edit ${c.name}`}
                        draggable={false}
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(c)}
                        className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15 dark:hover:text-red-400"
                        aria-label={`Delete ${c.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <AnimatePresence>
        {pendingDelete && (
          <ConfirmDeleteConnectionDialog
            name={pendingDelete.name}
            processing={deleting}
            onConfirm={confirmDelete}
            onCancel={() => setPendingDelete(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
