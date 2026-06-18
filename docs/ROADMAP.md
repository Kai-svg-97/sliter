# sliter — Roadmap

Loose backlog of likely next steps. Not commitments; reprioritize freely.

## Near-term
- **Row editing UI** — inline edit / insert / delete rows in the data grid
  (currently done via SQL). Needs primary-key-aware `UPDATE`/`DELETE`.
- **Export / import** — dump a table or query result to CSV/JSON; import CSV.
- **Search & filter** in the data grid (per-column filter, quick find).
- **SQL editor niceties** — table/column auto-complete from the live schema,
  query history, run-selection-only.

## Security hardening
- **Content-Security-Policy** — ship a production CSP (deferred in ADR-007).
  Needs runtime verification that it doesn't break `tauri dev` HMR.
- **`cargo audit` in CI** — catch advisory CVEs against pinned `rusqlite`/`tauri`.

## Medium-term
- **Session/tab restore** on restart (deferred in ADR-006) — reopen prior tabs
  with their read-only state, handling moved/deleted files gracefully.
- **Schema view** — show `CREATE` SQL, indexes, foreign keys per table.
- **BLOB handling** — hex/preview view and export instead of `<BLOB N bytes>`.
- **Create new database** — explicit "New database" flow (write + CREATE).

## Longer-term / maybe
- Visual schema/ERD view.
- Multiple result tabs in the SQL editor.
- Light theme + theme switcher.
- Attached databases (`ATTACH DATABASE`).

## Explicit non-goals
- Networked/remote engines (MySQL, Postgres) — sliter is SQLite-only.
- A full server/daemon mode.
