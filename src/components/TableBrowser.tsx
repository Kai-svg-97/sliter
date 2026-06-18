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
  onLoadingChange,
}: {
  connId: number;
  table: string;
  onLoadingChange?: (loading: boolean) => void;
}) {
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const genRef = useRef(0);
  const countGenRef = useRef(0);

  // Notify parent of loading state (drives sidebar spinner).
  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  // Clear stale data immediately when the selected table changes so the user
  // sees a clean loading state rather than the previous table's rows.
  useEffect(() => {
    setPage(0);
    setTotal(null);
    setResult(null);
    setColumns([]);
  }, [connId, table]);

  // Fetch columns + rows for the current page.
  useEffect(() => {
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);

    Promise.all([
      getColumns(connId, table),
      getRows(connId, table, PAGE_SIZE, page * PAGE_SIZE),
    ])
      .then(([cols, rows]) => {
        if (gen !== genRef.current) return;
        setColumns(cols);
        setResult(rows);
        setLoading(false);
      })
      .catch((e) => {
        if (gen !== genRef.current) return;
        setError(String(e));
        setLoading(false);
      });
  }, [connId, table, page]);

  // Count rows on its own independent connection (never blocks get_rows).
  // Debounced 300 ms so rapid table navigation doesn't queue up slow COUNTs.
  useEffect(() => {
    setTotal(null);
    const countGen = ++countGenRef.current;
    const timer = setTimeout(() => {
      if (countGen !== countGenRef.current) return;
      countRows(connId, table)
        .then((n) => { if (countGen !== countGenRef.current) return; setTotal(n); })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [connId, table]);

  async function handleExport(format: "csv" | "xml") {
    if (!result) return;
    setExporting(true);
    try {
      const ext = format === "csv" ? "csv" : "xml";
      const path = await pickSavePath(`${table}.${ext}`, [
        { name: format.toUpperCase(), extensions: [ext] },
      ]);
      if (!path) return;
      const content =
        format === "csv"
          ? toCSV(result.columns, result.rows)
          : toXML(result.columns, result.rows);
      await saveFile(path, content);
    } catch (e) {
      setError(String(e));
    } finally {
      setExporting(false);
    }
  }

  const totalPages =
    total !== null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null;
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
      {loading && !result && <div className="browser-loading" />}
      {result && !error && <DataGrid result={result} />}
    </div>
  );
}
