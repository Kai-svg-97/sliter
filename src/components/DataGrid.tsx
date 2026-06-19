import { useEffect, useRef, useState } from "react";
import type { Cell, QueryResult } from "../api";

const PREVIEW_LEN = 100;  // chars shown inline before truncation
const MODAL_CHUNK = 4000; // chars loaded per scroll step in the modal

type MenuState = { x: number; y: number; rowIdx: number; colIdx: number };

function cellText(v: Cell): string {
  return v === null ? "" : String(v);
}

function byteSizeStr(str: string): string {
  const b = new TextEncoder().encode(str).length;
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

function CellModal({ value, onClose }: { value: string; onClose: () => void }) {
  const [chunks, setChunks] = useState(1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const displayed = value.slice(0, chunks * MODAL_CHUNK);
  const hasMore = displayed.length < value.length;

  // Esc to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // IntersectionObserver relative to the scrollable modal body — fires when
  // the sentinel near the bottom comes into view, loading the next chunk.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const body = bodyRef.current;
    if (!sentinel || !body || !hasMore) return;
    const ob = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setChunks((n) => n + 1); },
      { root: body, rootMargin: "120px", threshold: 0 },
    );
    ob.observe(sentinel);
    return () => ob.disconnect();
  }, [hasMore]);

  const loadedPct = Math.min(100, Math.round((displayed.length / value.length) * 100));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="muted">
            {value.length.toLocaleString()} chars · {byteSizeStr(value)}
            {hasMore && (
              <span className="modal-load-pct"> · {loadedPct}% 표시됨</span>
            )}
          </span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div ref={bodyRef} className="modal-body">
          <pre className="modal-pre">{displayed}</pre>
          {hasMore && (
            <div ref={sentinelRef} className="modal-sentinel">
              불러오는 중…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DataGrid({
  result,
  onLoadMore,
  hasMore = false,
}: {
  result: QueryResult;
  onLoadMore?: () => Promise<Cell[][] | null>;
  hasMore?: boolean;
}) {
  // rowsRef: accumulated rows from initial result + subsequent loads.
  // Using a ref (not state) lets the IntersectionObserver callback mutate it
  // without stale-closure issues; setTick() triggers a re-render to pick up changes.
  const rowsRef = useRef<Cell[][]>(result.rows);
  const [, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);

  const hasMoreRef = useRef(hasMore);
  const onLoadMoreRef = useRef(onLoadMore);
  const fetchingRef = useRef(false);
  const [fetchingMore, setFetchingMore] = useState(false);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [modalValue, setModalValue] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync mutable refs with latest props
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  // Reset when result changes (new table opened or new SQL run)
  useEffect(() => {
    rowsRef.current = result.rows;
    refresh();
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  // Context-menu dismiss on click-outside or Escape
  useEffect(() => {
    if (!menu) return;
    function dismiss(e: MouseEvent | KeyboardEvent) {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      setMenu(null);
    }
    window.addEventListener("mousedown", dismiss);
    window.addEventListener("keydown", dismiss);
    return () => {
      window.removeEventListener("mousedown", dismiss);
      window.removeEventListener("keydown", dismiss);
    };
  }, [menu]);

  // IntersectionObserver on sentinel — when visible, fetch the next batch.
  // Effect runs once (empty deps); all values are read from refs at call time.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const ob = new IntersectionObserver(
      async (entries) => {
        if (!entries[0].isIntersecting) return;
        if (fetchingRef.current) return;
        if (!hasMoreRef.current || !onLoadMoreRef.current) return;

        fetchingRef.current = true;
        setFetchingMore(true);
        try {
          const more = await onLoadMoreRef.current();
          if (more && more.length > 0) {
            rowsRef.current = [...rowsRef.current, ...more];
            refresh();
          }
        } finally {
          fetchingRef.current = false;
          setFetchingMore(false);
        }
      },
      { rootMargin: "200px", threshold: 0 },
    );

    ob.observe(sentinel);
    return () => ob.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- copy helpers ----
  const rows = rowsRef.current;

  function copyCell() {
    if (!menu) return;
    navigator.clipboard.writeText(cellText(rows[menu.rowIdx]?.[menu.colIdx] ?? null));
    setMenu(null);
  }
  function copyRecord() {
    if (!menu) return;
    navigator.clipboard.writeText((rows[menu.rowIdx] ?? []).map(cellText).join("\t"));
    setMenu(null);
  }
  function copyVisible() {
    navigator.clipboard.writeText(
      rows.map((row) => row.map(cellText).join("\t")).join("\n"),
    );
    setMenu(null);
  }
  function copyAllWithHeader() {
    const header = result.columns.join("\t");
    const body = rows.map((row) => row.map(cellText).join("\t")).join("\n");
    navigator.clipboard.writeText(body ? `${header}\n${body}` : header);
    setMenu(null);
  }

  if (result.columns.length === 0) return null;

  return (
    <div className="grid-wrap">
      {menu && (
        <div
          ref={menuRef}
          className="ctx-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button onClick={copyCell}>셀 복사</button>
          <button onClick={copyRecord}>레코드 복사</button>
          <button onClick={copyVisible}>표시된 행 복사</button>
          <button onClick={copyAllWithHeader}>헤더 포함 전체 복사</button>
        </div>
      )}

      {modalValue !== null && (
        <CellModal value={modalValue} onClose={() => setModalValue(null)} />
      )}

      <table className="data-grid">
        <thead>
          <tr>
            <th className="row-index">#</th>
            {result.columns.map((col, i) => (
              <th key={i} title={col}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const td = (e.target as Element).closest("td");
            if (!td) return;
            const tr = td.closest("tr");
            const ri = tr ? Number(tr.dataset.ri) : -1;
            const ci = Number((td as HTMLElement).dataset.ci);
            if (ri < 0 || isNaN(ci)) return;
            setMenu({ x: e.clientX, y: e.clientY, rowIdx: ri, colIdx: ci });
          }}
        >
          {rows.map((row, ri) => (
            <tr key={ri} data-ri={ri}>
              <td className="row-index">{ri + 1}</td>
              {row.map((cell, ci) => {
                const str = cell === null ? null : String(cell);
                const truncated = str !== null && str.length > PREVIEW_LEN;
                return (
                  <td
                    key={ci}
                    data-ci={ci}
                    title={
                      truncated
                        ? str.slice(0, 300)
                        : str ?? "NULL"
                    }
                  >
                    {cell === null ? (
                      <span className="cell-null">NULL</span>
                    ) : truncated ? (
                      <>
                        {str.slice(0, PREVIEW_LEN)}
                        <button
                          className="cell-expand"
                          title="클릭하여 전체 내용 보기"
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalValue(str);
                          }}
                        >
                          <span className="cell-size-badge">{byteSizeStr(str)}</span>
                          {" "}…
                        </button>
                      </>
                    ) : (
                      str
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && !fetchingMore && (
        <div className="grid-empty">No rows.</div>
      )}

      {/* Sentinel: visible when scrolled near bottom → triggers next load */}
      {hasMore && (
        <div ref={sentinelRef} className="grid-sentinel">
          {fetchingMore && <span className="grid-loading">불러오는 중…</span>}
        </div>
      )}
    </div>
  );
}
