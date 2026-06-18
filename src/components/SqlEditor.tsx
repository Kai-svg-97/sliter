import { useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import type { EditorView } from "@codemirror/view";
import { sql, SQLite } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap, Prec } from "@uiw/react-codemirror";
import { format as sqlFormat } from "sql-formatter";
import { executeSql, pickSavePath, saveFile, type QueryResult } from "../api";
import DataGrid from "./DataGrid";
import { toCSV, toXML } from "../utils/export";

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
  const [exporting, setExporting] = useState(false);

  const editorRef = useRef<EditorView | null>(null);

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

  function handleFormat() {
    const view = editorRef.current;
    if (!view) return;
    const { state } = view;
    const sel = state.selection.main;
    const hasSelection = sel.from < sel.to;
    const from = hasSelection ? sel.from : 0;
    const to = hasSelection ? sel.to : state.doc.length;
    const text = state.sliceDoc(from, to);
    let formatted: string;
    try {
      formatted = sqlFormat(text, {
        language: "sqlite",
        tabWidth: 2,
        keywordCase: "upper",
        linesBetweenQueries: 2,
      });
    } catch {
      return;
    }
    view.dispatch({ changes: { from, to, insert: formatted } });
  }

  const runRef = useRef(run);
  runRef.current = run;

  const formatRef = useRef(handleFormat);
  formatRef.current = handleFormat;

  const extensions = useMemo(
    () => [
      sql({ dialect: SQLite }),
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => { runRef.current(); return true; },
          },
          {
            key: "Alt-Shift-f",
            run: () => { formatRef.current(); return true; },
          },
        ]),
      ),
    ],
    [],
  );

  async function handleExport(format: "csv" | "xml") {
    if (!result) return;
    setExporting(true);
    try {
      const ext = format === "csv" ? "csv" : "xml";
      const path = await pickSavePath(`query_result.${ext}`, [
        { name: format.toUpperCase(), extensions: [ext] },
      ]);
      if (!path) return;
      const content = format === "csv"
        ? toCSV(result.columns, result.rows)
        : toXML(result.columns, result.rows);
      await saveFile(path, content);
    } catch (e) {
      setError(String(e));
    } finally {
      setExporting(false);
    }
  }

  const hasRows = result !== null && result.columns.length > 0;

  return (
    <div className="sql-editor">
      <div className="cm-host">
        <CodeMirror
          value={code}
          onChange={onChange}
          onCreateEditor={(view) => { editorRef.current = view; }}
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
        <button
          disabled={running}
          title="선택 영역(없으면 전체) 포맷 (Alt+Shift+F)"
          onClick={handleFormat}
        >
          Format
        </button>
        <span className="hint muted">Ctrl/Cmd + Enter</span>
        {readOnly && (
          <span className="ro-hint" title="This database was opened read-only">
            read-only — writes will be rejected
          </span>
        )}
        {message && !error && <span className="ok-msg">{message}</span>}
        {hasRows && (
          <div className="export-group">
            <button
              className="export-btn"
              disabled={exporting}
              title="결과를 CSV로 저장"
              onClick={() => handleExport("csv")}
            >
              CSV
            </button>
            <button
              className="export-btn"
              disabled={exporting}
              title="결과를 XML로 저장"
              onClick={() => handleExport("xml")}
            >
              XML
            </button>
          </div>
        )}
      </div>
      {error && <div className="error-box">{error}</div>}
      {hasRows && !error && <DataGrid result={result} />}
    </div>
  );
}
