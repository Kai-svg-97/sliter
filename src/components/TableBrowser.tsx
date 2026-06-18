import { useEffect, useState } from "react";
import {
  countRows,
  getColumns,
  getRows,
  type ColumnInfo,
  type QueryResult,
} from "../api";
import DataGrid from "./DataGrid";

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
  // null = not yet loaded (shows "…" in UI); avoids blocking data on COUNT(*)
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset pagination and row count when the selected table changes.
  useEffect(() => {
    setPage(0);
    setTotal(null);
  }, [connId, table]);

  // Row count runs independently so it never blocks the data display.
  // COUNT(*) on a large table can be slow; data shows immediately while this loads.
  useEffect(() => {
    let cancelled = false;
    countRows(connId, table)
      .then((n) => { if (!cancelled) setTotal(n); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [connId, table]);

  // Data fetch — reruns on page change in addition to table/conn changes.
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
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [connId, table, page]);

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
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {result && !error && <DataGrid result={result} />}
    </div>
  );
}
