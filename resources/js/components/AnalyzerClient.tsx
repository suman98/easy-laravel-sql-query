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
  Eraser,
  FileDown,
  FileJson,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Sparkles,
  Table2,
  Bookmark,
  History,
  X,
} from "lucide-react";
import SqlEditor, { type SqlEditorHandle } from "@/components/SqlEditor";
import ResultsTable from "@/components/ResultsTable";
import TableBrowser from "@/components/TableBrowser";
import SavedQueriesPanel from "@/components/SavedQueriesPanel";
import HistoryPanel from "@/components/HistoryPanel";
import ConfirmWriteDialog from "@/components/ConfirmWriteDialog";
import { COLOR_SWATCHES } from "@/components/ConnectionForm";
import Brand from "@/components/Brand";
import ThemeToggle from "@/components/ThemeToggle";
import { DRIVER_META } from "@/lib/driverMeta";
import { toMarkdownTable, toJsonRows } from "@/lib/markdown";
import { apiUrl } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import { loadQueryTabs, saveQueryTabs } from "@/lib/queryDraft";
import type {
  ConnectionRecord,
  SavedQueryRecord,
  QueryHistoryRecord,
  AutocompleteTerm,
} from "@/lib/clientTypes";

type Panel = "tables" | "saved" | "history";

const PANELS: { key: Panel; label: string; icon: typeof Code2 }[] = [
  { key: "tables", label: "Tables", icon: Table2 },
  { key: "saved", label: "Saved", icon: Bookmark },
  { key: "history", label: "History", icon: History },
];

interface QueryTab {
  id: string;
  name: string;
  color: string | null;
  sql: string;
  selectedSql: string;
  running: boolean;
  error: string | null;
  columns: string[];
  rows: unknown[][];
  rowCount: number | null;
  executionTime: number | null;
  writeSuccess: string | null;
  hasRun: boolean;
  confirm: { isDdl: boolean } | null;
}

function createTab(id: string, name: string, sql = "", color: string | null = null): QueryTab {
  return {
    id,
    name,
    color,
    sql,
    selectedSql: "",
    running: false,
    error: null,
    columns: [],
    rows: [],
    rowCount: null,
    executionTime: null,
    writeSuccess: null,
    hasRun: false,
    confirm: null,
  };
}

function initialTabs(connectionId: number): QueryTab[] {
  const draft = loadQueryTabs(connectionId);
  if (draft) return draft.map((t) => createTab(t.id, t.name, t.sql, t.color ?? null));
  return [createTab("t1", "Query 1")];
}

const SIDEBAR_WIDTH_KEY = "sqlclient:sidebarWidth";
const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 560;
const SIDEBAR_DEFAULT = 288;

function clampSidebarWidth(n: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, n));
}

function loadSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? clampSidebarWidth(n) : SIDEBAR_DEFAULT;
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

function saveSidebarWidth(width: number): void {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  } catch {
    // best-effort
  }
}

const SIDEBAR_COLLAPSED_KEY = "sqlclient:sidebarCollapsed";

function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // best-effort
  }
}

export default function AnalyzerClient({
  connection,
  initialSavedQueries,
  initialQueryHistory,
}: {
  connection: ConnectionRecord;
  initialSavedQueries: SavedQueryRecord[];
  initialQueryHistory: QueryHistoryRecord[];
}) {
  const [tabs, setTabs] = useState<QueryTab[]>(() => initialTabs(connection.id));
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);
  const tabCounterRef = useRef(tabs.length);

  const [limit, setLimit] = useState(200);
  const [panel, setPanel] = useState<Panel>("tables");
  const [terms, setTerms] = useState<AutocompleteTerm[]>([]);
  const [savedQueries, setSavedQueries] = useState(initialSavedQueries);
  const [queryHistory, setQueryHistory] = useState(initialQueryHistory);

  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);
  const draftConnectionId = useRef(connection.id);

  const [selectedTable, setSelectedTable] = useState<{
    tableName: string;
    tableSchema: string;
  } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFixSelection, setAiFixSelection] = useState(false);
  const aiRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<SqlEditorHandle>(null);

  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [colorPickerTabId, setColorPickerTabId] = useState<string | null>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  const asideRef = useRef<HTMLElement>(null);
  const isResizingRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => loadSidebarWidth());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => loadSidebarCollapsed());

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      saveSidebarCollapsed(next);
      return next;
    });
  }

  const meta = DRIVER_META[connection.driver];
  const DriverIcon = meta.icon;

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  function updateTab(id: string, patch: Partial<QueryTab> | ((t: QueryTab) => Partial<QueryTab>)) {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t))
    );
  }

  function addTab() {
    const n = ++tabCounterRef.current;
    const tab = createTab(`t${n}-${Date.now()}`, `Query ${n}`);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }

  function closeTab(id: string) {
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    if (activeTabId === id) {
      setActiveTabId(next[Math.min(idx, next.length - 1)].id);
    }
  }

  function startRename(tab: QueryTab) {
    setRenamingTabId(tab.id);
    setRenameValue(tab.name);
  }

  function commitRename() {
    if (renamingTabId) {
      const trimmed = renameValue.trim();
      if (trimmed) updateTab(renamingTabId, { name: trimmed });
    }
    setRenamingTabId(null);
  }

  function startSidebarResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    isResizingRef.current = true;
    setIsResizing(true);
  }

  function onSidebarResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isResizingRef.current || !asideRef.current) return;
    const left = asideRef.current.getBoundingClientRect().left;
    setSidebarWidth(clampSidebarWidth(e.clientX - left));
  }

  function stopSidebarResize(e: React.PointerEvent<HTMLDivElement>) {
    if (!isResizingRef.current) return;
    isResizingRef.current = false;
    setIsResizing(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setSidebarWidth((w) => {
      saveSidebarWidth(w);
      return w;
    });
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (copyMenuRef.current && !copyMenuRef.current.contains(e.target as Node)) {
        setCopyMenuOpen(false);
      }
      if (aiRef.current && !aiRef.current.contains(e.target as Node)) {
        setAiOpen(false);
      }
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorPickerTabId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Swap in the tabs belonging to the new connection before persisting again.
  useEffect(() => {
    if (draftConnectionId.current === connection.id) return;
    draftConnectionId.current = connection.id;
    const next = initialTabs(connection.id);
    tabCounterRef.current = next.length;
    setTabs(next);
    setActiveTabId(next[0].id);
  }, [connection.id]);

  useEffect(() => {
    if (draftConnectionId.current !== connection.id) return;
    const timer = setTimeout(
      () =>
        saveQueryTabs(
          connection.id,
          tabs.map((t) => ({ id: t.id, name: t.name, sql: t.sql, color: t.color }))
        ),
      300
    );
    return () => clearTimeout(timer);
  }, [connection.id, tabs]);

  useEffect(() => {
    if (!isResizing) return;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  useEffect(() => {
    fetch(apiUrl(`/connections/${connection.id}/autocomplete`))
      .then((r) => r.json())
      .then((data) => setTerms(data.terms ?? []))
      .catch(() => {});
  }, [connection.id]);

  // Highlighting part of the editor scopes every action to that selection.
  const activeSql = activeTab.selectedSql.trim() || activeTab.sql.trim();
  const runningSelection = activeTab.selectedSql.trim().length > 0;

  async function refreshHistory() {
    try {
      const res = await fetch(apiUrl(`/connections/${connection.id}/history`));
      const data = await res.json();
      if (res.ok) setQueryHistory(data.history ?? []);
    } catch {
      // ignore
    }
  }

  async function runQuery(tabId: string, confirmWrite = false, overrideSql?: string) {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const trimmed = (overrideSql ?? (tab.selectedSql.trim() || tab.sql.trim())).trim();
    if (!trimmed) {
      updateTab(tabId, { error: "Query is empty." });
      return;
    }

    updateTab(tabId, { running: true, error: null, writeSuccess: null });

    try {
      const res = await fetch(apiUrl(`/connections/${connection.id}/query`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: trimmed, limit, confirmWrite }),
      });
      const data = await res.json();

      if (!res.ok) {
        updateTab(tabId, {
          error: data.error ?? "Query failed.",
          columns: [],
          rows: [],
          rowCount: null,
          executionTime: null,
          hasRun: true,
        });
        return;
      }

      if (data.needsConfirm) {
        updateTab(tabId, { confirm: { isDdl: data.isDdl } });
        return;
      }

      updateTab(tabId, {
        columns: data.columns,
        rows: data.rows,
        rowCount: data.rowCount,
        executionTime: data.executionTime,
        hasRun: true,
        writeSuccess: data.isWriteQuery ? `Query executed. ${data.rowCount} row(s) affected.` : null,
      });
    } finally {
      updateTab(tabId, { running: false });
      refreshHistory();
    }
  }

  function handleConfirm(tabId: string) {
    updateTab(tabId, { confirm: null });
    runQuery(tabId, true);
  }

  function runFromHistory(historySql: string) {
    const tabId = activeTabId;
    updateTab(tabId, { selectedSql: "", sql: historySql });
    runQuery(tabId, false, historySql);
  }

  async function askAi() {
    const tabId = activeTabId;
    const trimmedPrompt = aiPrompt.trim();
    if (!trimmedPrompt && !activeSql) {
      setAiError("Describe what you need, or select/write a query to fix.");
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const res = await fetch(apiUrl(`/connections/${connection.id}/ai/query`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          sql: activeSql,
          error: activeTab.error ?? "",
          table: selectedTable?.tableName ?? "",
          tableSchema: selectedTable?.tableSchema ?? "",
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAiError(data.error ?? "AI request failed.");
        return;
      }

      if (aiFixSelection && activeTab.selectedSql.trim()) {
        editorRef.current?.replaceSelection(data.sql);
      } else {
        updateTab(tabId, { selectedSql: "", sql: data.sql });
      }
      setAiOpen(false);
      setAiPrompt("");
      setAiFixSelection(false);
    } catch {
      setAiError("AI request failed.");
    } finally {
      setAiLoading(false);
    }
  }

  function openAiForSelection() {
    setAiError(null);
    setAiPrompt("");
    setAiFixSelection(true);
    setAiOpen(true);
  }

  async function handleExport(format: "csv" | "markdown") {
    const trimmed = activeSql;
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
        updateTab(activeTabId, { error: data.error ?? "Export failed." });
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
    const text =
      format === "markdown"
        ? toMarkdownTable(activeTab.columns, activeTab.rows)
        : toJsonRows(activeTab.columns, activeTab.rows);
    await copyToClipboard(text);
    setCopyMenuOpen(false);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function useTable(tableName: string) {
    updateTab(activeTabId, { sql: `SELECT * FROM ${tableName} LIMIT 100;` });
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AnimatePresence>
        {activeTab.confirm && (
          <ConfirmWriteDialog
            isDdl={activeTab.confirm.isDdl}
            onConfirm={() => handleConfirm(activeTabId)}
            onCancel={() => updateTab(activeTabId, { confirm: null })}
          />
        )}
      </AnimatePresence>

      <header
        className="relative flex shrink-0 items-center justify-between border-b border-zinc-200/80 bg-white/80 px-5 py-3 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80"
        style={
          connection.color
            ? {
                backgroundImage: `linear-gradient(${connection.color}14, ${connection.color}14)`,
                borderBottomColor: `${connection.color}59`,
              }
            : undefined
        }
      >
        {connection.color && (
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-0.5"
            style={{ backgroundColor: connection.color }}
          />
        )}
        <div className="flex items-center gap-2.5">
          <button
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" strokeWidth={2.25} />
            ) : (
              <PanelLeftClose className="h-4 w-4" strokeWidth={2.25} />
            )}
          </button>
          <Brand href="/connections" />
          <ChevronRight className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-700" />
          <Link
            href="/connections"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Databases
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-700" />
          <h1 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {connection.color && (
              <span
                className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                style={{ backgroundColor: connection.color }}
                title={connection.color}
              />
            )}
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
        {!sidebarCollapsed && (
        <aside
          ref={asideRef}
          style={{ width: sidebarWidth }}
          className="flex shrink-0 flex-col"
        >
          <nav className="relative flex border-b border-zinc-200 dark:border-zinc-800">
            {PANELS.map(({ key, label, icon: Icon }) => {
              const active = panel === key;
              return (
                <button
                  key={key}
                  onClick={() => setPanel(key)}
                  aria-label={label}
                  className={`group relative flex flex-1 items-center justify-center px-3 py-2.5 transition-colors ${
                    active
                      ? "text-zinc-900 dark:text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={2.25} />
                  <span className="pointer-events-none absolute top-full z-20 mt-1.5 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-md transition-opacity delay-300 duration-100 group-hover:opacity-100 dark:bg-zinc-100 dark:text-zinc-900">
                    {label}
                  </span>
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
                  <TableBrowser
                    connectionId={connection.id}
                    onUseTable={useTable}
                    onSelectTable={setSelectedTable}
                  />
                )}
                {panel === "saved" && (
                  <SavedQueriesPanel
                    connectionId={connection.id}
                    savedQueries={savedQueries}
                    currentSql={activeTab.sql}
                    onLoad={(q) => updateTab(activeTabId, { sql: q })}
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
                {panel === "history" && (
                  <HistoryPanel
                    connectionId={connection.id}
                    history={queryHistory}
                    onLoad={(q) => updateTab(activeTabId, { sql: q })}
                    onRun={runFromHistory}
                    onDeleted={(id) =>
                      setQueryHistory((prev) => prev.filter((h) => h.id !== id))
                    }
                    onCleared={() => setQueryHistory([])}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </aside>
        )}

        {!sidebarCollapsed && (
        <div
          onPointerDown={startSidebarResize}
          onPointerMove={onSidebarResizeMove}
          onPointerUp={stopSidebarResize}
          onPointerCancel={stopSidebarResize}
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize"
          className="relative w-px shrink-0 cursor-col-resize touch-none select-none bg-zinc-200 dark:bg-zinc-800"
        >
          <span
            className={`absolute inset-y-0 -left-1.5 -right-1.5 transition-colors ${
              isResizing ? "bg-indigo-500/15" : "hover:bg-indigo-500/10"
            }`}
          />
          <span
            className={`absolute inset-y-0 left-0 w-px transition-colors ${
              isResizing ? "bg-indigo-500 dark:bg-indigo-400" : ""
            }`}
          />
        </div>
        )}

        <main className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const active = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`group relative flex shrink-0 cursor-pointer items-center gap-1.5 rounded-t-lg border border-b-0 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                      : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                  }`}
                  style={active && tab.color ? { boxShadow: `inset 0 2px 0 0 ${tab.color}` } : undefined}
                >
                  <div
                    className="relative"
                    ref={colorPickerTabId === tab.id ? colorPickerRef : undefined}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setColorPickerTabId(colorPickerTabId === tab.id ? null : tab.id);
                      }}
                      title="Tab color"
                      className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full ring-1 ring-black/10 dark:ring-white/15"
                      style={{ backgroundColor: tab.color ?? "#a1a1aa" }}
                    />

                    <AnimatePresence>
                      {colorPickerTabId === tab.id && (
                        <motion.div
                          initial={{ opacity: 0, y: -4, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.97 }}
                          transition={{ duration: 0.12 }}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute left-0 top-full z-20 mt-1.5 flex w-40 flex-wrap items-center gap-1.5 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <button
                            onClick={() => {
                              updateTab(tab.id, { color: null });
                              setColorPickerTabId(null);
                            }}
                            className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-transparent text-[9px] text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600"
                            style={{
                              backgroundImage:
                                "linear-gradient(45deg, transparent 45%, currentColor 45%, currentColor 55%, transparent 55%)",
                            }}
                            title="No color"
                          />
                          {COLOR_SWATCHES.map((c) => (
                            <button
                              key={c}
                              onClick={() => {
                                updateTab(tab.id, { color: c });
                                setColorPickerTabId(null);
                              }}
                              className={`h-5 w-5 rounded-full border-2 transition-transform ${
                                tab.color === c
                                  ? "border-indigo-500 scale-110"
                                  : "border-transparent hover:scale-105"
                              }`}
                              style={{ backgroundColor: c }}
                              title={c}
                            />
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {tab.running && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}

                  {renamingTabId === tab.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenamingTabId(null);
                      }}
                      className="w-20 rounded border border-indigo-400 bg-transparent px-1 py-0 text-xs outline-none"
                    />
                  ) : (
                    <span onDoubleClick={(e) => { e.stopPropagation(); startRename(tab); }}>
                      {tab.name}
                    </span>
                  )}

                  {tabs.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                      className="rounded p-0.5 opacity-0 transition-opacity hover:bg-zinc-200 group-hover:opacity-100 dark:hover:bg-zinc-800"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
            <button
              onClick={addTab}
              title="New query tab"
              className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="shrink-0">
            <SqlEditor
              key={activeTabId}
              ref={editorRef}
              value={activeTab.sql}
              onChange={(v) => updateTab(activeTabId, { sql: v })}
              driver={connection.driver}
              terms={terms}
              onRun={() => runQuery(activeTabId)}
              onSelectionChange={(s) => updateTab(activeTabId, { selectedSql: s })}
              onAskAiForSelection={openAiForSelection}
              disabled={activeTab.running}
            />
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <button
              onClick={() => runQuery(activeTabId)}
              disabled={activeTab.running}
              className="btn-primary"
            >
              {activeTab.running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" strokeWidth={2.25} fill="currentColor" />
              )}
              {activeTab.running ? "Running…" : runningSelection ? "Run Selection" : "Run"}
              <kbd className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-normal">
                ⌘⏎
              </kbd>
            </button>

            <button
              onClick={() => updateTab(activeTabId, { sql: "" })}
              disabled={activeTab.running || !activeTab.sql}
              className="btn-secondary"
              title="Clear editor"
            >
              <Eraser className="h-3.5 w-3.5" />
              Clear
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

            <div className="relative" ref={aiRef}>
              <button
                onClick={() => {
                  setAiError(null);
                  setAiFixSelection(false);
                  setAiOpen((v) => !v);
                }}
                className="btn-secondary"
                title="Ask AI to write or fix this query"
              >
                <Sparkles className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
                Ask AI
              </button>

              <AnimatePresence>
                {aiOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.12 }}
                    className="absolute left-0 top-full z-20 mt-1.5 w-80 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <p className="mb-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {aiFixSelection && activeTab.selectedSql.trim() ? (
                        "Fixing only the highlighted snippet."
                      ) : (
                        <>
                          {selectedTable
                            ? `Using schema for ${selectedTable.tableName}.`
                            : "Select a table in the Tables panel for richer context."}{" "}
                          {activeTab.error && "Leave blank to fix the current error."}
                        </>
                      )}
                    </p>
                    <textarea
                      autoFocus
                      className="input h-20 w-full resize-none"
                      placeholder={
                        aiFixSelection && activeTab.selectedSql.trim()
                          ? "Optional: instructions for fixing this snippet…"
                          : activeTab.error
                            ? "Optional: extra instructions for the fix…"
                            : "Describe the query you want…"
                      }
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          askAi();
                        }
                      }}
                      disabled={aiLoading}
                    />
                    {aiError && (
                      <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{aiError}</p>
                    )}
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        onClick={() => setAiOpen(false)}
                        className="btn-secondary"
                        disabled={aiLoading}
                      >
                        Cancel
                      </button>
                      <button onClick={askAi} className="btn-primary" disabled={aiLoading}>
                        {aiLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {aiFixSelection || (activeTab.error && !aiPrompt.trim()) ? "Fix" : "Generate"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-800" />

            <button
              onClick={() => handleExport("csv")}
              disabled={exporting || !activeSql}
              className="btn-secondary"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>

            <button
              onClick={() => handleExport("markdown")}
              disabled={exporting || !activeSql}
              className="btn-secondary"
            >
              <FileDown className="h-3.5 w-3.5" />
              Markdown
            </button>

            <div className="relative" ref={copyMenuRef}>
              <button
                onClick={() => setCopyMenuOpen((v) => !v)}
                disabled={activeTab.columns.length === 0}
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
              {activeTab.executionTime !== null && (
                <motion.span
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="ml-auto flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {activeTab.rowCount} row{activeTab.rowCount === 1 ? "" : "s"}
                  <span className="text-zinc-300 dark:text-zinc-600">·</span>
                  {activeTab.executionTime}ms
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {activeTab.error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-start gap-2 overflow-hidden rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="flex-1 font-mono text-xs leading-relaxed">{activeTab.error}</span>
                <button
                  onClick={() => {
                    setAiError(null);
                    setAiPrompt("");
                    setAiFixSelection(false);
                    setAiOpen(true);
                  }}
                  className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-red-700 underline decoration-red-300 transition-colors hover:text-red-900 dark:text-red-300 dark:decoration-red-800 dark:hover:text-red-100"
                >
                  <Sparkles className="h-3 w-3" />
                  Fix with AI
                </button>
              </motion.div>
            )}

            {activeTab.writeSuccess && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {activeTab.writeSuccess}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="min-h-0 flex-1">
            {!activeTab.error && activeTab.columns.length > 0 && (
              <motion.div
                key={activeTab.hasRun ? "results" : "empty"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }}
                className="h-full"
              >
                <ResultsTable columns={activeTab.columns} rows={activeTab.rows} />
              </motion.div>
            )}

            {!activeTab.hasRun && !activeTab.error && (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 py-16 text-center text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
                <Code2 className="h-8 w-8" strokeWidth={1.5} />
                <p className="text-sm">Run a query to see results here.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
