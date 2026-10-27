// Picklist and value normalisation. Mappings follow sample-data/README.md.
// Each picklist normaliser returns the canonical value, or null when the
// source value is not recognised (callers keep the raw value and flag it).

const key = value => String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, ' ');

function lookup(table, value) {
  return Object.prototype.hasOwnProperty.call(table, key(value)) ? table[key(value)] : null;
}

const ENTITY_TYPES = {
  corporation: 'Corporation', corp: 'Corporation', 'limited company': 'Corporation', ltd: 'Corporation',
  's-corporation': 'S-Corporation', 's corporation': 'S-Corporation', scorp: 'S-Corporation', 's-corp': 'S-Corporation',
  llc: 'LLC', llp: 'LLC',
  partnership: 'Partnership', part: 'Partnership',
  'sole proprietorship': 'Sole Proprietor', 'sole proprietor': 'Sole Proprietor', sole: 'Sole Proprietor', 'sole trader': 'Sole Proprietor',
  'non-profit': 'Non-Profit', nonprofit: 'Non-Profit', nprof: 'Non-Profit'
};

const CLIENT_STATUSES = {
  active: 'Active', a: 'Active',
  inactive: 'Inactive', i: 'Inactive', dormant: 'Inactive',
  pending: 'Pending', p: 'Pending', suspended: 'Pending'
};

// Contacts only distinguish Active/Inactive; anything not active (pending,
// suspended, dormant) is treated as Inactive.
const CONTACT_STATUSES = {
  active: 'Active', y: 'Active', yes: 'Active', true: 'Active', 1: 'Active',
  inactive: 'Inactive', n: 'Inactive', no: 'Inactive', false: 'Inactive', 0: 'Inactive',
  dormant: 'Inactive', suspended: 'Inactive', pending: 'Inactive', p: 'Inactive'
};

// XYZ Financial Services uses sector codes instead of industry names.
const INDUSTRY_CODES = {
  tech: 'Technology', fins: 'Financial Services', svcs: 'Services', engr: 'Engineering',
  media: 'Media', trans: 'Transportation', hlth: 'Healthcare', hosp: 'Hospitality',
  cons: 'Consulting', mfgr: 'Manufacturing'
};

const normaliseEntityType = value => lookup(ENTITY_TYPES, value);
const normaliseClientStatus = value => lookup(CLIENT_STATUSES, value);
const normaliseContactStatus = value => lookup(CONTACT_STATUSES, value);

function normaliseIndustry(value) {
  const raw = String(value ?? '').trim();
  return lookup(INDUSTRY_CODES, raw) ?? raw;
}

// "NET30" / "30 Days" -> "Net 30"; "COD" / "Immediate" -> "Due on Receipt".
function normalisePaymentTerms(value) {
  const raw = String(value ?? '').trim();
  if (/^(cod|immediate|due on receipt)$/i.test(raw)) return 'Due on Receipt';
  const days = /^net\s*(\d+)$/i.exec(raw) || /^(\d+)\s*days?$/i.exec(raw);
  return days ? `Net ${Number(days[1])}` : raw;
}

// "Williams, Robert" -> "Robert Williams"; other names are trimmed and kept.
function normalisePersonName(value) {
  const raw = String(value ?? '').trim().replace(/\s+/g, ' ');
  const parts = raw.split(',').map(p => p.trim());
  return parts.length === 2 && parts[0] && parts[1] ? `${parts[1]} ${parts[0]}` : raw;
}

// "1,250,000.00", "$850000", "£285000" -> number; blank -> null; junk -> NaN.
function parseAmount(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[$£€,\s]/g, '');
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = value => EMAIL_PATTERN.test(String(value ?? '').trim());

module.exports = {
  normaliseEntityType, normaliseClientStatus, normaliseContactStatus, normaliseIndustry,
  normalisePaymentTerms, normalisePersonName, parseAmount, isValidEmail
};
