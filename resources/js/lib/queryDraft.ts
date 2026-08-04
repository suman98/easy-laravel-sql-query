const DRAFT_PREFIX = "sqlclient:draft:";

function draftKey(connectionId: number): string {
  return `${DRAFT_PREFIX}${connectionId}`;
}

export function loadQueryDraft(connectionId: number): string {
  try {
    return localStorage.getItem(draftKey(connectionId)) ?? "";
  } catch {
    return "";
  }
}

export function saveQueryDraft(connectionId: number, sql: string): void {
  try {
    if (sql.trim()) {
      localStorage.setItem(draftKey(connectionId), sql);
    } else {
      localStorage.removeItem(draftKey(connectionId));
    }
  } catch {
    // storage unavailable (private mode / quota) — drafts are best-effort
  }
}
