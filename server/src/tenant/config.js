/**
 * Tenant configuration: suggestions derived from Customer Info, and validation.
 * Pure functions — no store access — so they are easy to unit test.
 */

const PLANS = ['starter', 'professional', 'enterprise'];
const DATA_REGIONS = ['EU', 'US'];
const CURRENCIES = ['GBP', 'EUR', 'USD'];
const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const RESERVED_SUBDOMAINS = ['admin', 'api', 'www', 'test', 'app', 'mail', 'support'];
const CONFIG_FIELDS = ['plan', 'subdomain', 'dataRegion', 'currency', 'dateFormat', 'adminEmail'];
const SUBDOMAIN_MIN = 3;
const SUBDOMAIN_MAX = 40;
const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UK_TERMS = ['uk', 'u.k.', 'united kingdom', 'great britain', 'britain', 'gb', 'england', 'scotland', 'wales', 'northern ireland'];
const EUROPE_TERMS = [
  'europe', 'european', 'eu', 'emea', 'eea', 'ireland', 'germany', 'france', 'netherlands', 'belgium', 'luxembourg',
  'spain', 'portugal', 'italy', 'austria', 'switzerland', 'denmark', 'sweden', 'norway', 'finland', 'iceland',
  'poland', 'czechia', 'czech republic', 'slovakia', 'hungary', 'greece', 'romania', 'bulgaria', 'croatia',
  'slovenia', 'estonia', 'latvia', 'lithuania', 'malta', 'cyprus', 'dach', 'benelux', 'nordics'
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentions(text, terms) {
  return terms.some(term => new RegExp(`(^|[^a-z])${escapeRegExp(term)}([^a-z]|$)`).test(text));
}

/** Classifies a free-text customer region as 'uk', 'europe' or 'other'. */
function classifyRegion(region) {
  const text = typeof region === 'string' ? region.trim().toLowerCase() : '';
  if (!text) return 'other';
  if (mentions(text, UK_TERMS)) return 'uk';
  if (mentions(text, EUROPE_TERMS)) return 'europe';
  return 'other';
}

/** Lowercase a-z0-9 and hyphens, 3–40 characters. */
function slugify(name) {
  const base = String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SUBDOMAIN_MAX)
    .replace(/-+$/g, '');
  if (!base) return 'tenant';
  return base.length < SUBDOMAIN_MIN ? `${base}-tenant` : base;
}

/** Returns a slug that is neither reserved nor in `takenSubdomains`, adding -2, -3… when needed. */
function uniqueSubdomain(name, takenSubdomains = []) {
  const taken = new Set(takenSubdomains);
  const base = slugify(name);
  const free = candidate => !taken.has(candidate) && !RESERVED_SUBDOMAINS.includes(candidate);
  if (free(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, SUBDOMAIN_MAX - suffix.length).replace(/-+$/g, '')}${suffix}`;
    if (free(candidate)) return candidate;
  }
}

/** Suggested tenant configuration for a customer. */
function suggestTenantConfig(customer, takenSubdomains = []) {
  const kind = classifyRegion(customer?.region);
  const european = kind !== 'other';
  return {
    plan: 'professional',
    subdomain: uniqueSubdomain(customer?.name, takenSubdomains),
    dataRegion: european ? 'EU' : 'US',
    currency: kind === 'uk' ? 'GBP' : kind === 'europe' ? 'EUR' : 'USD',
    dateFormat: european ? 'DD/MM/YYYY' : 'MM/DD/YYYY',
    adminEmail: customer?.contactEmail || ''
  };
}

/**
 * Validates and normalises tenant configuration input.
 * @param {unknown} input request body
 * @param {{ isSubdomainTaken?: (subdomain: string) => boolean }} options
 * @returns {{ config: Record<string, string>, errors: Record<string, string> }}
 */
function validateTenantConfig(input, { isSubdomainTaken = () => false } = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const config = {};
  const errors = {};

  for (const field of CONFIG_FIELDS) {
    const value = source[field];
    if (value != null && typeof value !== 'string') errors[field] = 'Enter text for this field.';
    config[field] = typeof value === 'string' ? value.trim() : '';
  }
  config.subdomain = config.subdomain.toLowerCase();

  const choose = (field, allowed, message) => {
    if (!errors[field] && !allowed.includes(config[field])) errors[field] = message;
  };
  choose('plan', PLANS, 'Choose a plan: starter, professional or enterprise.');
  choose('dataRegion', DATA_REGIONS, 'Choose a data region: EU or US.');
  choose('currency', CURRENCIES, 'Choose a currency: GBP, EUR or USD.');
  choose('dateFormat', DATE_FORMATS, 'Choose a supported date format.');

  if (!errors.subdomain) {
    const subdomain = config.subdomain;
    if (!subdomain) errors.subdomain = 'Enter a subdomain.';
    else if (subdomain.length < SUBDOMAIN_MIN || subdomain.length > SUBDOMAIN_MAX) {
      errors.subdomain = `Use ${SUBDOMAIN_MIN}–${SUBDOMAIN_MAX} characters.`;
    } else if (!SUBDOMAIN_PATTERN.test(subdomain)) {
      errors.subdomain = 'Use lowercase letters, numbers and hyphens only, starting and ending with a letter or number.';
    } else if (RESERVED_SUBDOMAINS.includes(subdomain)) {
      errors.subdomain = `"${subdomain}" is reserved. Choose a different subdomain.`;
    } else if (isSubdomainTaken(subdomain)) {
      errors.subdomain = `"${subdomain}" is already used by another tenant. Choose a different subdomain.`;
    }
  }

  if (!errors.adminEmail && (config.adminEmail.length > 254 || !EMAIL_PATTERN.test(config.adminEmail))) {
    errors.adminEmail = 'Enter a valid admin email.';
  }

  return { config, errors };
}

function sameConfig(tenant, config) {
  return CONFIG_FIELDS.every(field => tenant?.[field] === config[field]);
}

module.exports = {
  PLANS,
  DATA_REGIONS,
  CURRENCIES,
  DATE_FORMATS,
  RESERVED_SUBDOMAINS,
  CONFIG_FIELDS,
  classifyRegion,
  slugify,
  uniqueSubdomain,
  suggestTenantConfig,
  validateTenantConfig,
  sameConfig
};
