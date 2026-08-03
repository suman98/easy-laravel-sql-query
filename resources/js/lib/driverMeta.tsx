import { Database, HardDrive, Leaf } from "lucide-react";
import type { Driver } from "@/lib/clientTypes";

export const DRIVER_META: Record<
  Driver,
  {
    label: string;
    icon: typeof Database;
    badgeClass: string;
    glowClass: string;
  }
> = {
  mysql: {
    label: "MySQL",
    icon: Database,
    badgeClass:
      "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    glowClass: "from-orange-500/20",
  },
  pgsql: {
    label: "PostgreSQL",
    icon: Database,
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    glowClass: "from-blue-500/20",
  },
  sqlite: {
    label: "SQLite",
    icon: HardDrive,
    badgeClass:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    glowClass: "from-emerald-500/20",
  },
  mongodb: {
    label: "MongoDB",
    icon: Leaf,
    badgeClass:
      "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
    glowClass: "from-green-500/20",
  },
};
