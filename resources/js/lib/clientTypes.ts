export type Driver = "mysql" | "pgsql" | "sqlite" | "mongodb";

export interface ConnectionRecord {
  id: number;
  name: string;
  driver: Driver;
  host: string | null;
  port: number | null;
  database: string | null;
  username: string | null;
  ssl: boolean;
  filePath: string | null;
  color: string | null;
  position: number;
  created_at: string;
}

export interface TableInfo {
  tableSchema: string;
  tableName: string;
  tableKey: string;
  sizeBytes: number;
  sizeHuman: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: string;
  default: string | null;
}

export interface IndexInfo {
  name: string;
  definition: string;
}

export interface TableSchema {
  columns: ColumnInfo[];
  indexes: IndexInfo[];
}

export interface SavedQueryRecord {
  id: number;
  connection_id: number;
  name: string;
  description: string | null;
  query: string;
  created_at: string;
}

export interface QueryHistoryRecord {
  id: number;
  connection_id: number;
  sql: string;
  is_write: boolean;
  success: boolean;
  error: string | null;
  row_count: number | null;
  execution_time: number | null;
  created_at: string;
}

export interface AutocompleteTerm {
  value: string;
  type: "keyword" | "table" | "column";
}

export interface QueryRunResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  executionTime: number;
  isWriteQuery: boolean;
}

export interface QueryNeedsConfirm {
  needsConfirm: true;
  isWriteQuery: true;
  isDdl: boolean;
}
