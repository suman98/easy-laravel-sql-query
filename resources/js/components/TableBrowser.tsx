import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Hash, KeyRound, Search, SquareStack, Table2 } from "lucide-react";
import type { TableInfo, TableSchema } from "@/lib/clientTypes";
import { apiUrl } from "@/lib/api";

export default function TableBrowser({
  connectionId,
  onUseTable,
}: {
  connectionId: number;
  onUseTable: (tableName: string) => void;
}) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [schema, setSchema] = useState<TableSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetch(apiUrl(`/connections/${connectionId}/tables?search=${encodeURIComponent(search)}`), {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (active) setTables(data.tables ?? []);
      })
      .catch((err) => {
        if (active && err.name !== "AbortError") throw err;
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [connectionId, search]);

  async function selectTable(t: TableInfo) {
    if (selectedKey === t.tableKey) {
      setSelectedKey(null);
      setSchema(null);
      return;
    }
    setSelectedKey(t.tableKey);
    setSchema(null);
    setSchemaLoading(true);
    try {
      const res = await fetch(
        apiUrl(
          `/connections/${connectionId}/schema?schema=${encodeURIComponent(
            t.tableSchema
          )}&table=${encodeURIComponent(t.tableName)}`
        )
      );
      const data = await res.json();
      setSchema(data);
    } finally {
      setSchemaLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        <input
          className="input w-full pl-8"
          placeholder="Search tables…"
          value={search}
          onChange={(e) => {
            setLoading(true);
            setSearch(e.target.value);
          }}
        />
      </div>

      {loading ? (
        <div className="flex flex-col gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-9 rounded-md" />
          ))}
        </div>
      ) : tables.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-zinc-400 dark:text-zinc-600">
          <Table2 className="h-6 w-6" strokeWidth={1.5} />
          <span className="text-xs">No tables found.</span>
        </div>
      ) : (
        <ul className="flex max-h-105 flex-col divide-y divide-zinc-200 overflow-y-auto overflow-x-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {tables.map((t) => {
            const open = selectedKey === t.tableKey;
            return (
              <li key={t.tableKey} className="bg-white dark:bg-zinc-900">
                <div className="group flex items-center gap-1 px-2 py-1.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                  <button
                    onClick={() => selectTable(t)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm text-zinc-800 dark:text-zinc-200"
                  >
                    <motion.span
                      animate={{ rotate: open ? 90 : 0 }}
                      transition={{ duration: 0.15 }}
                      className="shrink-0 text-zinc-400"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </motion.span>
                    <span className="truncate font-medium">{t.tableName}</span>
                    <span className="shrink-0 text-xs text-zinc-400">{t.sizeHuman}</span>
                  </button>
                  <button
                    onClick={() => onUseTable(t.tableName)}
                    className="shrink-0 rounded-md border border-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 opacity-0 transition-all duration-150 hover:border-indigo-300 hover:text-indigo-600 group-hover:opacity-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-indigo-500/50 dark:hover:text-indigo-300"
                  >
                    Use
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden border-t border-zinc-100 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-950/40"
                    >
                      <div className="px-3 py-2.5 text-xs">
                        {schemaLoading ? (
                          <div className="flex flex-col gap-1">
                            <div className="skeleton h-3.5 w-3/4 rounded" />
                            <div className="skeleton h-3.5 w-1/2 rounded" />
                            <div className="skeleton h-3.5 w-2/3 rounded" />
                          </div>
                        ) : schema ? (
                          <div className="flex flex-col gap-3">
                            <div>
                              <div className="mb-1.5 flex items-center gap-1 font-semibold text-zinc-500">
                                <SquareStack className="h-3 w-3" />
                                Columns
                              </div>
                              <table className="w-full text-left">
                                <tbody>
                                  {schema.columns.map((c) => (
                                    <tr
                                      key={c.name}
                                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                                    >
                                      <td className="py-1 pr-2 font-mono text-zinc-800 dark:text-zinc-200">
                                        {c.name}
                                      </td>
                                      <td className="py-1 pr-2 text-zinc-500">{c.type}</td>
                                      <td className="py-1 text-right text-zinc-400">
                                        {c.nullable === "YES" || c.nullable === "1"
                                          ? ""
                                          : "not null"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {schema.indexes.length > 0 && (
                              <div>
                                <div className="mb-1.5 flex items-center gap-1 font-semibold text-zinc-500">
                                  <KeyRound className="h-3 w-3" />
                                  Indexes
                                </div>
                                <ul className="flex flex-col gap-1">
                                  {schema.indexes.map((i) => (
                                    <li
                                      key={i.name}
                                      className="flex items-center gap-1.5 font-mono text-zinc-600 dark:text-zinc-300"
                                    >
                                      <Hash className="h-3 w-3 shrink-0 text-zinc-400" />
                                      <span className="truncate">
                                        {i.name}: {i.definition}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
