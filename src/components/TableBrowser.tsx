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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset to the first page whenever the selected table changes.
  useEffect(() => {
    setPage(0);
  }, [table]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getColumns(connId, table),
      countRows(connId, table),
      getRows(connId, table, PAGE_SIZE, page * PAGE_SIZE),
    ])
      .then(([cols, count, rows]) => {
        if (cancelled) return;
        setColumns(cols);
        setTotal(count);
        setResult(rows);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [connId, table, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pk = columns.filter((c) => c.pk).map((c) => c.name);

  return (
    <div className="browser">
      <div className="browser-head">
        <div className="schema-line">
          <strong>{table}</strong>
          <span className="muted">
            {columns.length} columns · {total.toLocaleString()} rows
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
            Page {page + 1} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1 || loading}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            Next ›
          </button>
          <button
            disabled={page >= totalPages - 1 || loading}
            onClick={() => setPage(totalPages - 1)}
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
