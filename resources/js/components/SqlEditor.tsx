import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { sql, MySQL, PostgreSQL, SQLite } from "@codemirror/lang-sql";
import { javascript } from "@codemirror/lang-javascript";
import { format as formatSql, type SqlLanguage } from "sql-formatter";
import {
  acceptCompletion,
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { EditorView, keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { AlignLeft } from "lucide-react";
import type { Driver } from "@/lib/clientTypes";
import type { AutocompleteTerm } from "@/lib/clientTypes";

const SQL_DIALECTS: Partial<Record<Driver, typeof MySQL>> = {
  mysql: MySQL,
  pgsql: PostgreSQL,
  sqlite: SQLite,
};

const SQL_FORMAT_DIALECTS: Partial<Record<Driver, SqlLanguage>> = {
  mysql: "mysql",
  pgsql: "postgresql",
  sqlite: "sqlite",
};

const HEIGHT_STORAGE_KEY = "sqlEditor.height";
const DEFAULT_HEIGHT = 260;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 720;
const KEYBOARD_STEP = 20;

const clampHeight = (h: number) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h));

const readStoredHeight = (): number => {
  try {
    const raw = window.localStorage.getItem(HEIGHT_STORAGE_KEY);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? clampHeight(parsed) : DEFAULT_HEIGHT;
  } catch {
    return DEFAULT_HEIGHT;
  }
};

const storeHeight = (h: number) => {
  try {
    window.localStorage.setItem(HEIGHT_STORAGE_KEY, String(h));
  } catch {
    // storage unavailable (private mode, quota) — height just won't persist
  }
};

export interface SqlEditorHandle {
  /** Replaces the current selection (if any) with `text`. */
  replaceSelection: (text: string) => void;
}

const SqlEditor = forwardRef<
  SqlEditorHandle,
  {
    value: string;
    onChange: (v: string) => void;
    driver: Driver;
    terms: AutocompleteTerm[];
    onRun: () => void;
    onSelectionChange?: (selected: string) => void;
    /** Ctrl/Cmd-K with a non-empty selection: ask AI to fix just that selection. */
    onAskAiForSelection?: () => void;
    disabled?: boolean;
  }
>(function SqlEditor(
  { value, onChange, driver, terms, onRun, onSelectionChange, onAskAiForSelection, disabled },
  ref
) {
  // Extensions are built once per driver/terms, so read the latest callbacks
  // through refs instead of capturing them in the memo.
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onAskAiForSelectionRef = useRef(onAskAiForSelection);
  onAskAiForSelectionRef.current = onAskAiForSelection;

  const cmRef = useRef<ReactCodeMirrorRef>(null);

  useImperativeHandle(
    ref,
    () => ({
      replaceSelection(text: string) {
        const view = cmRef.current?.view;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
        view.focus();
      },
    }),
    []
  );

  const [selectedLength, setSelectedLength] = useState(0);

  const [height, setHeight] = useState(readStoredHeight);
  const [resizing, setResizing] = useState(false);
  const heightRef = useRef(height);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const updateHeight = (next: number) => {
    const clamped = clampHeight(next);
    heightRef.current = clamped;
    setHeight(clamped);
  };

  // Keep the cursor and disable text selection page-wide while dragging; the
  // cleanup also restores them if the editor unmounts mid-drag.
  useEffect(() => {
    if (!resizing) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [resizing]);

  const onResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    // Capture so move/up keep firing here even when the cursor leaves the handle.
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startHeight: heightRef.current };
    setResizing(true);
  };

  const onResizePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    updateHeight(drag.startHeight + (e.clientY - drag.startY));
  };

  const endResize = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setResizing(false);
    storeHeight(heightRef.current);
  };

  const onResizeKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    updateHeight(heightRef.current + (e.key === "ArrowDown" ? KEYBOARD_STEP : -KEYBOARD_STEP));
    storeHeight(heightRef.current);
  };

  const formatDialect = SQL_FORMAT_DIALECTS[driver];

  const formatDoc = () => {
    if (!formatDialect) return;
    const view = cmRef.current?.view;
    if (!view) return;
    try {
      const formatted = formatSql(view.state.doc.toString(), {
        language: formatDialect,
        keywordCase: "upper",
      });
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: formatted },
      });
    } catch {
      // leave the document untouched if it can't be parsed
    }
  };

  const extensions = useMemo(() => {
    const source = (context: CompletionContext): CompletionResult | null => {
      const word = context.matchBefore(/[\w]*/);
      if (!word || (word.from === word.to && !context.explicit)) return null;
      return {
        from: word.from,
        options: terms.map((t) => ({
          label: t.value,
          type: t.type === "keyword" ? "keyword" : t.type === "table" ? "class" : "property",
          detail: t.type,
          boost: t.type === "keyword" ? 0 : 1,
        })),
      };
    };

    return [
      driver === "mongodb"
        ? javascript()
        : sql({ dialect: SQL_DIALECTS[driver], upperCaseKeywords: true }),
      autocompletion({ override: [source] }),
      EditorView.updateListener.of((update) => {
        if (!update.selectionSet && !update.docChanged) return;
        const { state } = update;
        const selected = state.selection.ranges
          .filter((r) => !r.empty)
          .map((r) => state.sliceDoc(r.from, r.to))
          .join("\n");
        onSelectionChangeRef.current?.(selected);
        setSelectedLength(selected.trim().length);
      }),
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              onRunRef.current();
              return true;
            },
          },
          {
            key: "Tab",
            run: acceptCompletion,
          },
          {
            key: "Mod-k",
            run: (view) => {
              if (view.state.selection.main.empty) return false;
              onAskAiForSelectionRef.current?.();
              return true;
            },
          },
          {
            key: "Shift-Alt-f",
            run: () => {
              formatDoc();
              return true;
            },
          },
        ]),
      ),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver, terms]);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 shadow-sm ring-1 ring-transparent transition-all duration-200 focus-within:border-indigo-500/60 focus-within:ring-indigo-500/20">
      <div className="flex items-center gap-1.5 border-b border-zinc-800 bg-zinc-900 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          {driver === "mongodb" ? "mongo.js" : `${driver}.sql`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {formatDialect && (
            <button
              type="button"
              onClick={formatDoc}
              disabled={disabled || !value.trim()}
              title="Format SQL (Shift-Alt-F)"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <AlignLeft className="h-3 w-3" />
              Format
            </button>
          )}
          {selectedLength > 0 && (
            <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-indigo-400">
              Selection · {selectedLength} chars
            </span>
          )}
        </div>
      </div>
      <CodeMirror
        ref={cmRef}
        value={value}
        height={`${height}px`}
        theme="dark"
        basicSetup={{ autocompletion: false }}
        extensions={extensions}
        onChange={onChange}
        editable={!disabled}
        className="text-sm"
      />
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize editor"
        aria-valuemin={MIN_HEIGHT}
        aria-valuemax={MAX_HEIGHT}
        aria-valuenow={height}
        tabIndex={0}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onKeyDown={onResizeKeyDown}
        title="Drag to resize"
        className={`group flex h-2.5 cursor-ns-resize touch-none items-center justify-center border-t border-zinc-800 bg-zinc-900 outline-none transition-colors hover:bg-zinc-800 focus-visible:bg-zinc-800 ${
          resizing ? "bg-zinc-800" : ""
        }`}
      >
        <span
          className={`h-0.5 w-8 rounded-full transition-colors group-hover:bg-indigo-400/70 group-focus-visible:bg-indigo-400/70 ${
            resizing ? "bg-indigo-400/70" : "bg-zinc-600"
          }`}
        />
      </div>
    </div>
  );
});

export default SqlEditor;
