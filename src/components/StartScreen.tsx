import type { RecentFile } from "../api";

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export default function StartScreen({
  recents,
  writeMode,
  busy,
  onToggleWriteMode,
  onOpenPicker,
  onOpenPath,
  onRemoveRecent,
}: {
  recents: RecentFile[];
  writeMode: boolean;
  busy: boolean;
  onToggleWriteMode: (v: boolean) => void;
  onOpenPicker: () => void;
  onOpenPath: (path: string) => void;
  onRemoveRecent: (path: string) => void;
}) {
  return (
    <div className="start-screen">
      <div className="start-hero">
        <div className="empty-icon">🗄️</div>
        <h1>sliter</h1>
        <p className="muted">A cross-platform SQLite database editor.</p>
        <button className="primary big" disabled={busy} onClick={onOpenPicker}>
          Open a SQLite database
        </button>
        <label className="write-toggle" title="Open with write access. Default is read-only.">
          <input
            type="checkbox"
            checked={writeMode}
            onChange={(e) => onToggleWriteMode(e.target.checked)}
          />
          Open in write mode (default: read-only)
        </label>
      </div>

      <div className="recents">
        <div className="recents-title">Recent databases</div>
        {recents.length === 0 ? (
          <div className="muted recents-empty">No recent files yet.</div>
        ) : (
          <ul className="recents-list">
            {recents.map((r) => (
              <li key={r.path} className="recent-row">
                <button
                  className="recent-open"
                  disabled={busy}
                  title={r.path}
                  onClick={() => onOpenPath(r.path)}
                >
                  <span className="recent-name">{r.name}</span>
                  <span className="recent-path muted">{r.path}</span>
                  <span className="recent-time muted">{timeAgo(r.last_opened)}</span>
                </button>
                <button
                  className="recent-remove"
                  title="Remove from list"
                  onClick={() => onRemoveRecent(r.path)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
