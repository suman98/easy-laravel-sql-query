import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Loader2, Lock, ShieldCheck } from "lucide-react";
import { DRIVER_META } from "@/lib/driverMeta";
import type { ConnectionRecord, Driver } from "@/lib/clientTypes";
import { apiUrl } from "@/lib/api";

const DEFAULT_PORTS: Record<Driver, number> = { mysql: 3306, pgsql: 5432, sqlite: 0 };
const DRIVERS: Driver[] = ["mysql", "pgsql", "sqlite"];

export default function ConnectionForm({
  existing,
}: {
  existing?: ConnectionRecord;
}) {
  const navigate = useNavigate();
  const [driver, setDriver] = useState<Driver>(existing?.driver ?? "mysql");
  const [name, setName] = useState(existing?.name ?? "");
  const [host, setHost] = useState(existing?.host ?? "localhost");
  const [port, setPort] = useState(
    existing?.port ?? DEFAULT_PORTS[existing?.driver ?? "mysql"]
  );
  const [database, setDatabase] = useState(existing?.database ?? "");
  const [username, setUsername] = useState(existing?.username ?? "");
  const [password, setPassword] = useState("");
  const [ssl, setSsl] = useState(existing?.ssl ?? false);
  const [filePath, setFilePath] = useState(existing?.filePath ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleDriverChange(next: Driver) {
    setDriver(next);
    if (next !== "sqlite") setPort(DEFAULT_PORTS[next]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = {
      name,
      driver,
      host: driver === "sqlite" ? undefined : host,
      port: driver === "sqlite" ? undefined : Number(port),
      database: driver === "sqlite" ? undefined : database,
      username: driver === "sqlite" ? undefined : username,
      password: driver === "sqlite" ? undefined : password,
      ssl: driver === "sqlite" ? false : ssl,
      filePath: driver === "sqlite" ? filePath : undefined,
    };

    try {
      const url = existing ? apiUrl(`/connections/${existing.id}`) : apiUrl("/connections");
      const method = existing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setSubmitting(false);
        return;
      }
      navigate(`/connections/${data.connection.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card animate-slide-up flex max-w-xl flex-col gap-5 p-6">
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2 overflow-hidden rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <Field label="Connection name">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Production DB"
          required
        />
      </Field>

      <Field label="Driver">
        <div className="grid grid-cols-3 gap-2">
          {DRIVERS.map((d) => {
            const meta = DRIVER_META[d];
            const Icon = meta.icon;
            const active = driver === d;
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
        {driver === "sqlite" ? (
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
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
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
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  required
                />
              </Field>
              <Field label="Port" className="w-28">
                <input
                  type="number"
                  className="input"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  required
                />
              </Field>
            </div>

            <Field label="Database name">
              <input
                className="input"
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
                required
              />
            </Field>

            <div className="flex gap-3">
              <Field label="Username" className="flex-1">
                <input
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>
              <Field label="Password" className="flex-1">
                <input
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={existing ? "Leave blank to keep current" : ""}
                />
              </Field>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={ssl}
                onChange={(e) => setSsl(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600"
              />
              <ShieldCheck className="h-4 w-4 text-zinc-400" />
              Use SSL
            </label>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? (
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
        <button type="button" onClick={() => navigate(-1)} className="btn-secondary">
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
