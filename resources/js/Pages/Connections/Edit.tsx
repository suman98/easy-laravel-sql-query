import { Link } from "@inertiajs/react";
import { ArrowLeft } from "lucide-react";
import Brand from "@/components/Brand";
import ThemeToggle from "@/components/ThemeToggle";
import ConnectionForm from "@/components/ConnectionForm";
import type { ConnectionRecord } from "@/lib/clientTypes";

export default function Edit({ connection }: { connection: ConnectionRecord }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200/80 bg-white/80 px-6 py-3.5 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <Brand />
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
        <div className="animate-slide-up">
          <Link
            href={`/connections/${connection.id}`}
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {connection.name}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Edit connection
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            We&apos;ll test the connection before saving changes.
          </p>
        </div>
        <ConnectionForm existing={connection} />
      </div>
    </div>
  );
}
