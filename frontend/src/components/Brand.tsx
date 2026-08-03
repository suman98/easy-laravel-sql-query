import { Link } from "react-router-dom";
import { TerminalSquare } from "lucide-react";

export default function Brand({ href = "/connections" }: { href?: string }) {
  return (
    <Link to={href} className="group flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-indigo-500 to-violet-600 text-white shadow-sm shadow-indigo-500/30 transition-transform duration-200 group-hover:scale-105">
        <TerminalSquare className="h-4.5 w-4.5" strokeWidth={2.25} />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        SQL Query
      </span>
    </Link>
  );
}
