import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, Search, X } from "lucide-react";
import JsonViewerDialog from "@/components/JsonViewerDialog";
import { asJsonValue, jsonSummary, truncate } from "@/lib/jsonCell";

const PAGE_SIZE = 50;

function formatCell(value: unknown): { text: string; isNull: boolean } {
  if (value === null || value === undefined) return { text: "NULL", isNull: true };
  if (typeof value === "object") return { text: JSON.stringify(value), isNull: false };
  return { text: String(value), isNull: false };
}

export default function ResultsTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: unknown[][];
}) {
  const [page, setPage] = useState(1);
  const [trackedRows, setTrackedRows] = useState(rows);
  const [viewing, setViewing] = useState<{ column: string; value: unknown } | null>(null);
  const [search, setSearch] = useState("");

  if (rows !== trackedRows) {
    setTrackedRows(rows);
    setPage(1);
    setSearch("");
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.some((cell) => formatCell(cell).text.toLowerCase().includes(q)));
  }, [rows, search]);

  if (columns.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        No columns returned.
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filteredRows.slice(start, start + PAGE_SIZE);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-zinc-200 shadow-sm dark:border-zinc-800">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 bg-zinc-50/60 px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/60">
        <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Filter results…"
          className="w-full min-w-0 bg-transparent text-xs text-zinc-700 outline-none placeholder:text-zinc-400 dark:text-zinc-200"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="shrink-0 rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
          {search ? `${filteredRows.length} / ${rows.length}` : `${rows.length}`}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur-sm dark:bg-zinc-900/95">
            <tr>
              {columns.map((c, i) => (
                <th
                  key={i}
                  className="whitespace-nowrap border-b border-zinc-200 px-3 py-2 text-left font-semibold tracking-wide text-zinc-600 uppercase text-[10px] dark:border-zinc-800 dark:text-zinc-400"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-6 text-center text-zinc-400 dark:text-zinc-600"
                >
                  No matching rows.
                </td>
              </tr>
            )}
            {pageRows.map((row, ri) => (
              <tr
                key={start + ri}
                className="odd:bg-white even:bg-zinc-50/60 transition-colors hover:bg-indigo-50/60 dark:odd:bg-zinc-950 dark:even:bg-zinc-900/40 dark:hover:bg-indigo-500/5"
              >
                {row.map((cell, ci) => {
                  const { text, isNull } = formatCell(cell);
                  const json = asJsonValue(cell);
                  return (
                    <td
                      key={ci}
                      className={`whitespace-nowrap border-b border-zinc-100 px-3 py-1.5 font-mono dark:border-zinc-900 ${
                        isNull
                          ? "italic text-zinc-400 dark:text-zinc-600"
                          : "text-zinc-800 dark:text-zinc-200"
                      }`}
                    >
                      {json ? (
                        <span className="flex items-center gap-2">
                          <span
                            className="text-zinc-500 dark:text-zinc-400"
                            title={jsonSummary(json)}
                          >
                            {truncate(text)}
                          </span>
                          <button
                            onClick={() => setViewing({ column: columns[ci], value: json })}
                            className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 dark:border-zinc-800 dark:text-indigo-400 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10"
                          >
                            <Eye className="h-3 w-3" />
                            View
                          </button>
                        </span>
                      ) : (
                        text
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex shrink-0 items-center justify-between border-t border-zinc-200 bg-zinc-50/60 px-3 py-1.5 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
          <span>
            Rows {start + 1}–{Math.min(start + PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={currentPage === 1}
              className="rounded p-1 transition-colors hover:bg-zinc-200/70 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-zinc-800"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded p-1 transition-colors hover:bg-zinc-200/70 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-zinc-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 font-medium text-zinc-700 dark:text-zinc-300">
              Page {currentPage} of {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage === pageCount}
              className="rounded p-1 transition-colors hover:bg-zinc-200/70 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-zinc-800"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setPage(pageCount)}
              disabled={currentPage === pageCount}
              className="rounded p-1 transition-colors hover:bg-zinc-200/70 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-zinc-800"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {viewing && (
          <JsonViewerDialog
            column={viewing.column}
            value={viewing.value}
            onClose={() => setViewing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
