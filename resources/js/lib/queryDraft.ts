const DRAFT_PREFIX = "sqlclient:draft:";
const TABS_PREFIX = "sqlclient:tabs:";

export interface QueryTabDraft {
  id: string;
  name: string;
  sql: string;
  color?: string | null;
}

function draftKey(connectionId: number): string {
  return `${DRAFT_PREFIX}${connectionId}`;
}

function tabsKey(connectionId: number): string {
  return `${TABS_PREFIX}${connectionId}`;
}

export function loadQueryTabs(connectionId: number): QueryTabDraft[] | null {
  try {
    const raw = localStorage.getItem(tabsKey(connectionId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }

    // One-time migration from the old single-query draft format.
    const legacy = localStorage.getItem(draftKey(connectionId));
    if (legacy) {
      localStorage.removeItem(draftKey(connectionId));
      return [{ id: "t1", name: "Query 1", sql: legacy }];
    }

    return null;
  } catch {
    return null;
  }
}

export function saveQueryTabs(connectionId: number, tabs: QueryTabDraft[]): void {
  try {
    localStorage.setItem(tabsKey(connectionId), JSON.stringify(tabs));
  } catch {
    // storage unavailable (private mode / quota) — drafts are best-effort
  }
}
