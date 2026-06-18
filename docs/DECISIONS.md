# sliter — Decision Log (ADR)

Short architecture decision records. Newest first.

## ADR-009 — Multiple databases shown as a tree, not tabs
**Decision:** Replace the per-database top tab bar with a single sidebar **tree**
(`DbTree`): each open DB is a root node containing `tables`/`views` groups and
leaf tables/views. The content area keeps the Browse Data / SQL Query sub-tabs,
driven by the tree selection (active database for SQL).
**Why:** With several databases open, a tree shows all schemas at once and scales
better than a row of tabs; it matches how users think about "files → tables".
SQL editors stay mounted per connection (`display` toggle) so query text is
preserved per database. `DbWorkspace` (the old per-tab sidebar+content) was
removed; the sidebar tree + a shared content area replace it. Backend unchanged —
the tree just regroups existing `list_tables` data by `kind`.

## ADR-008 — Read-only connections forbid ATTACH
**Decision:** On a read-only connection, set `SQLITE_LIMIT_ATTACHED = 0`.
**Why:** `SQLITE_OPEN_READ_ONLY` only protects the *main* database file; a plain
`ATTACH DATABASE 'other.db'` opens (and can create) another file read-write,
which would break the "a read-only tab can't change anything on disk" promise.
Disabling ATTACH enforces the guarantee at the engine level (not by string-
matching SQL). Trade-off: read-only tabs can't attach a second DB for cross-DB
joins — open in write mode for that.

## ADR-007 — Content-Security-Policy: deferred, tracked
**Decision:** Keep `csp: null` for now; do **not** ship a strict CSP blindly.
**Why:** The frontend has no HTML-injection sink (no `dangerouslySetInnerHTML`;
React escapes all DB-derived text in JSX), so the practical XSS risk is low. A
strict `script-src 'self'` CSP can break Vite's dev injection / HMR during
`tauri dev`, and that couldn't be runtime-verified in this environment. When
added, scope it to production and include Tauri IPC sources
(`connect-src 'self' ipc: http://ipc.localhost`) and `style-src 'unsafe-inline'`
for CodeMirror. Tracked in ROADMAP. Also: the unused `opener` plugin and its
capability were removed (least privilege) since nothing invoked it.

## ADR-006 — Defer session/tab restore on restart
**Decision:** Persist a recent-files list (10), but do **not** auto-reopen
previously open tabs on launch.
**Why:** Restore needs to handle moved/deleted files and remember per-tab
read-only state; the recents list covers the common "open it again" need with
far less complexity. Revisit if users ask. (See ROADMAP.)

## ADR-005 — CodeMirror 6 for the SQL editor
**Decision:** Use `@uiw/react-codemirror` + `@codemirror/lang-sql` +
`@codemirror/theme-one-dark`, replacing the plain `<textarea>`.
**Why:** Gives keyword/string/number highlighting, line numbers, and SQL-aware
editing out of the box with a maintained React wrapper. Bundle grows (~440 KB),
but assets load from disk in a desktop app, so size is acceptable.
**Alternative rejected:** Prism overlay (`react-simple-code-editor`) — lighter
but no line numbers/auto-complete and a more fragile highlight overlay.

## ADR-004 — Read-only by default, explicit write opt-in
**Decision:** Open databases with `SQLITE_OPEN_READ_ONLY` unless the user ticks
"write mode". Write mode uses `SQLITE_OPEN_READ_WRITE` **without** `CREATE`.
**Why:** Prevents accidental edits to production/real files; refusing to create
on a wrong path avoids silently producing empty databases. Per-tab "reopen in
write mode" keeps the opt-in cheap.

## ADR-003 — Multiple connections via a registry
**Decision:** Replace the single `Mutex<Option<Connection>>` with
`Mutex<HashMap<u32, OpenDb>>` + `AtomicU32` id allocator; every command takes a
`conn_id`.
**Why:** Required for the multi-database tab UI. A map keyed by an opaque id is
simpler and safer than exposing paths as keys, and the `with_conn` helper keeps
locking/lookup in one place.

## ADR-002 — Frontend never touches the filesystem
**Decision:** All SQLite access lives in Rust; the React side only calls IPC
commands (plus the native file-picker dialog).
**Why:** Single trust boundary, easier to reason about safety, and keeps SQL/
identifier-quoting logic in one place.

## ADR-001 — Bundle SQLite into the binary
**Decision:** Use `rusqlite` with the `bundled` feature.
**Why:** Compiles SQLite from source so distributables carry no system
`libsqlite3` dependency — essential for easy Windows/Linux distribution.
