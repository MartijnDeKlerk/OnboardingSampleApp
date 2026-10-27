const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classifyRegion, slugify, uniqueSubdomain, suggestTenantConfig, validateTenantConfig, sameConfig } = require('./config');

const VALID = { plan: 'starter', subdomain: 'abc-accounting', dataRegion: 'EU', currency: 'GBP', dateFormat: 'DD/MM/YYYY', adminEmail: 'admin@abc.example' };

describe('tenant config suggestions', () => {
  it('classifies UK, European and other regions', () => {
    for (const region of ['UK', 'United Kingdom', 'London, England', 'GB']) assert.equal(classifyRegion(region), 'uk', region);
    for (const region of ['Europe', 'EMEA', 'Germany', 'EU - Netherlands']) assert.equal(classifyRegion(region), 'europe', region);
    for (const region of ['North America', 'US', 'APAC', '', null]) assert.equal(classifyRegion(region), 'other', String(region));
  });

  it('slugifies names to lowercase a-z0-9 and hyphens within 3–40 characters', () => {
    assert.equal(slugify('Acme Corporation'), 'acme-corporation');
    assert.equal(slugify('  Smith & Sons, Ltd. '), 'smith-and-sons-ltd');
    assert.equal(slugify('Café Zürich'), 'cafe-zurich');
    assert.equal(slugify('AB'), 'ab-tenant');
    assert.equal(slugify('!!!'), 'tenant');
    const long = slugify('A very long company name that keeps going and going forever');
    assert.ok(long.length <= 40);
    assert.match(long, /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
  });

  it('suggests a unique subdomain that avoids taken and reserved names', () => {
    assert.equal(uniqueSubdomain('Acme', ['acme', 'acme-2']), 'acme-3');
    assert.equal(uniqueSubdomain('Admin'), 'admin-2');
    const long = 'x'.repeat(40);
    assert.equal(uniqueSubdomain(long, [long]), `${'x'.repeat(38)}-2`);
  });

  it('pre-fills plan, region, currency, date format and admin email from the customer', () => {
    assert.deepEqual(suggestTenantConfig({ name: 'ABC Accounting', region: 'UK', contactEmail: 'cs@abc.example' }), {
      plan: 'professional', subdomain: 'abc-accounting', dataRegion: 'EU', currency: 'GBP', dateFormat: 'DD/MM/YYYY', adminEmail: 'cs@abc.example'
    });
    const europe = suggestTenantConfig({ name: 'Euro GmbH', region: 'Germany' });
    assert.deepEqual([europe.dataRegion, europe.currency, europe.dateFormat], ['EU', 'EUR', 'DD/MM/YYYY']);
    const us = suggestTenantConfig({ name: 'Acme Corporation', region: 'North America', contactEmail: 'a@acme.example' });
    assert.deepEqual([us.dataRegion, us.currency, us.dateFormat, us.adminEmail], ['US', 'USD', 'MM/DD/YYYY', 'a@acme.example']);
  });
});

describe('validateTenantConfig', () => {
  it('accepts and normalises a valid configuration', () => {
    const { config, errors } = validateTenantConfig({ ...VALID, subdomain: '  ABC-Accounting ', adminEmail: ' admin@abc.example ', extra: 'ignored' });
    assert.deepEqual(errors, {});
    assert.deepEqual(config, VALID);
  });

  it('returns readable field errors', () => {
    const { errors } = validateTenantConfig({ plan: 'gold', subdomain: 'no_underscores', dataRegion: 'APAC', currency: 'JPY', dateFormat: 'YY', adminEmail: 'nope' });
    assert.deepEqual(Object.keys(errors).sort(), ['adminEmail', 'currency', 'dataRegion', 'dateFormat', 'plan', 'subdomain']);
    assert.match(validateTenantConfig(null).errors.subdomain, /Enter a subdomain/);
    assert.match(validateTenantConfig({ ...VALID, plan: 5 }).errors.plan, /Enter text/);
  });

  it('enforces subdomain length and shape', () => {
    assert.match(validateTenantConfig({ ...VALID, subdomain: 'ab' }).errors.subdomain, /3–40/);
    assert.match(validateTenantConfig({ ...VALID, subdomain: 'a'.repeat(41) }).errors.subdomain, /3–40/);
    assert.match(validateTenantConfig({ ...VALID, subdomain: '-abc' }).errors.subdomain, /lowercase letters/);
    assert.match(validateTenantConfig({ ...VALID, subdomain: 'abc def' }).errors.subdomain, /lowercase letters/);
  });

  it('rejects reserved and already used subdomains', () => {
    for (const reserved of ['admin', 'api', 'www', 'test']) {
      assert.match(validateTenantConfig({ ...VALID, subdomain: reserved }).errors.subdomain, /reserved/, reserved);
    }
    const taken = validateTenantConfig(VALID, { isSubdomainTaken: subdomain => subdomain === 'abc-accounting' });
    assert.match(taken.errors.subdomain, /already used by another tenant/);
  });

  it('compares configurations field by field', () => {
    assert.equal(sameConfig({ ...VALID, status: 'active' }, VALID), true);
    assert.equal(sameConfig({ ...VALID, plan: 'enterprise' }, VALID), false);
  });
});
