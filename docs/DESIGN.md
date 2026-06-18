# sliter — UI / UX Design

## Layout

### Start screen (no database open)
```
            🗄️
          sliter
   A cross-platform SQLite editor
   [ Open a SQLite database ]
   ☐ Open in write mode (default: read-only)

   RECENT DATABASES
   ┌───────────────────────────────────────┐
   │ sample.db                    2h ago  × │
   │ C:/path/to/sample.db                   │
   └───────────────────────────────────────┘
   … up to 10
```

### With databases open
```
🗄️ sliter   [＋ Open Database…]                          ☐ write mode
─────────────────────────────────────────────────────────────────────
 Databases (2)   │ [Browse Data][SQL Query]        app.sqlite [RW]
 ▾ 🗄️ sample.db RO ✎ × │ ───────────────────────────────────────────
   ▾ 📁 tables 2  │  (data grid for the selected table,
     ▦ users      │   or the SQL editor for the active database)
     ▦ orders     │
 ▾ 🗄️ app.sqlite RW × │
   ▾ 📁 tables 2  │
     ▦ sites      │
     ▦ pages      │
   ▾ 📁 views 1   │
     👁️ v_visitors │
```

- **Unified tree sidebar** (not tabs): every open database is a root node, each
  with a `RO`/`RW` badge, a `✎` "reopen in write mode" action (read-only only),
  and a `×` close. Under each DB are collapsible `📁 tables` and (when present)
  `📁 views` groups; leaves are individual tables (`▦`) / views (`👁️`).
- DB and group nodes expand/collapse via the `▸`/`▾` toggle. Selecting a leaf
  shows its data; selecting a DB node makes it the **active** database.
- **Content area** keeps the Browse Data / SQL Query sub-tabs. Browse Data shows
  the selected leaf; SQL Query targets the **active database** (shown top-right
  with its badge). One SQL editor is kept mounted per connection, so each
  database preserves its own query text when you switch in the tree.
- `＋ Open Database…` and the global "write mode" checkbox live in the top bar.

## Read-only / write affordances
- Default open is read-only; a single global "write mode" checkbox (start screen
  + top bar) governs the next open.
- The SQL editor shows a "read-only — writes will be rejected" hint on read-only
  connections; failed writes surface SQLite's error in a red box.

## Color tokens (dark theme, `src/App.css`)
| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#1e1e2e` | app background |
| `--bg-alt` | `#181825` | bars, sidebar, inputs |
| `--panel` | `#252539` | buttons, tabs |
| `--border` | `#313244` | borders, grid lines |
| `--text` | `#cdd6f4` | text |
| `--muted` | `#7f849c` | secondary text |
| `--accent` | `#89b4fa` | primary actions, active states |
| `--ok` | `#a6e3a1` | success, write-mode dot |
| `--error-fg` | `#f38ba8` | errors |

The SQL editor itself uses CodeMirror's `oneDark` theme, which harmonizes with
these tokens.

## Keyboard shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Enter` | Run the SQL in the editor |

## Data grid
- Sticky header row and sticky left row-index column.
- `NULL` rendered in muted italic; BLOBs as `<BLOB N bytes>`.
- Cells truncate with ellipsis; full value in the tooltip.
