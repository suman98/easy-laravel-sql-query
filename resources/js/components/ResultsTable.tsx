import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AnimatePresence } from "framer-motion";
// The package's `DataSheetGrid` export is the static variant: it reads `columns` once at mount,
// so later changes (column widths) would be ignored. The dynamic variant follows prop changes.
import { DynamicDataSheetGrid, type CellProps, type Column, type DataSheetGridRef } from "react-datasheet-grid";
import "react-datasheet-grid/dist/style.css";
import { Check, Copy, Eye, KeyRound, Loader2, Lock, Pencil, Search, Trash2, Undo2, X } from "lucide-react";
import JsonViewerDialog from "@/components/JsonViewerDialog";
import ResultCellMenu, { type CellMenuItem } from "@/components/ResultCellMenu";
import UpdatePreviewDialog from "@/components/UpdatePreviewDialog";
import { asJsonValue, jsonSummary, truncate } from "@/lib/jsonCell";
import { apiUrl } from "@/lib/api";
import type { DeleteTarget, EditableInfo } from "@/lib/clientTypes";

const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 32;
const MIN_COL_WIDTH = 48;
const MAX_COL_WIDTH = 1200;
const COPY_HINT = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘C" : "Ctrl+C";

/** One cell value as clipboard text, tab-separated-values safe. */
function clipboardText(value: unknown): string {
  const text = value === null || value === undefined ? "NULL" : editText(value);
  return /[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Older browsers / insecure origins: fall back to a temporary textarea.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

const highlightKey = (rowIndex: number, ci: number) => `${rowIndex}:${ci}`;

const NO_DELETE_TARGETS: DeleteTarget[] = [];

const targetLabel = (t: DeleteTarget) => (t.alias && t.alias !== t.table ? `${t.table} (${t.alias})` : t.table);

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

interface GutterData {
  selectable: boolean;
  checked: ReadonlySet<number>;
  onToggle: (rowIndex: number, visibleIndex: number, shift: boolean) => void;
}

/** Row number gutter. When rows can be deleted it doubles as a checkbox (shift-click selects a range). */
function RowNumber({ rowData, rowIndex, columnData }: CellProps<GridRow, GutterData>) {
  if (!columnData?.selectable) return <span className="rg-gutter">{rowData.index + 1}</span>;
  const on = columnData.checked.has(rowData.index);
  return (
    <label
      className={`rg-gutter rg-gutter-check${on ? " is-checked" : ""}`}
      title="Select row · Shift+click selects a range"
      // Keep the grid from treating this as a row-selection click.
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        columnData.onToggle(rowData.index, rowIndex, e.shiftKey);
      }}
    >
      <input type="checkbox" checked={on} readOnly tabIndex={-1} aria-label={`Select row ${rowData.index + 1}`} />
      <span>{rowData.index + 1}</span>
    </label>
  );
}

function SelectAllCheckbox({ state, onToggle }: { state: "none" | "some" | "all"; onToggle: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return (
    <label
      className="rg-gutter-check rg-gutter-head"
      title={state === "all" ? "Deselect all rows" : "Select all rows"}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
    >
      <input ref={ref} type="checkbox" checked={state === "all"} readOnly tabIndex={-1} aria-label="Select all rows" />
    </label>
  );
}


/** Re-key `${row}:${col}` highlight keys after rows were removed. */
function remapHighlights(prev: Set<string>, map: Map<number, number>): Set<string> {
  const next = new Set<string>();
  for (const key of prev) {
    const [r, c] = key.split(":").map(Number);
    const nr = map.get(r);
    if (nr !== undefined) next.add(`${nr}:${c}`);
  }
  return next;
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
  deleteTargets = NO_DELETE_TARGETS,
  onRowsUpdated,
}: {
  columns: string[];
  rows: unknown[][];
  search: string;
  onSearchChange: (value: string) => void;
  connectionId?: number;
  editable?: EditableInfo | null;
  editReason?: string | null;
  /** Tables whose rows can be deleted from this result (FROM table first). */
  deleteTargets?: DeleteTarget[];
  onRowsUpdated?: (rows: unknown[][], message: string) => void;
}) {
  // A new query always brings a new columns array; saving edits only swaps rows.
  const [trackedColumns, setTrackedColumns] = useState(columns);
  const [viewing, setViewing] = useState<{ column: string; value: unknown } | null>(null);
  const [edits, setEdits] = useState<Edits>({});
  const [preview, setPreview] = useState<{
    kind: "update" | "delete";
    statements: string[];
    running: boolean;
    error: string | null;
    note?: string;
  } | null>(null);
  // Rows ticked in the S.N gutter, by absolute row index.
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteTargetIndex, setDeleteTargetIndex] = useState(0);
  const lastToggleRef = useRef<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  // Bumped per query result so the grid remounts (fresh scroll, selection, widths).
  const [resultVersion, setResultVersion] = useState(0);
  // Column widths the user set by dragging a header border (column index -> px).
  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const [resizingCol, setResizingCol] = useState<number | null>(null);
  const stopResizeRef = useRef<(() => void) | null>(null);
  const gridRef = useRef<DataSheetGridRef>(null);
  // Cells the user highlighted (yellow), keyed by absolute row index + column index.
  const [highlights, setHighlights] = useState<Set<string>>(() => new Set());
  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;
  // Right-click menu: cursor position + the selected range (grid row / column indices).
  const [cellMenu, setCellMenu] = useState<{ x: number; y: number; r1: number; r2: number; c1: number; c2: number } | null>(
    null
  );

  if (columns !== trackedColumns) {
    setTrackedColumns(columns);
    setResultVersion((v) => v + 1);
    setEdits({});
    setPreview(null);
    setEditError(null);
    setColWidths({});
    setHighlights(new Set());
    setCellMenu(null);
    setChecked(new Set());
    lastToggleRef.current = null;
    setDeleteTargetIndex(0);
  }

  useEffect(() => () => stopResizeRef.current?.(), []);

  const startResize = useCallback((ci: number, e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    // preventDefault also suppresses the mousedown the grid would use to select the column.
    e.preventDefault();
    e.stopPropagation();
    stopResizeRef.current?.();

    const cell = e.currentTarget.closest(".dsg-cell");
    const startWidth = cell ? cell.getBoundingClientRect().width : 120;
    const startX = e.clientX;
    let width = startWidth;
    let moved = false;
    let frame = 0;

    const onMove = (ev: PointerEvent) => {
      width = Math.round(Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, startWidth + ev.clientX - startX)));
      moved = moved || Math.abs(ev.clientX - startX) > 1;
      if (!moved || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setColWidths((prev) => ({ ...prev, [ci]: width }));
      });
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      if (moved) setColWidths((prev) => ({ ...prev, [ci]: width }));
      setResizingCol(null);
      document.body.classList.remove("rg-resizing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      stopResizeRef.current = null;
    };

    stopResizeRef.current = stop;
    setResizingCol(ci);
    document.body.classList.add("rg-resizing");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }, []);

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

  const gridValueRef = useRef(gridValue);
  gridValueRef.current = gridValue;

  const toggleRow = useCallback((rowIndex: number, visibleIndex: number, shift: boolean) => {
    const last = lastToggleRef.current;
    setChecked((prev) => {
      const next = new Set(prev);
      const turnOn = !prev.has(rowIndex);
      const [from, to] = shift && last !== null ? [Math.min(last, visibleIndex), Math.max(last, visibleIndex)] : [visibleIndex, visibleIndex];
      for (let v = from; v <= to; v++) {
        const idx = shift && last !== null ? gridValueRef.current[v]?.index : rowIndex;
        if (idx === undefined) continue;
        if (turnOn) next.add(idx);
        else next.delete(idx);
      }
      return next;
    });
    lastToggleRef.current = visibleIndex;
  }, []);

  // Select-all acts on the rows currently visible (respects the filter).
  const visibleChecked = useMemo(() => filteredRows.filter(({ index }) => checked.has(index)).length, [filteredRows, checked]);
  const selectAllState: "none" | "some" | "all" =
    visibleChecked === 0 ? "none" : visibleChecked === filteredRows.length ? "all" : "some";
  const toggleAllRows = useCallback(() => {
    setChecked((prev) => {
      const next = new Set(prev);
      const allOn = filteredRows.length > 0 && filteredRows.every(({ index }) => prev.has(index));
      for (const { index } of filteredRows) {
        if (allOn) next.delete(index);
        else next.add(index);
      }
      return next;
    });
  }, [filteredRows]);

  // Row checkboxes are always available; deleting them additionally needs an editable result.
  const gutterColumn = useMemo(
    () => ({
      component: RowNumber,
      columnData: { selectable: true, checked, onToggle: toggleRow } satisfies GutterData,
      title: <SelectAllCheckbox state={selectAllState} onToggle={toggleAllRows} />,
      basis: 64,
      minWidth: 64,
      grow: 0,
      shrink: 0,
    }),
    [checked, toggleRow, selectAllState, toggleAllRows]
  );

  const [copiedRows, setCopiedRows] = useState(false);
  async function copyCheckedRows() {
    const lines = [columns.map((c) => clipboardText(c)).join("\t")];
    for (const r of [...checked].sort((a, b) => a - b)) {
      // Include unsaved edits so the copy matches what is on screen.
      const row = rows[r].map((cell, ci) => (edits[r] && ci in edits[r] ? edits[r][ci] : cell));
      lines.push(row.map(clipboardText).join("\t"));
    }
    await writeClipboard(lines.join("\n"));
    setCopiedRows(true);
    setTimeout(() => setCopiedRows(false), 1500);
  }

  const checkedRef = useRef(checked);
  checkedRef.current = checked;
  const rowClassName = useCallback(
    ({ rowData }: { rowData: GridRow }) => (checkedRef.current.has(rowData.index) ? "rg-row-checked" : undefined),
    []
  );

  const onView = useCallback((column: string, value: object) => setViewing({ column, value }), []);

  /** Double-click a header border: size the column to its widest value (first 2000 rows). */
  const autoFit = useCallback(
    (ci: number, handle: HTMLElement) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      // Measure with a hidden cell that has the real cell styles, so fonts match exactly.
      const probe = document.createElement("span");
      probe.className = "rg-cell";
      probe.style.cssText = "position:absolute;left:-10000px;top:0;width:auto;visibility:hidden;";
      wrap.appendChild(probe);
      // Header label (scrollWidth is the full width even while it is truncated) + container padding.
      const label = handle.closest(".dsg-cell")?.querySelector<HTMLElement>(".dsg-cell-header-container > span");
      let width = (label?.scrollWidth ?? 0) + 16;
      for (let r = 0; r < Math.min(rows.length, 2000); r++) {
        const value = rows[r][ci];
        const json = asJsonValue(value);
        const { text } = formatCell(value);
        probe.textContent = json ? truncate(text) : text;
        // JSON cells also carry the View button (~54px + gap).
        width = Math.max(width, probe.scrollWidth + (json ? 60 : 0));
      }
      probe.remove();
      const fitted = Math.round(Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, width + 4)));
      setColWidths((prev) => ({ ...prev, [ci]: fitted }));
    },
    [rows]
  );

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

        const fixedWidth = colWidths[ci];

        return {
          id: `c${ci}`,
          title: (
            <>
              <span className="inline-flex items-center gap-1 truncate" title={name}>
                {pkCols.includes(ci) && (
                  <KeyRound className="h-3 w-3 shrink-0 text-amber-500" aria-label="Primary key" />
                )}
                {name}
              </span>
              <span
                role="separator"
                aria-orientation="vertical"
                aria-label={`Resize column ${name}`}
                title="Drag to resize · double-click to fit"
                className={`rg-col-resize${resizingCol === ci ? " is-active" : ""}`}
                onPointerDown={(e) => startResize(ci, e)}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  autoFit(ci, e.currentTarget);
                }}
              />
            </>
          ),
          // A resized column keeps exactly the width the user gave it; the rest still grow to fill.
          basis: fixedWidth ?? columnBasis(name, ci, rows),
          grow: fixedWidth === undefined ? 1 : 0,
          shrink: 0,
          minWidth: fixedWidth === undefined ? 70 : Math.min(fixedWidth, 70),
          component: ResultCell,
          columnData: { ci, column: name, onView },
          disabled: !isEditable,
          keepFocus: false,
          disableKeys: false,
          cellClassName: ({ rowData }) => {
            const dirty = editsRef.current[rowData.index]?.[ci] !== undefined;
            const highlighted = highlightsRef.current.has(highlightKey(rowData.index, ci));
            return [dirty && "rg-dirty", highlighted && "rg-highlight"].filter(Boolean).join(" ") || undefined;
          },
          copyValue: ({ rowData }) => {
            const v = rowData.cells[ci];
            return v === null || v === undefined ? "NULL" : editText(v);
          },
          pasteValue: ({ rowData, value }) => setCell(rowData, value === "NULL" ? null : value),
          deleteValue: ({ rowData }) => setCell(rowData, null),
          isCellEmpty: ({ rowData }) => rowData.cells[ci] === null || rowData.cells[ci] === undefined,
        };
      }),
    [columns, rows, editableCols, pkCols, onView, colWidths, resizingCol, startResize, autoFit]
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

  function openCellMenu(e: ReactMouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    // Keep the browser menu while editing text, and ignore header / empty space.
    if (target.closest(".dsg-input") || !target.closest(".dsg-cell") || target.closest(".dsg-cell-header")) return;
    // The grid already moved its selection on mousedown (or kept it, if the click was inside it).
    const selection = gridRef.current?.selection;
    if (!selection) return;
    e.preventDefault();
    setCellMenu({
      x: e.clientX,
      y: e.clientY,
      r1: Math.min(selection.min.row, selection.max.row),
      r2: Math.min(Math.max(selection.min.row, selection.max.row), gridValue.length - 1),
      c1: Math.min(selection.min.col, selection.max.col),
      c2: Math.min(Math.max(selection.min.col, selection.max.col), columns.length - 1),
    });
  }

  function menuKeys(m: NonNullable<typeof cellMenu>): string[] {
    const keys: string[] = [];
    for (let r = m.r1; r <= m.r2; r++) {
      const gridRow = gridValue[r];
      if (!gridRow) continue;
      for (let c = m.c1; c <= m.c2; c++) keys.push(highlightKey(gridRow.index, c));
    }
    return keys;
  }

  function cellMenuItems(m: NonNullable<typeof cellMenu>): CellMenuItem[] {
    const keys = menuKeys(m);
    const allHighlighted = keys.length > 0 && keys.every((k) => highlights.has(k));
    const count = keys.length;
    const items: CellMenuItem[] = [
      {
        label: count > 1 ? `Copy ${count} cells` : "Copy",
        icon: "copy",
        hint: COPY_HINT,
        onSelect: () => {
          const lines: string[] = [];
          for (let r = m.r1; r <= m.r2; r++) {
            const cells = gridValue[r]?.cells;
            if (!cells) continue;
            const line: string[] = [];
            for (let c = m.c1; c <= m.c2; c++) line.push(clipboardText(cells[c]));
            lines.push(line.join("\t"));
          }
          void writeClipboard(lines.join("\n"));
        },
      },
      {
        label: allHighlighted ? "Remove highlight" : "Highlight",
        icon: "highlight",
        onSelect: () =>
          setHighlights((prev) => {
            const next = new Set(prev);
            for (const k of keys) {
              if (allHighlighted) next.delete(k);
              else next.add(k);
            }
            return next;
          }),
      },
    ];
    if (highlights.size > 0) {
      items.push({ label: "Clear all highlights", icon: "clear", onSelect: () => setHighlights(new Set()) });
    }
    return items;
  }

  const closeCellMenu = useCallback(() => setCellMenu(null), []);

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
      setPreview({ kind: "update", statements: data.statements, running: false, error: null });
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

  const deleteTarget = connectionId !== undefined ? (deleteTargets[deleteTargetIndex] ?? deleteTargets[0] ?? null) : null;

  /** Primary-key object for result row `r` in the delete target, or null if any key value is NULL. */
  function rowKey(target: DeleteTarget, r: number): Record<string, unknown> | null {
    const key: Record<string, unknown> = {};
    for (const { name, index } of target.keyColumns) {
      const value = rows[r]?.[index];
      if (value === null || value === undefined) return null;
      key[name] = value;
    }
    return key;
  }

  /** Keys of the checked rows, deduplicated (a joined result can repeat a row), plus rows without a key. */
  function checkedKeys(target: DeleteTarget) {
    const keys: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    let skipped = 0;
    for (const r of [...checked].sort((a, b) => a - b)) {
      const key = rowKey(target, r);
      if (!key) {
        skipped++;
        continue;
      }
      const fingerprint = JSON.stringify(key);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      keys.push(key);
    }
    return { keys, skipped, fingerprints: seen };
  }

  async function postDelete(target: DeleteTarget, keys: Record<string, unknown>[], dryRun: boolean) {
    const res = await fetch(apiUrl(`/connections/${connectionId}/rows/delete`), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ schema: target.schema, table: target.table, keys, dryRun }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? data.message ?? "Delete failed.");
    return data as { statements: string[]; affected?: number };
  }

  async function openDeletePreview() {
    if (checked.size === 0 || !deleteTarget) return;
    const { keys, skipped } = checkedKeys(deleteTarget);
    const keyNames = deleteTarget.keyColumns.map((k) => k.name).join(", ");
    if (keys.length === 0) {
      setEditError(`The selected rows have no ${targetLabel(deleteTarget)} ${keyNames} (NULL, e.g. no match in a LEFT JOIN).`);
      return;
    }
    setDeleteLoading(true);
    setEditError(null);
    try {
      const data = await postDelete(deleteTarget, keys, true);
      setPreview({
        kind: "delete",
        statements: data.statements,
        running: false,
        error: null,
        note:
          skipped > 0
            ? `${skipped} selected row${skipped === 1 ? " has" : "s have"} no ${keyNames} in ${targetLabel(deleteTarget)} and ${skipped === 1 ? "is" : "are"} skipped.`
            : undefined,
      });
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Could not build delete.");
    } finally {
      setDeleteLoading(false);
    }
  }

  async function applyDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setPreview((p) => (p ? { ...p, running: true, error: null } : p));
    try {
      const { keys, fingerprints } = checkedKeys(target);
      const data = await postDelete(target, keys, false);
      // Drop every result row that pointed at a deleted record (joins can repeat it),
      // then shift row-indexed state (edits, highlights) to the new positions.
      const map = new Map<number, number>();
      const nextRows: unknown[][] = [];
      rows.forEach((row, r) => {
        const key = rowKey(target, r);
        if (key && fingerprints.has(JSON.stringify(key))) return;
        map.set(r, nextRows.length);
        nextRows.push(row);
      });
      setEdits((prev) => {
        const next: Edits = {};
        for (const [r, rowEdits] of Object.entries(prev)) {
          const nr = map.get(Number(r));
          if (nr !== undefined) next[nr] = rowEdits;
        }
        return next;
      });
      setHighlights((prev) => remapHighlights(prev, map));
      setChecked(new Set());
      lastToggleRef.current = null;
      setPreview(null);
      const isJoinedTable = deleteTargets.length > 0 && target !== deleteTargets[0];
      onRowsUpdated?.(
        nextRows,
        `Deleted ${keys.length} row${keys.length === 1 ? "" : "s"} from ${target.table}. ${data.affected ?? 0} row(s) affected.` +
          (isJoinedTable ? " Re-run the query to refresh the joined results." : "")
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Delete failed.";
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
        {checked.size > 0 && (
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="text-[11px] text-zinc-600 dark:text-zinc-300">
              {checked.size} row{checked.size === 1 ? "" : "s"} selected
            </span>
            <button
              onClick={() => {
                setChecked(new Set());
                lastToggleRef.current = null;
              }}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-200/70 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
            <button
              onClick={copyCheckedRows}
              title="Copy selected rows with a header line (tab-separated)"
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-200/70 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              {copiedRows ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              {copiedRows ? "Copied" : "Copy rows"}
            </button>
            {deleteTargets.length > 1 && (
              <select
                id="delete-target"
                value={deleteTargetIndex}
                onChange={(e) => setDeleteTargetIndex(Number(e.target.value))}
                title="Table to delete the selected rows from"
                className="rounded border border-zinc-200 bg-white px-1 py-0.5 text-[11px] text-zinc-700 outline-none focus:border-red-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              >
                {deleteTargets.map((t, i) => (
                  <option key={`${t.table}:${t.alias ?? ""}`} value={i}>
                    from {targetLabel(t)}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={openDeletePreview}
              disabled={deleteLoading || !deleteTarget}
              title={
                deleteTarget
                  ? `Delete the selected rows from ${targetLabel(deleteTarget)} by ${deleteTarget.keyColumns.map((k) => k.name).join(", ")}`
                  : "Can't delete: no table's primary key is in this result. Select the id column (e.g. t.id) to delete rows."
              }
              className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-red-600"
            >
              {deleteLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Delete
            </button>
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

      <div
        ref={wrapRef}
        onContextMenu={openCellMenu}
        className={`results-grid relative min-h-0 flex-1 ${canEdit ? "is-editable" : ""}`}
      >
        {gridValue.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-400 dark:text-zinc-600">No matching rows.</div>
        ) : (
          // No `rowKey`: the library derives row keys from data[index - 1], which
          // yields duplicate keys and stale rows. Index keys are fine since rows are locked.
          <DynamicDataSheetGrid<GridRow>
            ref={gridRef}
            key={resultVersion}
            value={gridValue}
            onChange={handleGridChange}
            columns={gridColumns}
            gutterColumn={gutterColumn}
            rowClassName={rowClassName}
            height={gridHeight}
            rowHeight={ROW_HEIGHT}
            headerRowHeight={HEADER_HEIGHT}
            lockRows
            addRowsComponent={false}
            disableExpandSelection
          />
        )}
      </div>

      {cellMenu && (
        <ResultCellMenu x={cellMenu.x} y={cellMenu.y} items={cellMenuItems(cellMenu)} onClose={closeCellMenu} />
      )}

      <AnimatePresence>
        {viewing && (
          <JsonViewerDialog column={viewing.column} value={viewing.value} onClose={() => setViewing(null)} />
        )}
        {preview && (
          <UpdatePreviewDialog
            kind={preview.kind}
            table={preview.kind === "delete" && deleteTarget ? deleteTarget.table : (editable?.table ?? "")}
            note={preview.note}
            statements={preview.statements}
            running={preview.running}
            error={preview.error}
            onConfirm={preview.kind === "delete" ? applyDelete : applyUpdate}
            onCancel={() => setPreview(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
