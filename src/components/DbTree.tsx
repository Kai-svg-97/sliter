import type { TableInfo } from "../api";

export interface TreeConn {
  id: number;
  fileName: string;
  path: string;
  readOnly: boolean;
}

export interface Selection {
  connId: number;
  table: string;
}

/**
 * Unified sidebar tree of every open database:
 *
 *   db1.db
 *     tables
 *       users
 *       orders
 *     views
 *       v_active
 */
export default function DbTree({
  conns,
  tablesByConn,
  expanded,
  selected,
  activeConnId,
  busy,
  browseLoading,
  onToggleExpand,
  onSelectTable,
  onSelectDb,
  onCloseDb,
  onReopenWritable,
}: {
  conns: TreeConn[];
  tablesByConn: Record<number, TableInfo[]>;
  expanded: Set<string>;
  selected: Selection | null;
  activeConnId: number | null;
  busy: boolean;
  browseLoading: boolean;
  onToggleExpand: (key: string) => void;
  onSelectTable: (connId: number, table: string) => void;
  onSelectDb: (connId: number) => void;
  onCloseDb: (connId: number) => void;
  onReopenWritable: (connId: number) => void;
}) {
  return (
    <div className="tree" role="tree">
      {conns.map((conn) => {
        const dbKey = `db:${conn.id}`;
        const tablesKey = `${dbKey}:tables`;
        const viewsKey = `${dbKey}:views`;
        const all = tablesByConn[conn.id] ?? [];
        const tables = all.filter((t) => t.kind !== "view");
        const views = all.filter((t) => t.kind === "view");
        const dbOpen = expanded.has(dbKey);

        return (
          <div key={conn.id} className="tree-db">
            {/* DB root node */}
            <div
              className={`tree-row db-node ${activeConnId === conn.id ? "active-db" : ""}`}
              title={conn.path}
            >
              <button
                className="tree-toggle"
                onClick={() => onToggleExpand(dbKey)}
                aria-label={dbOpen ? "Collapse" : "Expand"}
              >
                {dbOpen ? "▾" : "▸"}
              </button>
              <button className="tree-self" onClick={() => onSelectDb(conn.id)}>
                <span className="tree-icon">🗄️</span>
                <span className="tree-label">{conn.fileName}</span>
                <span className={`db-badge ${conn.readOnly ? "ro" : "rw"}`}>
                  {conn.readOnly ? "RO" : "RW"}
                </span>
              </button>
              {conn.readOnly && (
                <button
                  className="db-action"
                  title="Reopen in write mode"
                  disabled={busy}
                  onClick={() => onReopenWritable(conn.id)}
                >
                  ✎
                </button>
              )}
              <button
                className="db-action"
                title="Close database"
                disabled={busy}
                onClick={() => onCloseDb(conn.id)}
              >
                ×
              </button>
            </div>

            {dbOpen && (
              <div className="tree-children">
                {/* tables group */}
                <Group
                  label="tables"
                  count={tables.length}
                  expanded={expanded.has(tablesKey)}
                  onToggle={() => onToggleExpand(tablesKey)}
                >
                  {tables.map((t) => (
                    <Leaf
                      key={t.name}
                      icon="▦"
                      label={t.name}
                      active={selected?.connId === conn.id && selected?.table === t.name}
                      loading={
                        browseLoading &&
                        selected?.connId === conn.id &&
                        selected?.table === t.name
                      }
                      onClick={() => onSelectTable(conn.id, t.name)}
                    />
                  ))}
                  {tables.length === 0 && <EmptyLeaf label="no tables" />}
                </Group>

                {/* views group — only when present */}
                {views.length > 0 && (
                  <Group
                    label="views"
                    count={views.length}
                    expanded={expanded.has(viewsKey)}
                    onToggle={() => onToggleExpand(viewsKey)}
                  >
                    {views.map((t) => (
                      <Leaf
                        key={t.name}
                        icon="👁️"
                        label={t.name}
                        active={
                          selected?.connId === conn.id &&
                          selected?.table === t.name
                        }
                        loading={
                          browseLoading &&
                          selected?.connId === conn.id &&
                          selected?.table === t.name
                        }
                        onClick={() => onSelectTable(conn.id, t.name)}
                      />
                    ))}
                  </Group>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Group({
  label,
  count,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="tree-group">
      <button className="tree-row group-node" onClick={onToggle}>
        <span className="tree-toggle">{expanded ? "▾" : "▸"}</span>
        <span className="tree-icon">📁</span>
        <span className="tree-label">{label}</span>
        <span className="muted group-count">{count}</span>
      </button>
      {expanded && <div className="tree-children">{children}</div>}
    </div>
  );
}

function Leaf({
  icon,
  label,
  active,
  loading,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`tree-row leaf ${active ? "active" : ""}`}
      onClick={onClick}
      title={label}
    >
      {loading ? (
        <span className="tree-spinner" />
      ) : (
        <span className="tree-icon">{icon}</span>
      )}
      <span className="tree-label">{label}</span>
    </button>
  );
}

function EmptyLeaf({ label }: { label: string }) {
  return (
    <div className="tree-row leaf muted">
      <span className="tree-label">{label}</span>
    </div>
  );
}
