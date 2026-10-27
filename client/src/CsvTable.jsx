import React, { useMemo, useState } from 'react';

const INITIAL_ROWS = 50;
const NUMBER = /^-?\d+(\.\d+)?$/;
// Target fields holding identifiers render in monospace so codes line up.
export const ID_FIELD = /^id$|Id$|^reference$/;

// Lenient RFC 4180-style parser for display: quoted fields, escaped quotes (""),
// embedded commas/newlines, CRLF/LF and a leading BOM. Blank lines are skipped.
// Each record keeps its first and last physical line (1-based, header = line 1),
// which is how the server reports repairs and errors.
export function parseCsv(text) {
  const input = String(text ?? '').replace(/^﻿/, '');
  const records = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let startLine = 1;
  const endField = () => { row.push(field); field = ''; };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0].trim() === '')) records.push({ cells: row, startLine, line });
    row = [];
  };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
        continue;
      }
      if (ch === '\n' || (ch === '\r' && input[i + 1] !== '\n')) line++;
      field += ch;
      continue;
    }
    if (ch === '"' && field.trim() === '') { field = ''; inQuotes = true; continue; }
    if (ch === ',') { endField(); continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      endRow();
      line++;
      startLine = line;
      continue;
    }
    field += ch;
  }
  if (field !== '' || row.length) endRow();
  const [header, ...rows] = records;
  return { headers: header?.cells || [], rows };
}

function isNumericColumn(rows, index) {
  let seen = 0;
  for (const { cells } of rows) {
    const value = (cells[index] ?? '').trim();
    if (!value) continue;
    if (!NUMBER.test(value) || /^-?0\d/.test(value)) return false;
    seen++;
  }
  return seen > 0;
}

// The CSV as loaded, as a readable table. With `analysis` (the last preview of
// this exact CSV) it also shows the target field per column, flags rows with
// proposed repairs or errors, and tags picklist values that map to another value.
export default function CsvTable({ csv, fileName, analysis, fields = [], mapping, overrides }) {
  const [showAll, setShowAll] = useState(false);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const { headers, rows } = useMemo(() => parseCsv(csv), [csv]);

  const fieldByHeader = useMemo(() => {
    const byKey = new Map(fields.map(field => [field.key, field]));
    return new Map(Object.entries(mapping || {}).filter(([key, header]) => header && byKey.has(key)).map(([key, header]) => [header, byKey.get(key)]));
  }, [fields, mapping]);

  const issuesByLine = useMemo(() => {
    const issues = new Map();
    const add = (line, kind, message) => {
      if (!line || line === 1) return;
      const entry = issues.get(line) || { kind, messages: [] };
      if (kind === 'error') entry.kind = 'error';
      entry.messages.push(message);
      issues.set(line, entry);
    };
    for (const repair of analysis?.repairs || []) add(repair.line, 'repair', `Proposed repair: ${repair.reason}`);
    for (const error of analysis?.errors || []) add(error.line, 'error', `Error: ${error.message}`);
    return issues;
  }, [analysis]);

  const valuesByHeader = useMemo(() => {
    const result = new Map();
    for (const group of analysis?.valueMappings || []) {
      const header = mapping?.[group.field];
      if (!header) continue;
      const targets = new Map();
      for (const value of group.values) {
        const override = overrides?.[group.field]?.[value.source];
        targets.set(value.source, override ?? value.target ?? null);
      }
      result.set(header, targets);
    }
    return result;
  }, [analysis, mapping, overrides]);

  const columnCount = Math.max(headers.length, ...rows.map(row => row.cells.length));
  const columns = Array.from({ length: columnCount }, (_, index) => {
    const header = headers[index];
    const field = header !== undefined ? fieldByHeader.get(header) : undefined;
    const numeric = field ? field.type === 'number' : isNumericColumn(rows, index);
    return { index, header, field, numeric, mono: !!field && ID_FIELD.test(field.key), values: header !== undefined ? valuesByHeader.get(header) : undefined };
  });

  if (!headers.length) return <p className="session-note csv-empty">No rows to show yet. Paste CSV text or load a file.</p>;

  const flagged = rows.filter(row => issuesByLine.has(row.line));
  const filtered = onlyFlagged && flagged.length ? flagged : rows;
  const visible = showAll ? filtered : filtered.slice(0, INITIAL_ROWS);

  return <div className="csv-table-wrap">
    <div className="csv-table-meta">
      <span><strong>{fileName}</strong> · {rows.length} {rows.length === 1 ? 'row' : 'rows'} · {headers.length} columns</span>
      {!!flagged.length && <label className="csv-filter">
        <input type="checkbox" checked={onlyFlagged} onChange={event => setOnlyFlagged(event.target.checked)} />
        Only rows with issues ({flagged.length})
      </label>}
    </div>
    <div className="table-scroll csv-scroll" role="region" aria-label="Source data" tabIndex={0}>
      <table className="data-table csv-table" data-testid="csv-table">
        <thead><tr>
          <th scope="col" className="csv-line">Line</th>
          {columns.map(column => <th scope="col" key={column.index} className={column.numeric ? 'csv-numeric' : undefined}>
            <span className="csv-header">{column.header ?? <em>(extra column)</em>}</span>
            {analysis && <span className={column.field ? 'csv-target' : 'csv-target csv-target-none'}>
              {column.field ? `→ ${column.field.label}` : 'Not mapped'}
            </span>}
          </th>)}
        </tr></thead>
        <tbody>{visible.map(row => {
          const issue = issuesByLine.get(row.line);
          const title = issue?.messages.join('\n');
          return <tr key={row.line} className={issue ? `csv-row-${issue.kind}` : undefined} title={title} data-line={row.line}>
            <th scope="row" className="csv-line">
              {row.startLine === row.line ? row.line : `${row.startLine}–${row.line}`}
              {issue && <span className={`csv-flag ${issue.kind}`}>{issue.kind === 'error' ? 'Error' : 'Repair'}</span>}
            </th>
            {columns.map(column => {
              const value = row.cells[column.index] ?? '';
              const trimmed = value.trim();
              const target = column.values && trimmed ? column.values.get(trimmed) : undefined;
              const className = [column.numeric && 'csv-numeric', column.mono && 'csv-mono', column.index >= headers.length && 'csv-extra'].filter(Boolean).join(' ') || undefined;
              return <td key={column.index} className={className}>
                {value === '' ? <span className="csv-blank" aria-label="blank">—</span> : value}
                {target === null && <span className="value-tag missing" title="This value still needs a target">unmapped</span>}
                {target && target !== trimmed && <span className="value-tag" title={`Imports as ${target}`}>→ {target}</span>}
              </td>;
            })}
          </tr>;
        })}</tbody>
      </table>
    </div>
    {filtered.length > INITIAL_ROWS && <div className="csv-table-footer">
      <span>Showing {visible.length} of {filtered.length} rows</span>
      <button type="button" className="text-button" onClick={() => setShowAll(value => !value)}>{showAll ? `Show first ${INITIAL_ROWS}` : 'Show all'}</button>
    </div>}
  </div>;
}
