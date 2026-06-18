# sliter

A cross-platform **SQLite database editor** built with [Tauri](https://tauri.app/) (Rust) + React.

Targets Windows 11 and Linux (Ubuntu, CachyOS) with self-contained, easy-to-distribute bundles — SQLite is compiled into the binary (`rusqlite` `bundled` feature), so there is no system `libsqlite3` dependency.

## Features

- Open any `.db` / `.sqlite` / `.sqlite3` file via a native file picker
- **Read-only by default** — tick "write mode" to open with write access
- **Open multiple databases at once** — unified sidebar **tree** (DB → tables/views), not tabs
- **Recent files** — the last 10 opened databases are listed on the start screen and persist across restarts
- Browse tables and views in a sidebar, with column counts, row counts, and primary-key info
- Paginated data grid (100 rows/page) for fast browsing of large tables
- SQL query editor with **syntax highlighting** (CodeMirror) — run arbitrary `SELECT` / `INSERT` / `UPDATE` / `DELETE` / DDL (`Ctrl`/`Cmd`+`Enter`)
- Schema changes from the editor refresh the table list automatically

## Documentation

Project definition docs live in [`docs/`](docs/):
[PRD](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [Design](docs/DESIGN.md) · [Decisions (ADR)](docs/DECISIONS.md) · [Roadmap](docs/ROADMAP.md).

## Architecture

- **Backend (`src-tauri/`)** — Rust owns all SQLite access. Multiple connections live in a registry (`Mutex<HashMap<u32, OpenDb>>`) in Tauri-managed state, keyed by a connection id. The frontend never touches the filesystem; it calls Tauri commands (`open_database`, `list_tables`, `get_columns`, `count_rows`, `get_rows`, `execute_sql`, recent-files commands, …) in `src-tauri/src/db.rs` and `src-tauri/src/recents.rs`.
- **Frontend (`src/`)** — React + Vite. `src/api.ts` wraps the IPC commands with types; UI components live in `src/components/`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full IPC command catalog and state model.

## Development

Prerequisites: Node.js, Rust toolchain, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
npm install          # install frontend deps
npm run tauri dev    # run the app (hot-reloads frontend, rebuilds Rust on change)
npm run tauri build  # produce a release bundle for the current OS
```

Rust-only commands (run inside `src-tauri/`):

```bash
cargo check          # type-check the backend
cargo fmt            # format
cargo clippy         # lint
```

## Notes

- SQLite files (`*.db`, `*.sqlite`, `*.sqlite3`) and `.env*` are git-ignored — never commit test databases or secrets.
