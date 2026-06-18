//! SQLite access layer.
//!
//! Multiple databases can be open at once. Each open connection lives in a
//! registry (`HashMap<u32, OpenDb>`) held in Tauri-managed state behind a
//! `Mutex`, keyed by a connection id handed back to the frontend. All database
//! work funnels through the commands at the bottom of this file so the frontend
//! never touches the filesystem directly.

use rusqlite::limits::Limit;
use rusqlite::types::ValueRef;
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

/// A single open database connection plus the metadata we track for it.
pub struct OpenDb {
    conn: Connection,
    #[allow(dead_code)]
    path: String,
    #[allow(dead_code)]
    read_only: bool,
}

/// Tauri-managed application state: the registry of open connections.
pub struct DbState {
    dbs: Mutex<HashMap<u32, OpenDb>>,
    next_id: AtomicU32,
}

impl Default for DbState {
    fn default() -> Self {
        Self {
            dbs: Mutex::new(HashMap::new()),
            // Start at 1 so a connection id is never 0 (falsy in the JS frontend).
            next_id: AtomicU32::new(1),
        }
    }
}

/// Metadata returned right after opening a database.
#[derive(Serialize)]
pub struct ConnMeta {
    pub id: u32,
    pub path: String,
    pub read_only: bool,
    pub table_count: usize,
}

/// A table or view in the schema.
#[derive(Serialize)]
pub struct TableInfo {
    pub name: String,
    /// "table" or "view".
    pub kind: String,
}

/// A column from `PRAGMA table_info`.
#[derive(Serialize)]
pub struct ColumnInfo {
    pub cid: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub type_name: String,
    pub notnull: bool,
    pub default_value: Option<String>,
    pub pk: bool,
}

/// Result of a query (or a non-query statement's affected-row count).
#[derive(Serialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<JsonValue>>,
    /// Set for statements that don't return rows (INSERT/UPDATE/DELETE/DDL).
    pub rows_affected: Option<usize>,
}

/// Convert a SQLite cell to a JSON value the frontend can render.
fn value_to_json(v: ValueRef) -> JsonValue {
    match v {
        ValueRef::Null => JsonValue::Null,
        ValueRef::Integer(i) => JsonValue::from(i),
        ValueRef::Real(f) => JsonValue::from(f),
        ValueRef::Text(t) => JsonValue::from(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => JsonValue::from(format!("<BLOB {} bytes>", b.len())),
    }
}

/// Quote an identifier (table/column name) by doubling embedded quotes, so it
/// is safe to splice into SQL. SQLite identifiers can't be bound as parameters.
fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// Look up a connection by id and run `f` against it. Centralizes locking
/// (with poison recovery) and the "connection not found" error.
fn with_conn<T>(
    state: &tauri::State<DbState>,
    conn_id: u32,
    f: impl FnOnce(&Connection) -> Result<T, String>,
) -> Result<T, String> {
    let guard = state.dbs.lock().unwrap_or_else(|e| e.into_inner());
    let db = guard.get(&conn_id).ok_or("Connection not found")?;
    f(&db.conn)
}

/// Run a prepared query and collect its columns + rows.
fn collect_rows(conn: &Connection, sql: &str) -> Result<QueryResult, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let columns: Vec<String> = stmt.column_names().iter().map(|c| c.to_string()).collect();
    let col_count = columns.len();

    let mut rows_out: Vec<Vec<JsonValue>> = Vec::new();
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut record = Vec::with_capacity(col_count);
        for i in 0..col_count {
            let v = row.get_ref(i).map_err(|e| e.to_string())?;
            record.push(value_to_json(v));
        }
        rows_out.push(record);
    }

    Ok(QueryResult {
        columns,
        rows: rows_out,
        rows_affected: None,
    })
}

/// Count user tables + views (excludes SQLite internal tables).
fn count_user_tables(conn: &Connection) -> Result<usize, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type IN ('table','view') \
         AND name NOT LIKE 'sqlite_%'",
        [],
        |r| r.get::<_, i64>(0),
    )
    .map(|n| n as usize)
    .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn open_database(
    state: tauri::State<DbState>,
    path: String,
    read_only: bool,
) -> Result<ConnMeta, String> {
    // Read-only opens with SQLITE_OPEN_READ_ONLY; write mode uses READ_WRITE
    // WITHOUT create, so a mistyped/missing path errors instead of silently
    // creating an empty database.
    let flags = if read_only {
        OpenFlags::SQLITE_OPEN_READ_ONLY
    } else {
        OpenFlags::SQLITE_OPEN_READ_WRITE
    };
    let conn = Connection::open_with_flags(&path, flags).map_err(|e| e.to_string())?;

    // SQLITE_OPEN_READ_ONLY only protects the *main* database file: ATTACH would
    // otherwise open another file read-write (and could create one), defeating
    // the "this tab can't change anything on disk" promise. Forbid ATTACH
    // entirely on read-only connections so the guarantee covers the whole
    // connection, not just the opened file.
    if read_only {
        conn.set_limit(Limit::SQLITE_LIMIT_ATTACHED, 0);
    }

    let table_count = count_user_tables(&conn)?;

    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    state.dbs.lock().unwrap_or_else(|e| e.into_inner()).insert(
        id,
        OpenDb {
            conn,
            path: path.clone(),
            read_only,
        },
    );

    Ok(ConnMeta {
        id,
        path,
        read_only,
        table_count,
    })
}

#[tauri::command]
pub fn close_database(state: tauri::State<DbState>, conn_id: u32) -> Result<(), String> {
    state
        .dbs
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&conn_id);
    Ok(())
}

#[tauri::command]
pub fn list_tables(state: tauri::State<DbState>, conn_id: u32) -> Result<Vec<TableInfo>, String> {
    with_conn(&state, conn_id, |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT name, type FROM sqlite_master \
                 WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' \
                 ORDER BY type, name",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(TableInfo {
                    name: row.get(0)?,
                    kind: row.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut tables = Vec::new();
        for t in rows {
            tables.push(t.map_err(|e| e.to_string())?);
        }
        Ok(tables)
    })
}

#[tauri::command]
pub fn get_columns(
    state: tauri::State<DbState>,
    conn_id: u32,
    table: String,
) -> Result<Vec<ColumnInfo>, String> {
    with_conn(&state, conn_id, |conn| {
        let sql = format!("PRAGMA table_info({})", quote_ident(&table));
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(ColumnInfo {
                    cid: row.get(0)?,
                    name: row.get(1)?,
                    type_name: row.get(2)?,
                    notnull: row.get::<_, i64>(3)? != 0,
                    default_value: row.get(4)?,
                    pk: row.get::<_, i64>(5)? != 0,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut cols = Vec::new();
        for c in rows {
            cols.push(c.map_err(|e| e.to_string())?);
        }
        Ok(cols)
    })
}

/// Total row count for a table (used for pagination).
#[tauri::command]
pub fn count_rows(state: tauri::State<DbState>, conn_id: u32, table: String) -> Result<i64, String> {
    with_conn(&state, conn_id, |conn| {
        let sql = format!("SELECT COUNT(*) FROM {}", quote_ident(&table));
        conn.query_row(&sql, [], |r| r.get::<_, i64>(0))
            .map_err(|e| e.to_string())
    })
}

/// A page of rows from a table. Ordered by `rowid` for a stable page sequence;
/// views and WITHOUT ROWID tables have no `rowid`, so those fall back to the
/// engine's (unspecified) natural order.
#[tauri::command]
pub fn get_rows(
    state: tauri::State<DbState>,
    conn_id: u32,
    table: String,
    limit: i64,
    offset: i64,
) -> Result<QueryResult, String> {
    with_conn(&state, conn_id, |conn| {
        let ident = quote_ident(&table);
        let (limit, offset) = (limit.max(0), offset.max(0));

        let ordered = format!("SELECT * FROM {ident} ORDER BY rowid LIMIT {limit} OFFSET {offset}");
        match collect_rows(conn, &ordered) {
            Ok(result) => Ok(result),
            // Only a missing rowid (view / WITHOUT ROWID table) should fall back
            // to unordered; any other error is real and must surface.
            Err(e) if e.contains("rowid") => {
                let plain = format!("SELECT * FROM {ident} LIMIT {limit} OFFSET {offset}");
                collect_rows(conn, &plain)
            }
            Err(e) => Err(e),
        }
    })
}

/// Execute arbitrary SQL. A single row-returning statement (SELECT, row PRAGMA,
/// etc.) yields columns + rows. Anything else is run as a batch so multi-
/// statement scripts (`CREATE …; INSERT …; INSERT …;`) all execute; for those
/// SQLite doesn't report a per-statement affected count, so `rows_affected` is
/// the count for a lone INSERT/UPDATE/DELETE and `None` for a multi-statement
/// batch.
#[tauri::command]
pub fn execute_sql(
    state: tauri::State<DbState>,
    conn_id: u32,
    sql: String,
) -> Result<QueryResult, String> {
    with_conn(&state, conn_id, |conn| {
        let stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let returns_rows = stmt.column_count() > 0;
        drop(stmt);

        if returns_rows {
            return collect_rows(conn, &sql);
        }

        // `execute` runs exactly one statement and reports its affected-row
        // count. It deliberately rejects SQL with trailing statements; when that
        // happens we re-run the whole thing as a batch so scripts aren't
        // silently truncated (a batch has no per-statement count, hence
        // `rows_affected: None`).
        match conn.execute(&sql, []) {
            Ok(affected) => Ok(QueryResult {
                columns: vec![],
                rows: vec![],
                rows_affected: Some(affected),
            }),
            Err(rusqlite::Error::MultipleStatement) => {
                conn.execute_batch(&sql).map_err(|e| e.to_string())?;
                Ok(QueryResult {
                    columns: vec![],
                    rows: vec![],
                    rows_affected: None,
                })
            }
            Err(e) => Err(e.to_string()),
        }
    })
}
