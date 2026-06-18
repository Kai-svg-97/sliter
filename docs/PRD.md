# sliter — Product Requirements (PRD)

## Vision
A fast, safe, cross-platform desktop GUI for inspecting and editing SQLite
databases. "Open a file, see your data, run SQL" with zero setup and a
self-contained install on every supported OS.

## Target users
- Developers inspecting app/test databases during development
- Data analysts running ad-hoc SQL against `.sqlite` files
- Anyone who needs a lightweight DB browser without a server or CLI

## Supported platforms
- Windows 11
- Linux — Ubuntu and CachyOS

Distribution is self-contained: SQLite is compiled into the binary
(`rusqlite` `bundled`), so there is no system `libsqlite3` dependency.

## Features

### Implemented
| # | Feature | Notes |
|---|---------|-------|
| 1 | Open SQLite file via native picker | `.db/.sqlite/.sqlite3/.db3` filters |
| 2 | **Read-only by default** | A "write mode" checkbox enables `READ_WRITE` |
| 3 | **Multiple databases open at once** | Tab bar, one connection per tab |
| 4 | **Recent files (up to 10)** | Listed on the start screen, persisted across restarts |
| 5 | Browse tables & views | Sidebar; column count, row count, primary keys |
| 6 | Paginated data grid | 100 rows/page, stable `rowid` ordering |
| 7 | SQL query editor | Arbitrary SQL; multi-statement scripts; `Ctrl/Cmd+Enter` |
| 8 | **SQL syntax highlighting** | CodeMirror 6 — keywords/strings/numbers, line numbers |
| 9 | Reopen a read-only tab in write mode | One click on the tab toolbar |

### Non-goals (for now)
- Row-level inline editing UI (use SQL `UPDATE`/`INSERT` for now)
- Schema designer / visual ERD
- Remote or networked databases (MySQL/Postgres)
- Session/tab restore on restart (recent-files list only — see ROADMAP)

## Safety model
- New databases are **read-only by default**; writing requires an explicit
  opt-in (checkbox), preventing accidental modification of production files.
- Write mode opens with `SQLITE_OPEN_READ_WRITE` **without** `CREATE`, so a
  wrong path errors instead of silently creating an empty database.
- A read-only tab that receives a write returns SQLite's
  `attempt to write a readonly database`, surfaced clearly in the editor.

## Success criteria
- Open any valid SQLite file in < 1s and browse data without freezing the UI
- A user never modifies a file unless they explicitly chose write mode
- Builds produce installable bundles on Windows and Linux from one codebase
