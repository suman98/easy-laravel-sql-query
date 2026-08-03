import { useEffect, useRef, useState } from "react";
import { Link } from "@inertiajs/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clipboard,
  ClipboardCheck,
  Code2,
  Download,
  FileDown,
  FileJson,
  Loader2,
  Play,
  Table2,
  Bookmark,
} from "lucide-react";
import SqlEditor from "@/components/SqlEditor";
import ResultsTable from "@/components/ResultsTable";
import TableBrowser from "@/components/TableBrowser";
import SavedQueriesPanel from "@/components/SavedQueriesPanel";
import ConfirmWriteDialog from "@/components/ConfirmWriteDialog";
import Brand from "@/components/Brand";
import ThemeToggle from "@/components/ThemeToggle";
import { DRIVER_META } from "@/lib/driverMeta";
import { toMarkdownTable, toJsonRows } from "@/lib/markdown";
import { apiUrl } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import type {
  ConnectionRecord,
  SavedQueryRecord,
  AutocompleteTerm,
} from "@/lib/clientTypes";

type Panel = "editor" | "tables" | "saved";

const PANELS: { key: Panel; label: string; icon: typeof Code2 }[] = [
  { key: "editor", label: "Editor", icon: Code2 },
  { key: "tables", label: "Tables", icon: Table2 },
  { key: "saved", label: "Saved", icon: Bookmark },
];

export default function AnalyzerClient({
  connection,
  initialSavedQueries,
}: {
  connection: ConnectionRecord;
  initialSavedQueries: SavedQueryRecord[];
}) {
  const [sql, setSql] = useState("");
  const [limit, setLimit] = useState(200);
  const [panel, setPanel] = useState<Panel>("editor");
  const [terms, setTerms] = useState<AutocompleteTerm[]>([]);
  const [savedQueries, setSavedQueries] = useState(initialSavedQueries);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [writeSuccess, setWriteSuccess] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const [confirm, setConfirm] = useState<{ isDdl: boolean } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);

  const meta = DRIVER_META[connection.driver];
  const DriverIcon = meta.icon;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (copyMenuRef.current && !copyMenuRef.current.contains(e.target as Node)) {
        setCopyMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    fetch(apiUrl(`/connections/${connection.id}/autocomplete`))
      .then((r) => r.json())
      .then((data) => setTerms(data.terms ?? []))
      .catch(() => {});
  }, [connection.id]);

  async function runQuery(confirmWrite = false) {
    const trimmed = sql.trim();
    if (!trimmed) {
      setError("Query is empty.");
      return;
    }

    setRunning(true);
    setError(null);
    setWriteSuccess(null);

    try {
      const res = await fetch(apiUrl(`/connections/${connection.id}/query`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: trimmed, limit, confirmWrite }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Query failed.");
        setColumns([]);
        setRows([]);
        setRowCount(null);
        setExecutionTime(null);
        setHasRun(true);
        return;
      }

      if (data.needsConfirm) {
        setConfirm({ isDdl: data.isDdl });
        return;
      }

      setColumns(data.columns);
      setRows(data.rows);
      setRowCount(data.rowCount);
      setExecutionTime(data.executionTime);
      setHasRun(true);
      if (data.isWriteQuery) {
        setWriteSuccess(`Query executed. ${data.rowCount} row(s) affected.`);
      }
    } finally {
      setRunning(false);
    }
  }

  function handleConfirm() {
    setConfirm(null);
    runQuery(true);
  }

  async function handleExport(format: "csv" | "markdown") {
    const trimmed = sql.trim();
    if (!trimmed) return;
    setExporting(true);
    try {
      const res = await fetch(apiUrl(`/connections/${connection.id}/export`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: trimmed, format }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Export failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      a.download = match ? match[1] : `export.${format === "markdown" ? "md" : "csv"}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function handleCopy(format: "markdown" | "json") {
    const text = format === "markdown" ? toMarkdownTable(columns, rows) : toJsonRows(columns, rows);
    await copyToClipboard(text);
    setCopyMenuOpen(false);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function useTable(tableName: string) {
    setSql(`SELECT * FROM ${tableName} LIMIT 100;`);
    setPanel("editor");
  }

  return (
    <div className="flex flex-1 flex-col">
      <AnimatePresence>
        {confirm && (
          <ConfirmWriteDialog
            isDdl={confirm.isDdl}
            onConfirm={handleConfirm}
            onCancel={() => setConfirm(null)}
          />
        )}
      </AnimatePresence>

      <header className="flex items-center justify-between border-b border-zinc-200/80 bg-white/80 px-5 py-3 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80">
        <div className="flex items-center gap-2.5">
          <Brand href="/connections" />
          <ChevronRight className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-700" />
          <Link
            href="/connections"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Databases
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-700" />
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {connection.name}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.badgeClass}`}
          >
            <DriverIcon className="h-3.5 w-3.5" strokeWidth={2.25} />
            {meta.label}
          </span>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800">
          <nav className="relative flex border-b border-zinc-200 dark:border-zinc-800">
            {PANELS.map(({ key, label, icon: Icon }) => {
              const active = panel === key;
              return (
                <button
                  key={key}
                  onClick={() => setPanel(key)}
                  className={`relative flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? "font-medium text-zinc-900 dark:text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                  {label}
                  {active && (
                    <motion.span
                      layoutId="tab-indicator"
                      className="absolute inset-x-0 -bottom-px h-0.5 bg-indigo-600 dark:bg-indigo-400"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
          <div className="flex-1 overflow-auto p-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={panel}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
              >
                {panel === "tables" && (
                  <TableBrowser connectionId={connection.id} onUseTable={useTable} />
                )}
                {panel === "saved" && (
                  <SavedQueriesPanel
                    connectionId={connection.id}
                    savedQueries={savedQueries}
                    currentSql={sql}
                    onLoad={(q) => {
                      setSql(q);
                      setPanel("editor");
                    }}
                    onCreated={(q) =>
                      setSavedQueries((prev) =>
                        [...prev, q].sort((a, b) => a.name.localeCompare(b.name))
                      )
                    }
                    onDeleted={(id) =>
                      setSavedQueries((prev) => prev.filter((q) => q.id !== id))
                    }
                  />
                )}
                {panel === "editor" && (
                  <div className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                    Write SQL in the editor and run it. Switch to{" "}
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">Tables</span>{" "}
                    to browse schema or{" "}
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">Saved</span>{" "}
                    to reuse a query.
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </aside>

        <main className="flex flex-1 flex-col gap-3 overflow-auto p-4">
          <SqlEditor
            value={sql}
            onChange={setSql}
            driver={connection.driver}
            terms={terms}
            onRun={() => runQuery(false)}
            disabled={running}
          />

          <div className="flex flex-wrap items-center gap-2.5">
            <button onClick={() => runQuery(false)} disabled={running} className="btn-primary">
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" strokeWidth={2.25} fill="currentColor" />
              )}
              {running ? "Running…" : "Run"}
              <kbd className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-normal">
                ⌘⏎
              </kbd>
            </button>

            <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              Limit
              <input
                type="number"
                min={1}
                max={1000}
                className="input w-20"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            </label>

            <div className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-800" />

            <button
              onClick={() => handleExport("csv")}
              disabled={exporting || !sql.trim()}
              className="btn-secondary"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>

            <button
              onClick={() => handleExport("markdown")}
              disabled={exporting || !sql.trim()}
              className="btn-secondary"
            >
              <FileDown className="h-3.5 w-3.5" />
              Markdown
            </button>

            <div className="relative" ref={copyMenuRef}>
              <button
                onClick={() => setCopyMenuOpen((v) => !v)}
                disabled={columns.length === 0}
                className="btn-secondary"
              >
                {copied ? (
                  <ClipboardCheck className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Clipboard className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied" : "Copy"}
                <ChevronDown className="h-3 w-3 text-zinc-400" />
              </button>

              <AnimatePresence>
                {copyMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.12 }}
                    className="absolute left-0 top-full z-20 mt-1.5 w-44 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <button
                      onClick={() => handleCopy("markdown")}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <FileDown className="h-3.5 w-3.5 text-zinc-400" />
                      Copy as Markdown
                    </button>
                    <button
                      onClick={() => handleCopy("json")}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <FileJson className="h-3.5 w-3.5 text-zinc-400" />
                      Copy as JSON
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {executionTime !== null && (
                <motion.span
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="ml-auto flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {rowCount} row{rowCount === 1 ? "" : "s"}
                  <span className="text-zinc-300 dark:text-zinc-600">·</span>
                  {executionTime}ms
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-start gap-2 overflow-hidden rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="font-mono text-xs leading-relaxed">{error}</span>
              </motion.div>
            )}

            {writeSuccess && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {writeSuccess}
              </motion.div>
            )}
          </AnimatePresence>

          {!error && columns.length > 0 && (
            <motion.div
              key={hasRun ? "results" : "empty"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              <ResultsTable columns={columns} rows={rows} />
            </motion.div>
          )}

          {!hasRun && !error && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 py-16 text-center text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
              <Code2 className="h-8 w-8" strokeWidth={1.5} />
              <p className="text-sm">Run a query to see results here.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
