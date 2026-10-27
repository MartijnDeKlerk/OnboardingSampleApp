const { parseCsv, toRecords, stringifyCsv } = require('../profile/csv');
const { parseDate } = require('../profile/schema');
const { schemas, normalizeHeader, detectSource } = require('./schemas');

const MAX_BYTES = 500000;
const MAX_ROWS = 5000;

function proposeRepair(headers, record, allRecords) {
  const xyzHeaders = schemas.clients.fields.map(field => field.aliases[1]);
  if (JSON.stringify(headers) === JSON.stringify(xyzHeaders) && record.length === headers.length + 1) {
    const namePart = /^[\p{L}][\p{L}\p{M}' .-]*$/u;
    if (namePart.test(record[9].trim()) && namePart.test(record[10].trim())) {
      const merged = toRecords([headers, record], { mergeInto: 'mainContact' }).records[0].values.mainContact;
      return { record: [...record.slice(0, 9), merged], field: 'mainContact', reason: 'Join the surname and first name in the known XYZ contact column.' };
    }
  }

  const abcHeaders = schemas.accounts.fields.map(field => field.aliases[0]);
  if (JSON.stringify(headers) === JSON.stringify(abcHeaders) && record.length > headers.length &&
      ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'].includes(record[2]) &&
      ['Debit', 'Credit'].includes(record[4]) && ['Active', 'Inactive'].includes(record[5])) {
    const parent = record.at(-1);
    if (!parent || allRecords.some(row => row.record[0] === parent)) {
      return { record: [...record.slice(0, 6), record.slice(6, -1).join(','), parent], field: 'Description', reason: 'Join the unquoted description before the recognized parent account.' };
    }
  }
  return null;
}

function repairCsv(csv) {
  const result = { headers: [], rows: [], lines: [], repairs: [], errors: [], correctedCsv: null, totalRows: 0 };
  if (typeof csv !== 'string' || !csv.trim()) {
    result.errors.push({ line: null, message: 'Choose a CSV file or paste CSV text.' });
    return result;
  }
  if (Buffer.byteLength(csv, 'utf8') > MAX_BYTES) {
    result.errors.push({ line: null, message: 'The CSV must be 500 KB or smaller.' });
    return result;
  }
  let records;
  try {
    records = parseCsv(csv, { strict: true, info: true });
  } catch (error) {
    result.errors.push({ line: error.lines || null, message: `Invalid CSV quoting: ${error.message}` });
    return result;
  }
  if (!records.length) {
    result.errors.push({ line: null, message: 'The CSV is empty.' });
    return result;
  }
  result.headers = records.shift().record;
  result.totalRows = records.length;
  const normalizedHeaders = result.headers.map(normalizeHeader);
  if (normalizedHeaders.some(header => !header) || new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    result.errors.push({ line: 1, message: 'Column names must be nonempty and unique.' });
    return result;
  }
  if (!records.length || records.length > MAX_ROWS) {
    result.errors.push({ line: null, message: `Provide between 1 and ${MAX_ROWS} data rows.` });
    return result;
  }
  for (const entry of records) {
    let record = entry.record;
    if (record.length !== result.headers.length) {
      const repair = proposeRepair(result.headers, record, records);
      if (!repair) {
        result.errors.push({ line: entry.info.lines, message: `Expected ${result.headers.length} columns, found ${record.length}. No reliable repair rule matches; correct this row in the source file.`, original: entry.raw.trimEnd() });
        continue;
      }
      record = repair.record;
      result.repairs.push({ line: entry.info.lines, field: repair.field, reason: repair.reason, original: entry.raw.trimEnd(), corrected: stringifyCsv([record]).trimEnd() });
    }
    result.rows.push(record);
    result.lines.push(entry.info.lines);
  }
  if (!result.errors.length) result.correctedCsv = stringifyCsv([result.headers, ...result.rows]);
  return result;
}

function normalizeDate(value, format) {
  const formats = { YMD: 'YYYY-MM-DD', MDY: 'MM/DD/YYYY', DMY: 'DD-MM-YYYY' };
  const source = format === 'DMY' ? value.replace(/\//g, '-') : format === 'MDY' ? value.replace(/-/g, '/') : value;
  const normalized = parseDate(source, formats[format]);
  return normalized && Number(normalized.slice(0, 4)) >= 1000 ? normalized : null;
}

function analyzeCsv({ csv, datasetType, mapping: requestedMapping, dateFormat = 'auto' } = {}) {
  const repaired = repairCsv(csv);
  const { rows, lines, ...result } = repaired;
  result.datasetType = datasetType;
  result.mapping = {};
  result.preview = [];
  result.mappedCsv = null;
  result.normalizedDates = 0;
  result.unmappedHeaders = [];
  const schema = typeof datasetType === 'string' && Object.hasOwn(schemas, datasetType) ? schemas[datasetType] : null;
  if (!schema) {
    result.errors.push({ line: null, message: 'Choose a supported data type.' });
    return result;
  }
  if (!repaired.headers.length || repaired.errors.length) return result;
  if (requestedMapping != null && (typeof requestedMapping !== 'object' || Array.isArray(requestedMapping))) {
    result.errors.push({ line: null, message: 'The column mapping must be an object.' });
    return result;
  }
  for (const field of schema.fields) {
    const aliases = [field.key, ...field.aliases].map(normalizeHeader);
    const matches = repaired.headers.filter(header => aliases.includes(normalizeHeader(header)));
    const source = requestedMapping ? requestedMapping[field.key] || '' : matches.length === 1 ? matches[0] : '';
    result.mapping[field.key] = source;
    if (typeof source !== 'string' || (source && !repaired.headers.includes(source))) {
      result.errors.push({ line: 1, message: `Choose an existing source column for ${field.label}.` });
    } else if (field.required && !source) {
      result.errors.push({ line: 1, message: `Map the required field: ${field.label}.` });
    }
  }
  const assigned = Object.values(result.mapping).filter(Boolean);
  if (new Set(assigned).size !== assigned.length) result.errors.push({ line: 1, message: 'Each source column can be assigned only once.' });
  result.unmappedHeaders = repaired.headers.filter(header => !assigned.includes(header));
  const source = detectSource(repaired.headers, schema);
  result.detectedSource = source === undefined ? 'Custom schema' : ['ABC Accounting', 'XYZ Financial Services', 'Premier Bookkeeping'][source];
  result.dateFormat = dateFormat === 'auto' ? source === undefined ? 'YMD' : ['MDY', 'YMD', 'DMY'][source] : dateFormat;
  if (!['YMD', 'MDY', 'DMY'].includes(result.dateFormat)) {
    result.errors.push({ line: null, message: 'Choose a supported date format.' });
  }
  if (result.errors.length) return result;

  const ids = new Set();
  const mappedRows = rows.map((row, index) => Object.fromEntries(schema.fields.map(field => {
    const sourceColumn = result.mapping[field.key];
    let value = sourceColumn ? row[repaired.headers.indexOf(sourceColumn)].trim() : '';
    if (field.required && !value) result.errors.push({ line: lines[index], message: `${field.label} is required.` });
    if (value && field.type === 'date') {
      const normalized = normalizeDate(value, result.dateFormat);
      if (!normalized) result.errors.push({ line: lines[index], message: `Invalid ${field.label.toLowerCase()}: ${value}. Check the date format setting.` });
      else {
        if (normalized !== value) result.normalizedDates++;
        value = normalized;
      }
    }
    if (value && field.type === 'number' && !/^-?\d+(\.\d+)?$/.test(value)) {
      result.errors.push({ line: lines[index], message: `Invalid ${field.label.toLowerCase()}: ${value}. Use a decimal point and no thousands separators.` });
    }
    if (field.key === 'id' && value) {
      if (ids.has(value)) result.errors.push({ line: lines[index], message: `Duplicate ID: ${value}.` });
      ids.add(value);
    }
    return [field.key, value];
  })));
  result.preview = mappedRows.slice(0, 10);
  if (!result.errors.length) result.mappedCsv = stringifyCsv([
    schema.fields.map(field => field.key), ...mappedRows.map(row => schema.fields.map(field => row[field.key]))
  ]);
  return result;
}

module.exports = { repairCsv, analyzeCsv, normalizeDate, MAX_BYTES };
