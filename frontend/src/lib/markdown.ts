function mdEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

export function toMarkdownTable(columns: string[], rows: unknown[][]): string {
  if (columns.length === 0) return "";
  const header = `| ${columns.map(mdEscape).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map(mdEscape).join(" | ")} |`);
  return [header, divider, ...body].join("\n");
}

export function toJsonRows(columns: string[], rows: unknown[][]): string {
  const objects = rows.map((row) =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]]))
  );
  return JSON.stringify(objects, null, 2);
}
