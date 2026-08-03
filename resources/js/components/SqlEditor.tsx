import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql, MySQL, PostgreSQL, SQLite } from "@codemirror/lang-sql";
import { javascript } from "@codemirror/lang-javascript";
import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { keymap } from "@codemirror/view";
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
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  driver: Driver;
  terms: AutocompleteTerm[];
  onRun: () => void;
  disabled?: boolean;
}) {
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
      keymap.of([
        {
          key: "Mod-Enter",
          run: () => {
            onRun();
            return true;
          },
        },
      ]),
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
