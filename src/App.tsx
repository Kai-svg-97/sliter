import { useEffect, useState } from "react";
import {
  addRecentFile,
  closeDatabase,
  getRecentFiles,
  listTables,
  openDatabase,
  pickDatabase,
  removeRecentFile,
  type RecentFile,
  type TableInfo,
} from "./api";
import StartScreen from "./components/StartScreen";
import DbTree, { type Selection } from "./components/DbTree";
import TableBrowser from "./components/TableBrowser";
import SqlEditor from "./components/SqlEditor";
import "./App.css";

interface OpenConn {
  id: number;
  path: string;
  fileName: string;
  readOnly: boolean;
}

type ContentTab = "data" | "sql";

const DEFAULT_SQL = "SELECT name FROM sqlite_master WHERE type='table';";

function baseName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || path;
}

function App() {
  const [conns, setConns] = useState<OpenConn[]>([]);
  const [tablesByConn, setTablesByConn] = useState<Record<number, TableInfo[]>>(
    {},
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Selection | null>(null);
  const [activeConnId, setActiveConnId] = useState<number | null>(null);
  const [contentTab, setContentTab] = useState<ContentTab>("data");
  // SQL editor draft text, per connection — lifted here so it survives the
  // unmount/remount that reopen-writable causes (the connection id changes).
  const [sqlText, setSqlText] = useState<Record<number, string>>({});
  const [recents, setRecents] = useState<RecentFile[]>([]);
  const [writeMode, setWriteMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getRecentFiles().then(setRecents).catch(() => {});
  }, []);

  async function loadTables(connId: number): Promise<TableInfo[]> {
    const t = await listTables(connId);
    setTablesByConn((prev) => ({ ...prev, [connId]: t }));
    return t;
  }

  function expandDb(id: number) {
    setExpanded((prev) =>
      new Set(prev).add(`db:${id}`).add(`db:${id}:tables`).add(`db:${id}:views`),
    );
  }

  function collapseDb(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(`db:${id}`);
      next.delete(`db:${id}:tables`);
      next.delete(`db:${id}:views`);
      return next;
    });
  }

  async function openPath(path: string, readOnly: boolean) {
    setError(null);
    setBusy(true);
    try {
      const meta = await openDatabase(path, readOnly);
      setConns((prev) => [
        ...prev,
        {
          id: meta.id,
          path: meta.path,
          fileName: baseName(meta.path),
          readOnly: meta.read_only,
        },
      ]);
      setActiveConnId(meta.id);
      expandDb(meta.id);
      const t = await loadTables(meta.id);
      const first = t.find((x) => x.kind !== "view") ?? t[0];
      if (first) {
        setSelected({ connId: meta.id, table: first.name });
        setContentTab("data");
      }
      const updated = await addRecentFile(path);
      setRecents(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenPicker() {
    const path = await pickDatabase();
    if (!path) return;
    await openPath(path, !writeMode);
  }

  async function handleCloseConn(id: number) {
    await closeDatabase(id).catch(() => {});
    const remaining = conns.filter((c) => c.id !== id);
    setConns(remaining);
    setTablesByConn((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSqlText((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    collapseDb(id);
    setSelected((prev) => (prev?.connId === id ? null : prev));
    setActiveConnId((prev) =>
      prev === id ? (remaining.length ? remaining[0].id : null) : prev,
    );
  }

  async function handleReopenWritable(id: number) {
    const conn = conns.find((c) => c.id === id);
    if (!conn) return;
    setError(null);
    setBusy(true);
    try {
      const meta = await openDatabase(conn.path, false);
      await closeDatabase(id).catch(() => {});
      setConns((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                id: meta.id,
                path: meta.path,
                fileName: baseName(meta.path),
                readOnly: meta.read_only,
              }
            : c,
        ),
      );
      setTablesByConn((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      // Carry the SQL draft over to the new connection id, then drop the old.
      setSqlText((prev) => {
        const next = { ...prev };
        if (next[id] !== undefined) {
          next[meta.id] = next[id];
          delete next[id];
        }
        return next;
      });
      collapseDb(id);
      setActiveConnId(meta.id);
      expandDb(meta.id);
      const t = await loadTables(meta.id);
      // Keep the same table selected if it still exists, else fall back.
      const prevTable = selected?.connId === id ? selected.table : undefined;
      const pick =
        (prevTable && t.find((x) => x.name === prevTable)) ??
        t.find((x) => x.kind !== "view") ??
        t[0];
      setSelected(pick ? { connId: meta.id, table: pick.name } : null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveRecent(path: string) {
    const updated = await removeRecentFile(path).catch(() => null);
    if (updated) setRecents(updated);
  }

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectTable(connId: number, table: string) {
    setSelected({ connId, table });
    setActiveConnId(connId);
    setContentTab("data");
  }

  function selectDb(connId: number) {
    setActiveConnId(connId);
    toggleExpand(`db:${connId}`);
  }

  if (conns.length === 0) {
    return (
      <div className="app">
        {error && <div className="error-box top-error">{error}</div>}
        <StartScreen
          recents={recents}
          writeMode={writeMode}
          busy={busy}
          onToggleWriteMode={setWriteMode}
          onOpenPicker={handleOpenPicker}
          onOpenPath={(p) => openPath(p, !writeMode)}
          onRemoveRecent={handleRemoveRecent}
        />
      </div>
    );
  }

  const activeConn = conns.find((c) => c.id === activeConnId) ?? null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🗄️ sliter</div>
        <button className="primary" disabled={busy} onClick={handleOpenPicker}>
          ＋ Open Database…
        </button>
        <label
          className="write-toggle compact"
          title="Applies to the next database you open"
        >
          <input
            type="checkbox"
            checked={writeMode}
            onChange={(e) => setWriteMode(e.target.checked)}
          />
          write mode
        </label>
      </header>

      {error && <div className="error-box top-error">{error}</div>}

      <div className="workspace">
        <aside className="sidebar tree-sidebar">
          <div className="sidebar-title">
            Databases <span className="muted">({conns.length})</span>
          </div>
          <DbTree
            conns={conns}
            tablesByConn={tablesByConn}
            expanded={expanded}
            selected={selected}
            activeConnId={activeConnId}
            busy={busy}
            onToggleExpand={toggleExpand}
            onSelectTable={selectTable}
            onSelectDb={selectDb}
            onCloseDb={handleCloseConn}
            onReopenWritable={handleReopenWritable}
          />
        </aside>

        <main className="content">
          <div className="tabs">
            <button
              className={contentTab === "data" ? "active" : ""}
              onClick={() => setContentTab("data")}
            >
              Browse Data
            </button>
            <button
              className={contentTab === "sql" ? "active" : ""}
              onClick={() => setContentTab("sql")}
            >
              SQL Query
            </button>
            <div className="tabs-spacer" />
            {activeConn && (
              <span className="active-db-label muted">
                {activeConn.fileName}
                <span className={`db-badge ${activeConn.readOnly ? "ro" : "rw"}`}>
                  {activeConn.readOnly ? "RO" : "RW"}
                </span>
              </span>
            )}
          </div>

          <div className="tab-body">
            {contentTab === "data" &&
              (selected ? (
                <TableBrowser
                  key={`${selected.connId}:${selected.table}`}
                  connId={selected.connId}
                  table={selected.table}
                />
              ) : (
                <div className="placeholder muted">
                  Select a table or view in the tree.
                </div>
              ))}

            {/* SQL editors are kept mounted per connection so each database
                preserves its own query text when switching in the tree. */}
            {contentTab === "sql" &&
              (activeConn ? (
                conns.map((c) => (
                  <div
                    key={c.id}
                    className="sql-host"
                    style={{ display: c.id === activeConnId ? "flex" : "none" }}
                  >
                    <SqlEditor
                      connId={c.id}
                      readOnly={c.readOnly}
                      value={sqlText[c.id] ?? DEFAULT_SQL}
                      onChange={(v) =>
                        setSqlText((prev) => ({ ...prev, [c.id]: v }))
                      }
                      onSchemaMaybeChanged={() => loadTables(c.id)}
                    />
                  </div>
                ))
              ) : (
                <div className="placeholder muted">
                  Select a database in the tree.
                </div>
              ))}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
