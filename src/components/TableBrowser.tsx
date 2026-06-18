import { useEffect, useRef, useState } from "react";
import {
  countRows,
  getColumns,
  getRows,
  pickSavePath,
  saveFile,
  type ColumnInfo,
  type QueryResult,
} from "../api";
import DataGrid from "./DataGrid";
import { toCSV, toXML } from "../utils/export";

const PAGE_SIZE = 100;

export default function TableBrowser({
  connId,
  table,
}: {
  connId: number;
  table: string;
}) {
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Tracks which table has already triggered a COUNT so page navigation
  // doesn't re-issue COUNT(*) on every page change.
  const countedKey = useRef("");

  useEffect(() => {
    setPage(0);
    setTotal(null);
    countedKey.current = "";
  }, [connId, table]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getColumns(connId, table),
      getRows(connId, table, PAGE_SIZE, page * PAGE_SIZE),
    ])
      .then(([cols, rows]) => {
        if (cancelled) return;
        setColumns(cols);
        setResult(rows);
        setLoading(false);
        // COUNT fires only after data is visible and only once per table,
        // preventing it from racing with getRows for the per-connection lock.
        const key = `${connId}:${table}`;
        if (countedKey.current !== key) {
          countedKey.current = key;
          countRows(connId, table)
            .then((n) => { if (!cancelled) setTotal(n); })
            .catch(() => {});
        }
      })
      .catch((e) => {
        if (!cancelled) { setError(String(e)); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [connId, table, page]);

  async function handleExport(format: "csv" | "xml") {
    if (!result) return;
    setExporting(true);
    try {
      const ext = format === "csv" ? "csv" : "xml";
      const path = await pickSavePath(`${table}.${ext}`, [
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

  const totalPages = total !== null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null;
  const pk = columns.filter((c) => c.pk).map((c) => c.name);
  const isLastPage = totalPages !== null ? page >= totalPages - 1 : false;

  return (
    <div className="browser">
      <div className="browser-head">
        <div className="schema-line">
          <strong>{table}</strong>
          <span className="muted">
            {columns.length > 0 && `${columns.length} columns · `}
            {total !== null ? total.toLocaleString() : "…"} rows
            {pk.length > 0 && ` · PK: ${pk.join(", ")}`}
          </span>
        </div>
        <div className="pager">
          <button disabled={page <= 0 || loading} onClick={() => setPage(0)}>
            « First
          </button>
          <button
            disabled={page <= 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ‹ Prev
          </button>
          <span className="muted">
            Page {page + 1} / {totalPages !== null ? totalPages : "?"}
          </span>
          <button
            disabled={isLastPage || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next ›
          </button>
          <button
            disabled={isLastPage || totalPages === null || loading}
            onClick={() => totalPages !== null && setPage(totalPages - 1)}
          >
            Last »
          </button>
          <div className="export-group">
            <button
              className="export-btn"
              disabled={!result || exporting}
              title="현재 페이지를 CSV로 저장"
              onClick={() => handleExport("csv")}
            >
              CSV
            </button>
            <button
              className="export-btn"
              disabled={!result || exporting}
              title="현재 페이지를 XML로 저장"
              onClick={() => handleExport("xml")}
            >
              XML
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {result && !error && <DataGrid result={result} />}
    </div>
  );
}
