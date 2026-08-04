/**
 * Cells arrive either already decoded (Mongo documents, driver-native JSON) or
 * as raw strings from JSON/JSONB columns. Only objects and arrays count as
 * "JSON" here — a bare number or quoted string is fine to show inline.
 */
export function asJsonValue(value: unknown): object | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "object") return value as object;

  if (typeof value === "string") {
    const trimmed = value.trim();
    const looksJson =
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"));
    if (!looksJson) return null;

    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "object" && parsed !== null ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}

export function jsonSummary(value: object): string {
  if (Array.isArray(value)) {
    return `[…] ${value.length} ${value.length === 1 ? "item" : "items"}`;
  }
  const keys = Object.keys(value);
  return `{…} ${keys.length} ${keys.length === 1 ? "key" : "keys"}`;
}

export function truncate(text: string, max = 48): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
