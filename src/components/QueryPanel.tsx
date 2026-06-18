import { useState } from "react";
import type { SavedQuery } from "../api";

interface Props {
  queries: SavedQuery[];
  activeConnId: number | null;
  onLoad: (sql: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

export default function QueryPanel({ queries, activeConnId, onLoad, onDelete, onRename }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function startRename(q: SavedQuery) {
    setRenamingId(q.id);
    setRenameValue(q.name);
  }

  function commitRename(id: string) {
    const trimmed = renameValue.trim();
    if (trimmed) onRename(id, trimmed);
    setRenamingId(null);
  }

  return (
    <div className="query-panel">
      <button
        className="query-panel-header"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "펼치기" : "접기"}
      >
        <span className="tree-toggle">{collapsed ? "▶" : "▼"}</span>
        <span className="tree-icon">📁</span>
        <span className="tree-label">Saved Queries</span>
        <span className="group-count muted">{queries.length}</span>
      </button>

      {!collapsed && (
        <ul className="query-list">
          {queries.length === 0 && (
            <li className="query-empty muted">저장된 쿼리 없음</li>
          )}
          {queries.map((q) => (
            <li key={q.id} className="query-item">
              {renamingId === q.id ? (
                <div className="query-rename-row">
                  <input
                    className="query-rename-input"
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(q.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => commitRename(q.id)}
                  />
                </div>
              ) : (
                <>
                  <button
                    className="query-load"
                    disabled={activeConnId === null}
                    title={activeConnId === null ? "DB를 먼저 열어주세요" : q.sql}
                    onClick={() => onLoad(q.sql)}
                    onDoubleClick={() => startRename(q)}
                  >
                    <span className="tree-icon query-icon">⚡</span>
                    <span className="tree-label">{q.name}</span>
                  </button>
                  <button
                    className="query-delete"
                    title="삭제"
                    onClick={() => onDelete(q.id)}
                  >
                    ×
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
