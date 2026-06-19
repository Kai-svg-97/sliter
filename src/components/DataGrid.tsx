import { useEffect, useMemo, useRef, useState } from "react";
import { format as sqlFormat } from "sql-formatter";
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

type FormatMode = "RAW" | "SQL" | "JSON" | "XML";
const FORMAT_MODES: FormatMode[] = ["RAW", "SQL", "JSON", "XML"];

function prettyJson(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2); }
  catch { return s; }
}

function prettyXml(s: string): string {
  try {
    let indent = 0;
    const pad = (n: number) => "  ".repeat(n);
    return s
      .replace(/>\s*</g, ">\n<")
      .split("\n")
      .reduce((acc, raw) => {
        const t = raw.trim();
        if (!t) return acc;
        const isClose = t.startsWith("</");
        const isSelf = t.endsWith("/>") || t.startsWith("<?") || t.startsWith("<!");
        if (isClose) indent = Math.max(0, indent - 1);
        acc += pad(indent) + t + "\n";
        if (!isClose && !isSelf && t.startsWith("<") && !t.includes("</")) indent++;
        return acc;
      }, "")
      .trimEnd();
  } catch { return s; }
}

function applyFormat(value: string, mode: FormatMode): string {
  try {
    if (mode === "SQL")
      return sqlFormat(value, { language: "sqlite", tabWidth: 2, keywordCase: "upper", linesBetweenQueries: 2 });
    if (mode === "JSON") return prettyJson(value);
    if (mode === "XML")  return prettyXml(value);
  } catch { /* fall through */ }
  return value;
}

function CellModal({ value, onClose }: { value: string; onClose: () => void }) {
  const [chunks, setChunks] = useState(1);
  const [fmt, setFmt] = useState<FormatMode>("RAW");
  const bodyRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const content = useMemo(() => applyFormat(value, fmt), [value, fmt]);

  // Reset scroll position to start when format changes
  useEffect(() => {
    setChunks(1);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [fmt]);

  const displayed = content.slice(0, chunks * MODAL_CHUNK);
  const hasMore = displayed.length < content.length;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

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

  const loadedPct = Math.min(100, Math.round((displayed.length / content.length) * 100));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-head-info muted">
            {value.length.toLocaleString()} chars · {byteSizeStr(value)}
            {hasMore && <span className="modal-load-pct"> · {loadedPct}% 표시됨</span>}
          </span>
          <div className="modal-fmt-group">
            {FORMAT_MODES.map((m) => (
              <button
                key={m}
                className={`modal-fmt-btn${fmt === m ? " active" : ""}`}
                onClick={() => setFmt(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div ref={bodyRef} className="modal-body">
          <pre className="modal-pre">{displayed}</pre>
          {hasMore && <div ref={sentinelRef} className="modal-sentinel">불러오는 중…</div>}
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
  const [colWidths, setColWidths] = useState<Record<number, number> | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // Sync mutable refs with latest props
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  // Reset when result changes (new table opened or new SQL run)
  useEffect(() => {
    setColWidths(null);
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

  function startResize(e: React.MouseEvent, dataColIdx: number) {
    e.preventDefault();
    let widths = colWidths;
    if (!widths) {
      const cells = tableRef.current?.querySelectorAll("thead th");
      const captured: Record<number, number> = {};
      cells?.forEach((cell, i) => {
        if (i > 0) captured[i - 1] = (cell as HTMLElement).offsetWidth;
      });
      widths = captured;
      setColWidths(widths);
    }
    const startX = e.clientX;
    const startW = widths[dataColIdx] ?? 160;

    function onMove(ev: MouseEvent) {
      setColWidths((prev) => ({
        ...prev!,
        [dataColIdx]: Math.max(40, startW + ev.clientX - startX),
      }));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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

      <table
        ref={tableRef}
        className="data-grid"
        style={colWidths ? { tableLayout: "fixed", minWidth: "100%" } : undefined}
      >
        {colWidths && (
          <colgroup>
            <col style={{ width: 40 }} />
            {result.columns.map((_, i) => (
              <col key={i} style={{ width: colWidths[i] ?? 160 }} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr>
            <th className="row-index">#</th>
            {result.columns.map((col, i) => (
              <th key={i} title={col}>
                <span className="col-label">{col}</span>
                <div className="col-resize-handle" onMouseDown={(e) => startResize(e, i)} />
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
