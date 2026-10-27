// Column-name and date-format detection for the customer sample-data CSVs.
// Aliases come from the schema mapping table in sample-data/README.md.

// Lowercase and strip everything but letters/digits, so "Client ID",
// "clientId" and "client_id" all compare equal.
function headerKey(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

const CLIENT_FIELDS = {
  id: ['Client ID', 'clientCode', 'customer_id'],
  name: ['Client Name', 'companyName', 'business_name'],
  entityType: ['Business Type', 'entityType', 'legal_structure'],
  status: ['Status', 'clientStatus', 'account_status'],
  startDate: ['Date Onboarded', 'startDate', 'registration_date'],
  taxId: ['Tax ID', 'federalTaxId', 'tax_reference'],
  annualRevenue: ['Annual Revenue', 'yearlyRevenue', 'gross_revenue'],
  industry: ['Industry', 'sectorCode', 'industry_sector'],
  paymentTerms: ['Payment Terms', 'billingTerms', 'credit_terms'],
  primaryContact: ['Primary Contact', 'mainContact', 'key_contact_name']
};

const CONTACT_FIELDS = {
  id: ['Contact ID', 'contactId', 'contact_ref'],
  clientId: ['Client ID', 'clientCode', 'customer_id'],
  firstName: ['First Name', 'firstName', 'given_name'],
  lastName: ['Last Name', 'lastName', 'family_name'],
  email: ['Email', 'emailAddress', 'email'],
  phone: ['Phone', 'phoneNumber', 'telephone'],
  role: ['Role', 'jobTitle', 'position'],
  status: ['Status', 'isActive', 'contact_status']
};

// Returns { [canonicalField]: sourceHeader | undefined } for the given header row.
function mapColumns(header, fields) {
  const byKey = new Map(header.map(h => [headerKey(h), h]));
  const mapping = {};
  for (const [field, aliases] of Object.entries(fields)) {
    mapping[field] = aliases.map(a => byKey.get(headerKey(a))).find(Boolean);
  }
  return mapping;
}

// "Title Case" (words separated by spaces), "snake_case" or "camelCase",
// decided by majority vote across the header names.
function detectSchemaStyle(headers) {
  const votes = { 'Title Case': 0, snake_case: 0, camelCase: 0 };
  for (const h of headers) {
    if (/\s/.test(h.trim())) votes['Title Case'] += 1;
    else if (/_/.test(h)) votes.snake_case += 1;
    else if (/^[a-z][a-z0-9]*[A-Z]/.test(h)) votes.camelCase += 1;
    else if (/^[A-Z]/.test(h)) votes['Title Case'] += 1;
  }
  return Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
}

const DATE_PATTERNS = {
  'YYYY-MM-DD': /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  'MM/DD/YYYY': /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  'DD-MM-YYYY': /^(\d{1,2})-(\d{1,2})-(\d{4})$/
};

function toIso(year, month, day) {
  const y = Number(year), m = Number(month), d = Number(day);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Parses a date in the given format to ISO YYYY-MM-DD, or null if it does not
// match the format or is not a real calendar date.
function parseDate(value, format) {
  const match = DATE_PATTERNS[format]?.exec(String(value ?? '').trim());
  if (!match) return null;
  if (format === 'YYYY-MM-DD') return toIso(match[1], match[2], match[3]);
  if (format === 'MM/DD/YYYY') return toIso(match[3], match[1], match[2]);
  return toIso(match[3], match[2], match[1]);
}

// Picks the format that parses the most of the given (non-empty) values.
// Defaults to ISO when nothing parses.
function detectDateFormat(values) {
  const samples = values.map(v => String(v ?? '').trim()).filter(Boolean);
  let best = 'YYYY-MM-DD';
  let bestScore = 0;
  for (const format of Object.keys(DATE_PATTERNS)) {
    const score = samples.filter(v => parseDate(v, format)).length;
    if (score > bestScore) { best = format; bestScore = score; }
  }
  return best;
}

module.exports = {
  CLIENT_FIELDS, CONTACT_FIELDS, headerKey, mapColumns, detectSchemaStyle, detectDateFormat, parseDate
};
