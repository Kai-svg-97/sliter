import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  addRecentFile,
  closeDatabase,
  deleteQuery,
  getRecentFiles,
  getSavedQueries,
  listTables,
  openDatabase,
  pickDatabase,
  removeRecentFile,
  renameQuery,
  saveQuery,
  type RecentFile,
  type SavedQuery,
  type TableInfo,
} from "./api";
import StartScreen from "./components/StartScreen";
import DbTree, { type Selection } from "./components/DbTree";
import QueryPanel from "./components/QueryPanel";
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
  const [browseLoading, setBrowseLoading] = useState(false);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [version, setVersion] = useState("");
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<{ downloaded: number; total: number | null; phase: "download" | "install" } | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    getRecentFiles().then(setRecents).catch(() => {});
    getSavedQueries().then(setSavedQueries).catch(() => {});
  }, []);

  useEffect(() => {
    getVersion().then((v) => {
      setVersion(v);
      getCurrentWindow().setTitle(`sliter v${v} — SQLite editor`);
    });
    check().then((u) => { if (u) setPendingUpdate(u); }).catch((e) => {
      console.warn("[updater] check failed:", e);
    });
  }, []);

  async function handleSaveQuery(name: string, sql: string) {
    const updated = await saveQuery(name, sql);
    setSavedQueries(updated);
  }

  async function handleDeleteQuery(id: string) {
    const updated = await deleteQuery(id);
    setSavedQueries(updated);
  }

  async function handleRenameQuery(id: string, name: string) {
    const updated = await renameQuery(id, name);
    setSavedQueries(updated);
  }

  function handleLoadQuery(sql: string) {
    if (activeConnId === null) return;
    setSqlText((prev) => ({ ...prev, [activeConnId]: sql }));
    setContentTab("sql");
  }

  async function handleInstallUpdate() {
    if (!pendingUpdate) return;
    setUpdating(true);
    setUpdateError(null);
    setUpdateProgress({ downloaded: 0, total: null, phase: "download" });
    try {
      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setUpdateProgress({ downloaded: 0, total: event.data.contentLength ?? null, phase: "download" });
        } else if (event.event === "Progress") {
          setUpdateProgress((prev) => {
            const downloaded = (prev?.downloaded ?? 0) + event.data.chunkLength;
            return { downloaded, total: prev?.total ?? null, phase: "download" };
          });
        } else if (event.event === "Finished") {
          setUpdateProgress({ downloaded: 0, total: null, phase: "install" });
        }
      });
      await relaunch();
    } catch (e) {
      setUpdateError(String(e));
      setUpdating(false);
      setUpdateProgress(null);
    }
  }

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
      await loadTables(meta.id);
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
      // Keep the same table selected if it still exists; don't auto-select otherwise.
      const prevTable = selected?.connId === id ? selected.table : undefined;
      const pick = prevTable ? t.find((x) => x.name === prevTable) : null;
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

  function renderUpdateBar() {
    if (!pendingUpdate) return null;
    let statusText = `업데이트 v${pendingUpdate.version} 사용 가능`;
    let btnLabel = "지금 설치 후 재시작";
    if (updateProgress) {
      if (updateProgress.phase === "download") {
        if (updateProgress.total) {
          const pct = Math.round((updateProgress.downloaded / updateProgress.total) * 100);
          const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
          statusText = `다운로드 중… ${mb(updateProgress.downloaded)} / ${mb(updateProgress.total)} MB (${pct}%)`;
        } else {
          statusText = "다운로드 중…";
        }
        btnLabel = "다운로드 중…";
      } else {
        statusText = "설치 중… (UAC 창이 뜨면 '예' 클릭)";
        btnLabel = "설치 중…";
      }
    }
    return (
      <div className="update-bar">
        <span>{statusText}</span>
        {updateError && <span className="update-error">{updateError}</span>}
        <button onClick={handleInstallUpdate} disabled={updating}>
          {btnLabel}
        </button>
      </div>
    );
  }

  if (conns.length === 0) {
    return (
      <div className="app">
        {renderUpdateBar()}
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
      {renderUpdateBar()}
      <header className="topbar">
        <div className="brand">🗄️ sliter{version && <span className="version-tag">v{version}</span>}</div>
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
            browseLoading={browseLoading}
            onToggleExpand={toggleExpand}
            onSelectTable={selectTable}
            onSelectDb={selectDb}
            onCloseDb={handleCloseConn}
            onReopenWritable={handleReopenWritable}
          />
          <div className="sidebar-divider" />
          <QueryPanel
            queries={savedQueries}
            activeConnId={activeConnId}
            onLoad={handleLoadQuery}
            onDelete={handleDeleteQuery}
            onRename={handleRenameQuery}
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
                  onLoadingChange={setBrowseLoading}
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
                      onSaveQuery={handleSaveQuery}
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
