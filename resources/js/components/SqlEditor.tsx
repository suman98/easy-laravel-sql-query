import { useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql, MySQL, PostgreSQL, SQLite } from "@codemirror/lang-sql";
import { javascript } from "@codemirror/lang-javascript";
import {
  acceptCompletion,
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { EditorView, keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import type { Driver } from "@/lib/clientTypes";
import type { AutocompleteTerm } from "@/lib/clientTypes";

const SQL_DIALECTS: Partial<Record<Driver, typeof MySQL>> = {
  mysql: MySQL,
  pgsql: PostgreSQL,
  sqlite: SQLite,
};

export default function SqlEditor({
  value,
  onChange,
  driver,
  terms,
  onRun,
  onSelectionChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  driver: Driver;
  terms: AutocompleteTerm[];
  onRun: () => void;
  onSelectionChange?: (selected: string) => void;
  disabled?: boolean;
}) {
  // Extensions are built once per driver/terms, so read the latest callbacks
  // through refs instead of capturing them in the memo.
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  const [selectedLength, setSelectedLength] = useState(0);

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
        {selectedLength > 0 && (
          <span className="ml-auto rounded-full bg-indigo-500/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-indigo-400">
            Selection · {selectedLength} chars
          </span>
        )}
      </div>
      <CodeMirror
        value={value}
        height="260px"
        theme="dark"
        basicSetup={{ autocompletion: false }}
        extensions={extensions}
        onChange={onChange}
        editable={!disabled}
        className="text-sm"
      />
    </div>
  );
}
