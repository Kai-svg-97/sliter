import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql, SQLite } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap, Prec } from "@uiw/react-codemirror";
import type { EditorView } from "@uiw/react-codemirror";
import { format as sqlFormat } from "sql-formatter";
import { executeSql, pickSavePath, saveFile, type QueryResult } from "../api";
import DataGrid from "./DataGrid";
import { toCSV, toXML } from "../utils/export";

/** Split SQL text into statements, skipping semicolons inside strings/comments. */
function splitStatements(sql: string): Array<{ text: string; from: number; to: number }> {
  const stmts: Array<{ text: string; from: number; to: number }> = [];
  let stmtStart = 0;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    // Quoted strings / identifiers — skip until matching closing quote (doubled = escaped)
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch;
      i++;
      while (i < sql.length) {
        if (sql[i] === q) {
          i++;
          if (i < sql.length && sql[i] === q) i++; // '' or "" or `` escape
          else break;
        } else {
          i++;
        }
      }
      continue;
    }

    // Line comment: -- ...
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }

    // Block comment: /* ... */
    if (ch === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    // Statement boundary
    if (ch === ';') {
      const chunk = sql.slice(stmtStart, i + 1).trim();
      if (chunk) stmts.push({ text: chunk, from: stmtStart, to: i + 1 });
      i++;
      stmtStart = i;
      continue;
    }

    i++;
  }

  // Trailing statement without a semicolon
  const trailing = sql.slice(stmtStart).trim();
  if (trailing) stmts.push({ text: trailing, from: stmtStart, to: sql.length });

  return stmts;
}

export default function SqlEditor({
  connId,
  readOnly,
  value,
  onChange,
  onSchemaMaybeChanged,
  onSaveQuery,
}: {
  connId: number;
  readOnly: boolean;
  value: string;
  onChange: (sql: string) => void;
  onSchemaMaybeChanged: () => void;
  onSaveQuery?: (name: string, sql: string) => Promise<void>;
}) {
  const code = value;
  const [result, setResult] = useState<QueryResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  const editorRef = useRef<EditorView | null>(null);
  const changeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (changeTimerRef.current) clearTimeout(changeTimerRef.current);
  }, []);

  async function run() {
    const view = editorRef.current;
    let sqlToRun: string;
    let modeLabel: string;

    if (view) {
      const { state } = view;
      const sel = state.selection.main;

      if (sel.from < sel.to) {
        // Explicit selection → run exactly that
        sqlToRun = state.sliceDoc(sel.from, sel.to).trim();
        modeLabel = "선택";
      } else {
        // No selection → run the statement the cursor is inside
        const full = state.doc.toString();
        const stmts = splitStatements(full);
        const cursor = sel.from;
        const stmt =
          stmts.find((s) => cursor >= s.from && cursor <= s.to) ??
          stmts[stmts.length - 1];
        sqlToRun = stmt?.text ?? full.trim();
        modeLabel = "커서";
      }
    } else {
      sqlToRun = code.trim();
      modeLabel = "";
    }

    if (!sqlToRun) return;
    setRunning(true);
    setError(null);
    setMessage(null);
    setResult(null);
    try {
      const res = await executeSql(connId, sqlToRun);
      setResult(res);
      if (res.rows_affected !== null) {
        setMessage(`OK — ${res.rows_affected} row(s) affected.`);
        onSchemaMaybeChanged();
      } else {
        const suffix = modeLabel ? ` (${modeLabel})` : "";
        setMessage(`${res.rows.length} row(s) returned${suffix}.`);
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

  async function handleSaveQuery() {
    const trimmed = saveName.trim();
    if (!trimmed || !onSaveQuery) return;
    setSaving(true);
    try {
      const editorContent = editorRef.current?.state.doc.toString() ?? code;
      await onSaveQuery(trimmed, editorContent);
      setSaveName("");
      setShowSaveForm(false);
    } finally {
      setSaving(false);
    }
  }

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
          onChange={(v) => {
            if (changeTimerRef.current) clearTimeout(changeTimerRef.current);
            changeTimerRef.current = setTimeout(() => onChange(v), 300);
          }}
          onCreateEditor={(view) => { editorRef.current = view; }}
          theme={oneDark}
          extensions={extensions}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            autocompletion: false,
            highlightSelectionMatches: false,
            foldGutter: false,
          }}
          placeholder="여러 쿼리를 작성하세요 (;로 구분). 커서 위치 쿼리 실행: Ctrl/Cmd+Enter"
        />
      </div>
      <div className="sql-actions">
        <button className="primary" disabled={running} onClick={run}>
          {running ? "Running…" : "Run ▶"}
        </button>
        <button
          disabled={running}
          title="SQL 정렬 · 선택 영역만 또는 전체 (Alt+Shift+F)"
          onClick={handleFormat}
        >
          SQL 포맷
        </button>
        <span className="hint muted">커서 쿼리 실행 · 블록 선택 후 실행 (Ctrl/Cmd+Enter)</span>
        {readOnly && (
          <span className="ro-hint" title="This database was opened read-only">
            read-only — writes will be rejected
          </span>
        )}
        {message && !error && <span className="ok-msg">{message}</span>}
        {onSaveQuery && (
          showSaveForm ? (
            <div className="save-query-form">
              <input
                className="save-name-input"
                placeholder="쿼리 이름…"
                value={saveName}
                autoFocus
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveQuery();
                  if (e.key === "Escape") { setShowSaveForm(false); setSaveName(""); }
                }}
              />
              <button
                className="primary"
                disabled={saving || !saveName.trim()}
                onClick={handleSaveQuery}
              >
                {saving ? "저장 중…" : "저장"}
              </button>
              <button onClick={() => { setShowSaveForm(false); setSaveName(""); }}>취소</button>
            </div>
          ) : (
            <button
              title="현재 쿼리를 Saved Queries에 저장"
              onClick={() => setShowSaveForm(true)}
            >
              💾 Save
            </button>
          )
        )}
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
