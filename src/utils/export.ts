import type { Cell } from "../api";

function csvEscape(v: Cell): string {
  const s = v === null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCSV(columns: string[], rows: Cell[][]): string {
  const header = columns.map(csvEscape).join(",");
  const body = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  return body.length ? header + "\n" + body : header;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xmlTag(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9_\-.]/g, "_");
  return /^[0-9\-.]/.test(safe) ? "_" + safe : safe || "_col";
}

export function toXML(columns: string[], rows: Cell[][]): string {
  const tags = columns.map(xmlTag);
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', "<records>"];
  for (const row of rows) {
    lines.push("  <record>");
    for (let i = 0; i < tags.length; i++) {
      const val = row[i] === null ? "" : xmlEscape(String(row[i]));
      lines.push(`    <${tags[i]}>${val}</${tags[i]}>`);
    }
    lines.push("  </record>");
  }
  lines.push("</records>");
  return lines.join("\n");
}
