import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Copy, Highlighter, X } from "lucide-react";

export interface CellMenuItem {
  label: string;
  icon: "copy" | "highlight" | "clear";
  hint?: string;
  onSelect: () => void;
}

const ICONS = { copy: Copy, highlight: Highlighter, clear: X };

/**
 * Small right-click menu for the results grid. Rendered in a portal at the cursor;
 * closes on Escape, scroll, resize or any click outside it.
 */
export default function ResultCellMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: CellMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: y + height > window.innerHeight - 8 ? Math.max(8, y - height) : y,
    });
    el.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const close = () => onClose();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [onClose]);

  function onMenuKeyDown(e: ReactKeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = Array.from(ref.current?.querySelectorAll("button") ?? []);
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ left: pos.left, top: pos.top }}
      // Keep the grid's document-level mousedown handler from clearing the selection.
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onMenuKeyDown}
      className="fixed z-[60] min-w-44 rounded-lg border border-zinc-200 bg-white p-1 text-xs shadow-lg shadow-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/40"
    >
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => {
              item.onSelect();
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-zinc-700 outline-none transition-colors hover:bg-zinc-100 focus-visible:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800"
          >
            <Icon
              className={`h-3.5 w-3.5 shrink-0 ${item.icon === "highlight" ? "text-yellow-500" : "text-zinc-400"}`}
            />
            <span className="flex-1">{item.label}</span>
            {item.hint && <span className="font-mono text-[10px] text-zinc-400">{item.hint}</span>}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
