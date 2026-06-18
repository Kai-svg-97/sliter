import { useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql, SQLite } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap, Prec } from "@uiw/react-codemirror";
import { executeSql, type QueryResult } from "../api";
import DataGrid from "./DataGrid";

export default function SqlEditor({
  connId,
  readOnly,
  value,
  onChange,
  onSchemaMaybeChanged,
}: {
  connId: number;
  readOnly: boolean;
  value: string;
  onChange: (sql: string) => void;
  onSchemaMaybeChanged: () => void;
}) {
  const code = value;
  const [result, setResult] = useState<QueryResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // `run` reads the latest `code` from state; the keymap closure below captures
  // this function, which is stable enough for our needs (state is read at call).
  async function run() {
    const trimmed = code.trim();
    if (!trimmed) return;
    setRunning(true);
    setError(null);
    setMessage(null);
    setResult(null);
    try {
      const res = await executeSql(connId, trimmed);
      setResult(res);
      if (res.rows_affected !== null) {
        setMessage(`OK — ${res.rows_affected} row(s) affected.`);
        // DDL/DML may have changed the schema; let the parent refresh tables.
        onSchemaMaybeChanged();
      } else {
        setMessage(`${res.rows.length} row(s) returned.`);
      }
    } catch (e) {
      setError(String(e));
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  // The keymap is built once, so it must not close over `run` directly (that
  // would capture stale `code`). Route through a ref that always points at the
  // latest `run`, updated on every render below.
  const runRef = useRef(run);
  runRef.current = run;

  // Ctrl/Cmd+Enter runs the query. High precedence so it wins over defaults.
  const extensions = useMemo(
    () => [
      sql({ dialect: SQLite }),
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              runRef.current();
              return true;
            },
          },
        ]),
      ),
    ],
    [],
  );

  return (
    <div className="sql-editor">
      <div className="cm-host">
        <CodeMirror
          value={code}
          onChange={onChange}
          theme={oneDark}
          extensions={extensions}
          basicSetup={{ lineNumbers: true, highlightActiveLine: true }}
          placeholder="Write SQL here…  (Ctrl/Cmd+Enter to run)"
        />
      </div>
      <div className="sql-actions">
        <button className="primary" disabled={running} onClick={run}>
          {running ? "Running…" : "Run ▶"}
        </button>
        <span className="hint muted">Ctrl/Cmd + Enter</span>
        {readOnly && (
          <span className="ro-hint" title="This database was opened read-only">
            read-only — writes will be rejected
          </span>
        )}
        {message && !error && <span className="ok-msg">{message}</span>}
      </div>
      {error && <div className="error-box">{error}</div>}
      {result && result.columns.length > 0 && !error && (
        <DataGrid result={result} />
      )}
    </div>
  );
}
