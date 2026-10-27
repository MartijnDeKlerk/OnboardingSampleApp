// Minimal RFC 4180-style CSV parser: quoted fields, escaped quotes ("") and
// embedded commas/newlines inside quotes. Handles CRLF/LF and a leading BOM.
// Returns an array of rows, each an array of raw string fields. Blank lines are skipped.
// Import previews opt into strict quoting and physical-line/raw-record metadata.
// Existing profiling callers keep the original array-of-rows interface.
function parseCsv(text, { strict = false, info = false } = {}) {
  const input = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  let line = 1;
  let start = 0;
  let closedQuote = false;

  const fail = message => {
    const error = new Error(`${message} at line ${line}.`);
    error.lines = line;
    throw error;
  };

  const endField = () => { row.push(field); field = ''; closedQuote = false; };
  const endRow = end => {
    endField();
    if (!(row.length === 1 && row[0].trim() === '')) {
      rows.push(info ? { record: row, raw: input.slice(start, end), info: { lines: line } } : row);
    }
    row = [];
    start = end;
  };

  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; closedQuote = true; i += 1; continue;
      }
      if (ch === '\n' || (ch === '\r' && input[i + 1] !== '\n')) line += 1;
      field += ch; i += 1; continue;
    }
    if (strict && closedQuote && ![',', '\r', '\n'].includes(ch)) fail('Unexpected character after a closing quote');
    if (ch === '"' && field.trim() === '') {
      if (strict && field !== '') fail('Unexpected whitespace before an opening quote');
      field = ''; inQuotes = true; i += 1; continue;
    }
    if (strict && ch === '"') fail('Unexpected quote inside an unquoted field');
    if (ch === ',') { endField(); i += 1; continue; }
    if (ch === '\r' && input[i + 1] === '\n') { endRow(i + 2); line += 1; i += 2; continue; }
    if (ch === '\n' || ch === '\r') { endRow(i + 1); line += 1; i += 1; continue; }
    field += ch; i += 1;
  }
  if (strict && inQuotes) fail('Unclosed quoted field');
  if (field !== '' || row.length) endRow(i);
  return rows;
}

function stringifyCsv(rows) {
  if (!rows.length) return '';
  return rows.map(row => row.map(value => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(',')).join('\n') + '\n';
}

// Turns parsed rows into records keyed by header, with a 1-based data row number.
//
// Rows with more fields than the header usually contain an unquoted comma. The
// overflow is only repaired when the caller says it belongs to the last column:
// `mergeInto` must name the last header, and `acceptMerge(mergedValue)` (if
// given) must accept the merged value. The repair is reported as a warning.
// Any other overflow is reported as an error and the row is marked `malformed`:
// only its first column (the row identifier) is kept, so values are never
// silently shifted into the wrong columns.
// Rows with fewer fields than the header are padded with blanks and warned about.
// `fieldFor(header)` maps a source column name to the field name used in issues.
function toRecords(rows, { file, fieldFor = h => h, mergeInto, acceptMerge = () => true } = {}) {
  const [rawHeader = [], ...dataRows] = rows;
  const header = rawHeader.map(h => h.trim());
  const issues = [];
  const records = dataRows.map((fields, index) => {
    const row = index + 1;
    let values = fields;
    if (fields.length > header.length && header.length) {
      const last = header.length - 1;
      const merged = fields.slice(last).join(',').trim();
      if (mergeInto && mergeInto === header[last] && acceptMerge(merged)) {
        values = [...fields.slice(0, last), merged];
        issues.push({
          file, row, field: fieldFor(header[last]), severity: 'warning',
          message: `Row has ${fields.length} values for ${header.length} columns (unquoted comma in "${header[last]}"); the extra values were merged back into it as "${merged}". Quote this field in the source file.`
        });
      } else {
        issues.push({
          file, row, field: '', severity: 'error',
          message: `Row has ${fields.length} values for ${header.length} columns (likely an unquoted comma inside a field). The columns cannot be matched reliably, so this row was not imported. Quote the field in the source file.`
        });
        const record = Object.fromEntries(header.map((h, i) => [h, i === 0 ? (fields[0] ?? '').trim() : '']));
        return { row, values: record, malformed: true };
      }
    } else if (fields.length < header.length) {
      issues.push({
        file, row, field: fieldFor(header[fields.length]), severity: 'warning',
        message: `Row has ${fields.length} values for ${header.length} columns; missing values were left blank.`
      });
    }
    const record = {};
    header.forEach((h, i) => { record[h] = (values[i] ?? '').trim(); });
    return { row, values: record };
  });
  return { header, records, issues };
}

module.exports = { parseCsv, toRecords, stringifyCsv };
