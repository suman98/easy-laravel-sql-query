import { useForm } from "@inertiajs/react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Loader2, Lock, ShieldCheck } from "lucide-react";
import { DRIVER_META } from "@/lib/driverMeta";
import type { ConnectionRecord, Driver } from "@/lib/clientTypes";

const DEFAULT_PORTS: Record<Driver, number> = { mysql: 3306, pgsql: 5432, sqlite: 0, mongodb: 27017 };
const DRIVERS: Driver[] = ["mysql", "pgsql", "sqlite", "mongodb"];

export default function ConnectionForm({
  existing,
}: {
  existing?: ConnectionRecord;
}) {
  const { data, setData, post, put, processing, errors } = useForm({
    name: existing?.name ?? "",
    driver: existing?.driver ?? "mysql",
    host: existing?.host ?? "localhost",
    port: existing?.port ?? DEFAULT_PORTS[existing?.driver ?? "mysql"],
    database: existing?.database ?? "",
    username: existing?.username ?? "",
    password: "",
    ssl: existing?.ssl ?? false,
    filePath: existing?.filePath ?? "",
  });
  const formError = (errors as Record<string, string | undefined>).error;

  function handleDriverChange(next: Driver) {
    setData((prev) => ({
      ...prev,
      driver: next,
      port: next !== "sqlite" ? DEFAULT_PORTS[next] : prev.port,
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (existing) {
      put(`/connections/${existing.id}`);
    } else {
      post("/connections");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card animate-slide-up flex max-w-xl flex-col gap-5 p-6">
      <AnimatePresence>
        {formError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2 overflow-hidden rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <Field label="Connection name">
        <input
          className="input"
          value={data.name}
          onChange={(e) => setData("name", e.target.value)}
          placeholder="Production DB"
          required
        />
      </Field>

      <Field label="Driver">
        <div className="grid grid-cols-4 gap-2">
          {DRIVERS.map((d) => {
            const meta = DRIVER_META[d];
            const Icon = meta.icon;
            const active = data.driver === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => handleDriverChange(d)}
                className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-medium transition-all duration-150 ${
                  active
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-400 dark:bg-indigo-500/10 dark:text-indigo-300"
                    : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
                {meta.label}
              </button>
            );
          })}
        </div>
      </Field>

      <AnimatePresence mode="wait">
        {data.driver === "sqlite" ? (
          <motion.div
            key="sqlite"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            <Field label="Database file path">
              <input
                className="input"
                value={data.filePath}
                onChange={(e) => setData("filePath", e.target.value)}
                placeholder="/path/to/database.sqlite"
                required
              />
            </Field>
          </motion.div>
        ) : (
          <motion.div
            key="network"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-4"
          >
            <div className="flex gap-3">
              <Field label="Host" className="flex-1">
                <input
                  className="input"
                  value={data.host}
                  onChange={(e) => setData("host", e.target.value)}
                  required
                />
              </Field>
              <Field label="Port" className="w-28">
                <input
                  type="number"
                  className="input"
                  value={data.port}
                  onChange={(e) => setData("port", Number(e.target.value))}
                  required
                />
              </Field>
            </div>

            <Field label="Database name">
              <input
                className="input"
                value={data.database}
                onChange={(e) => setData("database", e.target.value)}
                required
              />
            </Field>

            <div className="flex gap-3">
              <Field label="Username" className="flex-1">
                <input
                  className="input"
                  value={data.username}
                  onChange={(e) => setData("username", e.target.value)}
                />
              </Field>
              <Field label="Password" className="flex-1">
                <input
                  type="password"
                  className="input"
                  value={data.password}
                  onChange={(e) => setData("password", e.target.value)}
                  placeholder={existing ? "Leave blank to keep current" : ""}
                />
              </Field>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={data.ssl}
                onChange={(e) => setData("ssl", e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600"
              />
              <ShieldCheck className="h-4 w-4 text-zinc-400" />
              Use SSL
            </label>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <button type="submit" disabled={processing} className="btn-primary">
          {processing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Testing connection…
            </>
          ) : existing ? (
            "Save changes"
          ) : (
            "Create connection"
          )}
        </button>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="btn-secondary"
        >
          Cancel
        </button>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
          <Lock className="h-3.5 w-3.5" />
          Credentials encrypted at rest
        </span>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className}`}>
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {children}
    </label>
  );
}
