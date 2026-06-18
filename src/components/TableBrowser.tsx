import { useCallback, useEffect, useRef, useState } from "react";
import {
  countRows,
  getColumns,
  getRows,
  pickSavePath,
  saveFile,
  type Cell,
  type ColumnInfo,
  type QueryResult,
} from "../api";
import DataGrid from "./DataGrid";
import { toCSV, toXML } from "../utils/export";

const DB_FETCH_SIZE = 50; // rows fetched per DB call

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
  // initialResult: first batch — drives DataGrid columns; rows grow via onLoadMore
  const [initialResult, setInitialResult] = useState<QueryResult | null>(null);
  // allLoadedRows: all rows fetched so far (for export)
  const [allLoadedRows, setAllLoadedRows] = useState<Cell[][]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const genRef = useRef(0);
  const countGenRef = useRef(0);

  // Notify parent (drives sidebar spinner)
  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  // Clear stale data immediately when table changes
  useEffect(() => {
    setInitialResult(null);
    setColumns([]);
    setAllLoadedRows([]);
    setLoadedCount(0);
    setHasMore(false);
    setTotal(null);
    setError(null);
  }, [connId, table]);

  // Initial load: first batch + columns
  useEffect(() => {
    const gen = ++genRef.current;
    setLoading(true);

    Promise.all([
      getColumns(connId, table),
      getRows(connId, table, DB_FETCH_SIZE, 0),
    ])
      .then(([cols, batch]) => {
        if (gen !== genRef.current) return;
        setColumns(cols);
        setInitialResult(batch);
        setAllLoadedRows(batch.rows);
        setLoadedCount(batch.rows.length);
        setHasMore(batch.rows.length === DB_FETCH_SIZE);
        setLoading(false);
      })
      .catch((e) => {
        if (gen !== genRef.current) return;
        setError(String(e));
        setLoading(false);
      });
  }, [connId, table]);

  // Count rows independently (own connection, debounced)
  useEffect(() => {
    setTotal(null);
    const countGen = ++countGenRef.current;
    const timer = setTimeout(() => {
      if (countGen !== countGenRef.current) return;
      countRows(connId, table)
        .then((n) => {
          if (countGen !== countGenRef.current) return;
          setTotal(n);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [connId, table]);

  // Callback for DataGrid infinite scroll — fetches next batch from DB
  const handleLoadMore = useCallback(async (): Promise<Cell[][] | null> => {
    try {
      const batch = await getRows(connId, table, DB_FETCH_SIZE, loadedCount);
      const newRows = batch.rows;
      setAllLoadedRows((prev) => [...prev, ...newRows]);
      setLoadedCount((prev) => prev + newRows.length);
      setHasMore(newRows.length === DB_FETCH_SIZE);
      return newRows;
    } catch {
      return null;
    }
  }, [connId, table, loadedCount]);

  async function handleExport(format: "csv" | "xml") {
    if (!initialResult) return;
    setExporting(true);
    try {
      const ext = format === "csv" ? "csv" : "xml";
      const path = await pickSavePath(`${table}.${ext}`, [
        { name: format.toUpperCase(), extensions: [ext] },
      ]);
      if (!path) return;
      const content =
        format === "csv"
          ? toCSV(initialResult.columns, allLoadedRows)
          : toXML(initialResult.columns, allLoadedRows);
      await saveFile(path, content);
    } catch (e) {
      setError(String(e));
    } finally {
      setExporting(false);
    }
  }

  const pk = columns.filter((c) => c.pk).map((c) => c.name);

  return (
    <div className="browser">
      <div className="browser-head">
        <div className="schema-line">
          <strong>{table}</strong>
          <span className="muted">
            {columns.length > 0 && `${columns.length} columns · `}
            {total !== null ? total.toLocaleString() : "…"} rows
            {pk.length > 0 && ` · PK: ${pk.join(", ")}`}
            {loadedCount > 0 && total === null && (
              <> · {loadedCount.toLocaleString()} 로드됨</>
            )}
          </span>
        </div>
        <div className="pager">
          <span className="muted loaded-count">
            {loadedCount > 0 && total !== null
              ? `${loadedCount.toLocaleString()} / ${total.toLocaleString()} 로드됨`
              : ""}
          </span>
          <div className="export-group">
            <button
              className="export-btn"
              disabled={!initialResult || exporting}
              title="로드된 행을 CSV로 저장"
              onClick={() => handleExport("csv")}
            >
              CSV
            </button>
            <button
              className="export-btn"
              disabled={!initialResult || exporting}
              title="로드된 행을 XML로 저장"
              onClick={() => handleExport("xml")}
            >
              XML
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && !initialResult && <div className="browser-loading" />}
      {initialResult && !error && (
        <DataGrid
          result={initialResult}
          onLoadMore={handleLoadMore}
          hasMore={hasMore}
        />
      )}
    </div>
  );
}
