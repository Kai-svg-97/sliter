# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

**sliter** is a cross-platform SQLite GUI built as a **Tauri 2 desktop app**: a Rust backend in `src-tauri/` + a React 19 / TypeScript / Vite frontend in `src/`. It is implemented (not a scaffold): open multiple SQLite databases in tabs, read-only by default with an opt-in write mode, recent-files list, table/data browser, and a CodeMirror SQL editor.

## Definition docs

Keep these updated when behavior changes — they are the source of truth for product/design intent:

- `docs/PRD.md` — product requirements, supported platforms, safety model, non-goals
- `docs/ARCHITECTURE.md` — stack, process model, **IPC command catalog**, state model
- `docs/DESIGN.md` — UI/UX layout, color tokens, shortcuts
- `docs/DECISIONS.md` — ADRs (bundled rusqlite, multi-connection registry, CodeMirror, read-only default)
- `docs/ROADMAP.md` — backlog and explicit non-goals

## Code map

- `src-tauri/src/db.rs` — SQLite access + connection registry (`Mutex<HashMap<u32, OpenDb>>`, ids from 1). Every data command takes a `conn_id` and routes through the `with_conn` helper. Identifier safety via `quote_ident`; pagination via `get_rows` (rowid order + fallback); `execute_sql` handles single statements and multi-statement batches.
- `src-tauri/src/recents.rs` — recent-files persistence (`<app_config_dir>/recent_files.json`, cap 10).
- `src-tauri/src/lib.rs` — Tauri builder, plugin + command registration, managed `DbState`.
- `src/api.ts` — typed IPC wrappers (one per backend command). Keep in sync with the Rust commands.
- `src/App.tsx` — connection/selection orchestration, recents, write-mode toggle, content sub-tabs.
- `src/components/` — `StartScreen`, `DbTree` (unified sidebar tree of all open DBs → tables/views), `TableBrowser`, `SqlEditor` (CodeMirror; one kept mounted per connection), `DataGrid`.

## Commands

- `npm install` — install frontend dependencies
- `npm run tauri dev` — run the app in development (hot-reloads frontend, rebuilds Rust on change)
- `npm run tauri build` — produce a release bundle
- `npm run build` — frontend type-check + Vite build (fast verification)
- `cargo check` / `cargo clippy` / `cargo fmt` (in `src-tauri/`) — type-check, lint, format Rust
- `cargo test` (in `src-tauri/`) — run Rust tests; `cargo test <name>` for a single test

## Notes

- SQLite files (`*.db`, `*.sqlite`, `*.sqlite3`) and `.env*` are git-ignored — never commit test databases or secrets. A local `sample.db` is used for manual testing.
- The frontend never touches the filesystem; SQLite access lives entirely in Rust (`src-tauri/`), with the frontend invoking IPC commands. Maintain this boundary.
- When adding/changing a backend command, update both `src/api.ts` and the IPC catalog in `docs/ARCHITECTURE.md`.
