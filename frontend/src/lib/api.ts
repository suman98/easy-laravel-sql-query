export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
