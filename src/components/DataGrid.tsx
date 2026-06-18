import { useEffect, useRef, useState } from "react";
import type { Cell, QueryResult } from "../api";

type MenuState = { x: number; y: number; rowIdx: number; colIdx: number };

function cellText(v: Cell): string {
  return v === null ? "" : String(v);
}

function renderCell(value: Cell) {
  if (value === null) return <span className="cell-null">NULL</span>;
  return String(value);
}

export default function DataGrid({ result }: { result: QueryResult }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  function openMenu(e: React.MouseEvent, rowIdx: number, colIdx: number) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, rowIdx, colIdx });
  }

  function copyCell() {
    if (!menu) return;
    navigator.clipboard.writeText(cellText(result.rows[menu.rowIdx]?.[menu.colIdx] ?? null));
    setMenu(null);
  }

  function copyRecord() {
    if (!menu) return;
    navigator.clipboard.writeText((result.rows[menu.rowIdx] ?? []).map(cellText).join("\t"));
    setMenu(null);
  }

  function copyPage() {
    navigator.clipboard.writeText(
      result.rows.map((row) => row.map(cellText).join("\t")).join("\n"),
    );
    setMenu(null);
  }

  function copyAll() {
    const header = result.columns.join("\t");
    const body = result.rows.map((row) => row.map(cellText).join("\t")).join("\n");
    navigator.clipboard.writeText(body ? header + "\n" + body : header);
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
          <button onClick={copyPage}>현재 페이지 복사</button>
          <button onClick={copyAll}>헤더 포함 전체 복사</button>
        </div>
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
        <tbody>
          {result.rows.map((row, ri) => (
            <tr key={ri}>
              <td className="row-index">{ri + 1}</td>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  title={cell === null ? "NULL" : String(cell)}
                  onContextMenu={(e) => openMenu(e, ri, ci)}
                >
                  {renderCell(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length === 0 && <div className="grid-empty">No rows.</div>}
    </div>
  );
}
