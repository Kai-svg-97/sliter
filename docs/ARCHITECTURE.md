# sliter — Architecture

## Stack
- **Backend:** Rust + [Tauri 2](https://tauri.app/), SQLite via
  [`rusqlite`](https://docs.rs/rusqlite) with the `bundled` feature.
- **Frontend:** React 19 + TypeScript + Vite 7.
- **Editor:** CodeMirror 6 (`@uiw/react-codemirror`, `@codemirror/lang-sql`).

## Process model
Two processes communicate over Tauri IPC:

```
┌─────────────────────────┐        invoke(cmd, args)        ┌────────────────────────┐
│  Frontend (WebView)     │  ───────────────────────────▶   │  Backend (Rust)         │
│  React UI, src/         │                                 │  src-tauri/src/         │
│  - no filesystem access │  ◀───────────────────────────   │  - owns all SQLite I/O  │
└─────────────────────────┘        Result<T, String>        └────────────────────────┘
```

The frontend never touches the filesystem directly (except the native file
picker dialog). All SQLite access lives in Rust.

## Backend modules (`src-tauri/src/`)
- **`db.rs`** — SQLite access layer + connection registry.
- **`recents.rs`** — recent-files persistence (JSON in app config dir).
- **`lib.rs`** — Tauri builder: plugins, managed state, command registration.
- **`main.rs`** — binary entry (`sliter_lib::run()`).

## State model
### Connection registry (`db.rs`)
Multiple databases are open simultaneously. State is a registry behind a mutex:

```rust
struct OpenDb   { conn: Connection, path: String, read_only: bool }
struct DbState  { dbs: Mutex<HashMap<u32, OpenDb>>, next_id: AtomicU32 } // ids start at 1
```

Each `open_database` allocates a `u32` id (returned to the frontend as the tab
key) and inserts an `OpenDb`. Every data command takes a `conn_id` and is routed
through the `with_conn` helper, which locks (with poison recovery), looks up the
connection, and runs a closure against it. `close_database` removes the entry.

### Recent files (`recents.rs`)
Stored at `<app_config_dir>/recent_files.json` (`com.kai.sliter`), most-recent
first, capped at 10. `add_recent_file` dedupes by path and re-stamps
`last_opened` (unix ms).

## IPC command catalog
| Command | Args | Returns | Purpose |
|---------|------|---------|---------|
| `open_database` | `path, readOnly` | `ConnMeta {id, path, read_only, table_count}` | Open a DB, get a connection id |
| `close_database` | `connId` | `()` | Close & drop a connection |
| `list_tables` | `connId` | `TableInfo[] {name, kind}` | Tables + views |
| `get_columns` | `connId, table` | `ColumnInfo[]` | `PRAGMA table_info` |
| `count_rows` | `connId, table` | `i64` | Row count for pagination |
| `get_rows` | `connId, table, limit, offset` | `QueryResult` | One page (ordered by rowid, fallback) |
| `execute_sql` | `connId, sql` | `QueryResult` | Arbitrary SQL / multi-statement batch |
| `get_recent_files` | – | `RecentFile[]` | Load recents |
| `add_recent_file` | `path` | `RecentFile[]` | Record an open, return updated list |
| `remove_recent_file` | `path` | `RecentFile[]` | Drop an entry, return updated list |

Typed wrappers for all of these live in `src/api.ts`.

## Data-flow notes
- **Identifier safety:** table/column names are quoted via `quote_ident`
  (double-quote escaping); `LIMIT`/`OFFSET` are clamped `i64`. `execute_sql` is
  an intentional SQL console.
- **Query vs statement:** `execute_sql` prepares the SQL, runs row-returning
  statements through `collect_rows`; non-row statements go to `execute`, falling
  back to `execute_batch` for multi-statement scripts (`Error::MultipleStatement`).
- **Pagination order:** `get_rows` uses `ORDER BY rowid`; views / WITHOUT ROWID
  tables have no rowid and fall back to natural order.
- **Read-only enforcement** is delegated to SQLite via `OpenFlags`; write
  attempts on a read-only connection return a clear error.

## Build & distribution
- Dev: `npm run tauri dev`. Release: `npm run tauri build`.
- `rusqlite` `bundled` compiles SQLite from source → no system libsqlite3,
  keeping Windows/Linux bundles self-contained.
- Frontend bundles into a single chunk (CodeMirror is large but local;
  `chunkSizeWarningLimit` raised in `vite.config.ts`).
