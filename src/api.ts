import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export interface ConnMeta {
  id: number;
  path: string;
  read_only: boolean;
  table_count: number;
}

export interface TableInfo {
  name: string;
  /** "table" or "view" */
  kind: string;
}

export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  default_value: string | null;
  pk: boolean;
}

export type Cell = string | number | boolean | null;

export interface QueryResult {
  columns: string[];
  rows: Cell[][];
  /** Set for non-row statements (INSERT/UPDATE/DELETE/DDL). */
  rows_affected: number | null;
}

export interface RecentFile {
  path: string;
  name: string;
  /** Unix epoch milliseconds. */
  last_opened: number;
}

/** Open a native file picker scoped to SQLite extensions. */
export async function pickDatabase(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [
      { name: "SQLite database", extensions: ["db", "sqlite", "sqlite3", "db3"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  return typeof selected === "string" ? selected : null;
}

export const openDatabase = (path: string, readOnly: boolean) =>
  invoke<ConnMeta>("open_database", { path, readOnly });

export const closeDatabase = (connId: number) =>
  invoke<void>("close_database", { connId });

export const listTables = (connId: number) =>
  invoke<TableInfo[]>("list_tables", { connId });

export const getColumns = (connId: number, table: string) =>
  invoke<ColumnInfo[]>("get_columns", { connId, table });

export const countRows = (connId: number, table: string) =>
  invoke<number>("count_rows", { connId, table });

export const getRows = (
  connId: number,
  table: string,
  limit: number,
  offset: number,
) => invoke<QueryResult>("get_rows", { connId, table, limit, offset });

export const executeSql = (connId: number, sql: string) =>
  invoke<QueryResult>("execute_sql", { connId, sql });

// ---- Recent files ----

export const getRecentFiles = () =>
  invoke<RecentFile[]>("get_recent_files");

export const addRecentFile = (path: string) =>
  invoke<RecentFile[]>("add_recent_file", { path });

export const removeRecentFile = (path: string) =>
  invoke<RecentFile[]>("remove_recent_file", { path });
