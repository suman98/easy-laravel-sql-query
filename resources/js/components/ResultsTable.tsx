import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { DataSheetGrid, type CellProps, type Column } from "react-datasheet-grid";
import "react-datasheet-grid/dist/style.css";
import { Eye, KeyRound, Loader2, Lock, Pencil, Search, Undo2, X } from "lucide-react";
import JsonViewerDialog from "@/components/JsonViewerDialog";
import UpdatePreviewDialog from "@/components/UpdatePreviewDialog";
import { asJsonValue, jsonSummary, truncate } from "@/lib/jsonCell";
import { apiUrl } from "@/lib/api";
import type { EditableInfo } from "@/lib/clientTypes";

const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 32;

function formatCell(value: unknown): { text: string; isNull: boolean } {
  if (value === null || value === undefined) return { text: "NULL", isNull: true };
  if (typeof value === "object") return { text: JSON.stringify(value), isNull: false };
  return { text: String(value), isNull: false };
}

/** Text shown in the cell editor for a value. */
function editText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function sameAsOriginal(original: unknown, next: unknown): boolean {
  if (next === original) return true;
  if (next === null || next === undefined) return original === null || original === undefined;
  if (original === null || original === undefined) return false;
  return editText(original) === editText(next);
}

/** Pending edits: absolute row index -> column index -> new value (null = SQL NULL). */
type Edits = Record<number, Record<number, string | null>>;

/** One grid row: `index` points back into the original result rows. */
interface GridRow {
  index: number;
  cells: unknown[];
}

interface CellData {
  ci: number;
  column: string;
  onView: (column: string, value: object) => void;
}

/**
 * Cell renderer. Shows the value (NULL / JSON aware) and swaps to a text input
 * while the grid has the cell in edit mode. Commits on blur unless Esc was hit.
 */
const ResultCell = memo(function ResultCell({
  rowData,
  focus,
  setRowData,
  columnData: { ci, column, onView },
}: CellProps<GridRow, CellData>) {
  const value = rowData.cells[ci];
  const inputRef = useRef<HTMLInputElement>(null);
  const escRef = useRef(false);
  const changedRef = useRef(false);
  const latest = useRef({ rowData, setRowData });
  latest.current = { rowData, setRowData };

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!focus || !input) return;
    escRef.current = false;
    changedRef.current = false;
    input.value = editText(latest.current.rowData.cells[ci]);
    input.focus();
    input.select();

    // Runs when the grid leaves edit mode (Enter, Tab, click away, Esc).
    return () => {
      if (escRef.current || !changedRef.current) return;
      const { rowData: current, setRowData: save } = latest.current;
      const cells = [...current.cells];
      cells[ci] = input.value;
      save({ ...current, cells });
    };
  }, [focus, ci]);

  if (focus) {
    return (
      <input
        ref={inputRef}
        tabIndex={-1}
        className="dsg-input font-mono text-xs"
        onChange={() => {
          changedRef.current = true;
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") escRef.current = true;
        }}
      />
    );
  }

  const { text, isNull } = formatCell(value);
  const json = asJsonValue(value);

  if (isNull) {
    return <span className="rg-cell italic text-zinc-400 dark:text-zinc-600">NULL</span>;
  }

  if (json) {
    return (
      <span className="rg-cell rg-json">
        <span className="rg-json-text text-zinc-500 dark:text-zinc-400" title={jsonSummary(json)}>
          {truncate(text)}
        </span>
        <button
          type="button"
          title={`View ${column} as JSON`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onView(column, json);
          }}
          className="rg-json-btn inline-flex items-center gap-1 rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 dark:border-zinc-800 dark:text-indigo-400 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10"
        >
          <Eye className="h-3 w-3" />
          View
        </button>
      </span>
    );
  }

  return (
    <span className="rg-cell truncate text-zinc-800 dark:text-zinc-200" title={text.length > 40 ? text : undefined}>
      {text}
    </span>
  );
});

function RowNumber({ rowData }: CellProps<GridRow>) {
  return <span className="rg-gutter">{rowData.index + 1}</span>;
}

/** Rough column width from header + sample values, so short columns stay compact. */
function columnBasis(name: string, ci: number, rows: unknown[][]): number {
  let longest = name.length + 2;
  for (let r = 0; r < Math.min(rows.length, 50); r++) {
    longest = Math.max(longest, Math.min(formatCell(rows[r][ci]).text.length, 48));
  }
  return Math.min(360, Math.max(90, longest * 7.5 + 24));
}

export default function ResultsTable({
  columns,
  rows,
  search,
  onSearchChange,
  connectionId,
  editable = null,
  editReason = null,
  onRowsUpdated,
}: {
  columns: string[];
  rows: unknown[][];
  search: string;
  onSearchChange: (value: string) => void;
  connectionId?: number;
  editable?: EditableInfo | null;
  editReason?: string | null;
  onRowsUpdated?: (rows: unknown[][], message: string) => void;
}) {
  // A new query always brings a new columns array; saving edits only swaps rows.
  const [trackedColumns, setTrackedColumns] = useState(columns);
  const [viewing, setViewing] = useState<{ column: string; value: unknown } | null>(null);
  const [edits, setEdits] = useState<Edits>({});
  const [preview, setPreview] = useState<{ statements: string[]; running: boolean; error: string | null } | null>(
    null
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  // Bumped per query result so the grid remounts (fresh scroll, selection, widths).
  const [resultVersion, setResultVersion] = useState(0);

  if (columns !== trackedColumns) {
    setTrackedColumns(columns);
    setResultVersion((v) => v + 1);
    setEdits({});
    setPreview(null);
    setEditError(null);
  }

  // The grid needs an explicit pixel height; track the wrapper's size.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [gridHeight, setGridHeight] = useState(400);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setGridHeight(Math.max(120, entry.contentRect.height)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const canEdit = editable !== null && connectionId !== undefined;
  const editableCols = useMemo(() => {
    const set = new Set<number>();
    if (!canEdit || !editable) return set;
    columns.forEach((c, i) => {
      if (editable.columns.includes(c)) set.add(i);
    });
    return set;
  }, [columns, editable, canEdit]);
  const pkCols = useMemo(
    () => (editable ? editable.primaryKey.map((pk) => columns.indexOf(pk)).filter((i) => i >= 0) : []),
    [columns, editable]
  );

  const filteredRows = useMemo(() => {
    const indexed = rows.map((row, index) => ({ row, index }));
    const q = search.trim().toLowerCase();
    if (!q) return indexed;
    return indexed.filter(({ row }) => row.some((cell) => formatCell(cell).text.toLowerCase().includes(q)));
  }, [rows, search]);

  const gridValue = useMemo<GridRow[]>(
    () =>
      filteredRows.map(({ row, index }) => {
        const rowEdits = edits[index];
        if (!rowEdits) return { index, cells: row };
        return { index, cells: row.map((cell, ci) => (ci in rowEdits ? rowEdits[ci] : cell)) };
      }),
    [filteredRows, edits]
  );

  const onView = useCallback((column: string, value: object) => setViewing({ column, value }), []);

  // Kept in a ref so the column definitions don't change on every edit.
  const editsRef = useRef(edits);
  editsRef.current = edits;

  const gridColumns = useMemo<Column<GridRow, CellData>[]>(
    () =>
      columns.map((name, ci) => {
        const isEditable = editableCols.has(ci);
        const setCell = (rowData: GridRow, value: string | null): GridRow => {
          if (!isEditable) return rowData;
          const cells = [...rowData.cells];
          cells[ci] = value;
          return { ...rowData, cells };
        };

        return {
          id: `c${ci}`,
          title: (
            <span className="inline-flex items-center gap-1 truncate" title={name}>
              {pkCols.includes(ci) && <KeyRound className="h-3 w-3 shrink-0 text-amber-500" aria-label="Primary key" />}
              {name}
            </span>
          ),
          basis: columnBasis(name, ci, rows),
          grow: 1,
          shrink: 0,
          minWidth: 70,
          component: ResultCell,
          columnData: { ci, column: name, onView },
          disabled: !isEditable,
          keepFocus: false,
          disableKeys: false,
          cellClassName: ({ rowData }) =>
            editsRef.current[rowData.index]?.[ci] !== undefined ? "rg-dirty" : undefined,
          copyValue: ({ rowData }) => {
            const v = rowData.cells[ci];
            return v === null || v === undefined ? "NULL" : editText(v);
          },
          pasteValue: ({ rowData, value }) => setCell(rowData, value === "NULL" ? null : value),
          deleteValue: ({ rowData }) => setCell(rowData, null),
          isCellEmpty: ({ rowData }) => rowData.cells[ci] === null || rowData.cells[ci] === undefined,
        };
      }),
    [columns, rows, editableCols, pkCols, onView]
  );

  function handleGridChange(next: GridRow[]) {
    setEdits((prev) => {
      const updated: Edits = { ...prev };
      for (const gridRow of next) {
        const original = rows[gridRow.index];
        const rowEdits: Record<number, string | null> = {};
        editableCols.forEach((ci) => {
          const v = gridRow.cells[ci];
          if (!sameAsOriginal(original[ci], v)) rowEdits[ci] = v === null || v === undefined ? null : editText(v);
        });
        if (Object.keys(rowEdits).length > 0) updated[gridRow.index] = rowEdits;
        else delete updated[gridRow.index];
      }
      return updated;
    });
  }

  const editedRowIds = Object.keys(edits).map(Number);
  const editedCellCount = editedRowIds.reduce((n, r) => n + Object.keys(edits[r]).length, 0);

  function buildChanges() {
    return editedRowIds.map((r) => ({
      key: Object.fromEntries(pkCols.map((ci) => [columns[ci], rows[r][ci]])),
      values: Object.fromEntries(Object.entries(edits[r]).map(([ci, v]) => [columns[Number(ci)], v])),
    }));
  }

  async function postUpdate(dryRun: boolean) {
    const res = await fetch(apiUrl(`/connections/${connectionId}/rows/update`), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        schema: editable?.schema ?? null,
        table: editable?.table,
        changes: buildChanges(),
        dryRun,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? data.message ?? "Update failed.");
    return data as { statements: string[]; affected?: number };
  }

  async function openPreview() {
    if (editedRowIds.length === 0) return;
    setPreviewLoading(true);
    setEditError(null);
    try {
      const data = await postUpdate(true);
      setPreview({ statements: data.statements, running: false, error: null });
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Could not build update.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function applyUpdate() {
    setPreview((p) => (p ? { ...p, running: true, error: null } : p));
    try {
      const data = await postUpdate(false);
      const nextRows = rows.map((row, r) =>
        edits[r] ? row.map((cell, c) => (c in edits[r] ? edits[r][c] : cell)) : row
      );
      const count = editedRowIds.length;
      setEdits({});
      setPreview(null);
      onRowsUpdated?.(
        nextRows,
        `Updated ${count} row${count === 1 ? "" : "s"} in ${editable?.table}. ${data.affected ?? 0} row(s) affected.`
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Update failed.";
      setPreview((p) => (p ? { ...p, running: false, error: message } : p));
    }
  }

  if (columns.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        No columns returned.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-zinc-200 shadow-sm dark:border-zinc-800">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 bg-zinc-50/60 px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/60">
        <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter results…"
          className="w-full min-w-0 bg-transparent text-xs text-zinc-700 outline-none placeholder:text-zinc-400 dark:text-zinc-200"
        />
        {search && (
          <button
            onClick={() => onSearchChange("")}
            className="shrink-0 rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {canEdit && editedCellCount === 0 && (
          <span
            className="flex shrink-0 items-center gap-1 rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
            title="Double-click or type to edit a cell. Delete sets NULL. Paste works across cells."
          >
            <Pencil className="h-3 w-3" />
            Editable · {editable?.table}
          </span>
        )}
        {!canEdit && editReason && (
          <span className="shrink-0 text-zinc-400 dark:text-zinc-600" title={`Read-only: ${editReason}`}>
            <Lock className="h-3.5 w-3.5" />
          </span>
        )}
        {editedCellCount > 0 && (
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="text-[11px] text-amber-600 dark:text-amber-400">
              {editedCellCount} change{editedCellCount === 1 ? "" : "s"} · {editedRowIds.length} row
              {editedRowIds.length === 1 ? "" : "s"}
            </span>
            <button
              onClick={() => {
                setEdits({});
                setEditError(null);
              }}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-200/70 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <Undo2 className="h-3 w-3" />
              Discard
            </button>
            <button
              onClick={openPreview}
              disabled={previewLoading}
              className="inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-60"
            >
              {previewLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
              Update
            </button>
          </span>
        )}
        <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
          {search ? `${filteredRows.length} / ${rows.length}` : `${rows.length}`}
        </span>
      </div>

      {editError && (
        <div className="flex shrink-0 items-center gap-2 border-b border-red-200 bg-red-50 px-3 py-1.5 font-mono text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300">
          <span className="flex-1">{editError}</span>
          <button
            onClick={() => setEditError(null)}
            className="shrink-0 rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-900/40"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div ref={wrapRef} className={`results-grid relative min-h-0 flex-1 ${canEdit ? "is-editable" : ""}`}>
        {gridValue.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-400 dark:text-zinc-600">No matching rows.</div>
        ) : (
          // No `rowKey`: the library derives row keys from data[index - 1], which
          // yields duplicate keys and stale rows. Index keys are fine since rows are locked.
          <DataSheetGrid<GridRow>
            key={resultVersion}
            value={gridValue}
            onChange={handleGridChange}
            columns={gridColumns}
            gutterColumn={{ component: RowNumber, basis: 48, minWidth: 48, grow: 0, shrink: 0 }}
            height={gridHeight}
            rowHeight={ROW_HEIGHT}
            headerRowHeight={HEADER_HEIGHT}
            lockRows
            addRowsComponent={false}
            disableExpandSelection
          />
        )}
      </div>

      <AnimatePresence>
        {viewing && (
          <JsonViewerDialog column={viewing.column} value={viewing.value} onClose={() => setViewing(null)} />
        )}
        {preview && (
          <UpdatePreviewDialog
            table={editable?.table ?? ""}
            statements={preview.statements}
            running={preview.running}
            error={preview.error}
            onConfirm={applyUpdate}
            onCancel={() => setPreview(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
