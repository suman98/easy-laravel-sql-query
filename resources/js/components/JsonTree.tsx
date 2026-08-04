import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

function Scalar({ value }: { value: unknown }) {
  if (value === null) return <span className="italic text-zinc-400 dark:text-zinc-600">null</span>;
  if (value === undefined)
    return <span className="italic text-zinc-400 dark:text-zinc-600">undefined</span>;

  switch (typeof value) {
    case "string":
      return <span className="text-emerald-600 dark:text-emerald-400">"{value}"</span>;
    case "number":
      return <span className="text-amber-600 dark:text-amber-400">{String(value)}</span>;
    case "boolean":
      return <span className="text-purple-600 dark:text-purple-400">{String(value)}</span>;
    default:
      return <span className="text-zinc-700 dark:text-zinc-300">{String(value)}</span>;
  }
}

function entriesOf(value: object): [string, unknown][] {
  return Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value);
}

function Node({
  label,
  value,
  depth,
  defaultExpanded,
}: {
  label: string | null;
  value: unknown;
  depth: number;
  defaultExpanded: boolean;
}) {
  // Deep levels stay collapsed by default so a large document opens readable.
  const [expanded, setExpanded] = useState(defaultExpanded || depth < 1);

  const isBranch = typeof value === "object" && value !== null;

  if (!isBranch) {
    return (
      <div className="flex gap-1.5 py-0.5 pl-4.5">
        {label !== null && <span className="text-sky-700 dark:text-sky-300">{label}:</span>}
        <Scalar value={value} />
      </div>
    );
  }

  const entries = entriesOf(value as object);
  const isArray = Array.isArray(value);
  const open = isArray ? "[" : "{";
  const close = isArray ? "]" : "}";

  return (
    <div className="py-0.5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1 rounded text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-zinc-400" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-zinc-400" />
        )}
        {label !== null && <span className="text-sky-700 dark:text-sky-300">{label}:</span>}
        <span className="text-zinc-400 dark:text-zinc-500">
          {expanded ? open : `${open}${close}`}
        </span>
        {!expanded && (
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
            {entries.length} {entries.length === 1 ? (isArray ? "item" : "key") : isArray ? "items" : "keys"}
          </span>
        )}
      </button>

      {expanded && (
        <>
          <div className="ml-1.5 border-l border-zinc-200 pl-3 dark:border-zinc-800">
            {entries.length === 0 ? (
              <div className="py-0.5 pl-4.5 italic text-zinc-400 dark:text-zinc-600">empty</div>
            ) : (
              entries.map(([k, v]) => (
                <Node
                  key={k}
                  label={k}
                  value={v}
                  depth={depth + 1}
                  defaultExpanded={defaultExpanded}
                />
              ))
            )}
          </div>
          <div className="pl-4 text-zinc-400 dark:text-zinc-500">{close}</div>
        </>
      )}
    </div>
  );
}

export default function JsonTree({
  value,
  expandAll,
}: {
  value: unknown;
  expandAll: boolean;
}) {
  return (
    <div className="font-mono text-xs leading-relaxed">
      {/* Remounting on expandAll resets every nested node's local state. */}
      <Node
        key={expandAll ? "expanded" : "collapsed"}
        label={null}
        value={value}
        depth={0}
        defaultExpanded={expandAll}
      />
    </div>
  );
}
