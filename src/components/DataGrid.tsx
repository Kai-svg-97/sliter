import type { Cell, QueryResult } from "../api";

function renderCell(value: Cell) {
  if (value === null) {
    return <span className="cell-null">NULL</span>;
  }
  return String(value);
}

export default function DataGrid({ result }: { result: QueryResult }) {
  if (result.columns.length === 0) {
    return null;
  }
  return (
    <div className="grid-wrap">
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
                <td key={ci} title={cell === null ? "NULL" : String(cell)}>
                  {renderCell(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length === 0 && (
        <div className="grid-empty">No rows.</div>
      )}
    </div>
  );
}
