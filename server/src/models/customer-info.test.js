const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateCustomerInfo } = require('./customer-info');

describe('Customer information validation', () => {
  it('requires a name and a valid email without requiring optional fields', () => {
    assert.deepEqual(validateCustomerInfo({ name: ' Company ', contactEmail: ' contact@example.com ' }), {
      customer: { name: 'Company', contactEmail: 'contact@example.com', industry: '', region: '' }, errors: {}
    });
    const { errors } = validateCustomerInfo({ name: '   ', contactEmail: 'broken@' });
    assert.ok(errors.name);
    assert.ok(errors.contactEmail);
  });

  it('rejects unexpected field types and long values', () => {
    const { errors } = validateCustomerInfo({ name: ['Company'], contactEmail: 123, industry: {}, region: 'x'.repeat(201) });
    assert.deepEqual(Object.keys(errors).sort(), ['contactEmail', 'industry', 'name', 'region']);
    assert.ok(validateCustomerInfo(null).errors.name);
    assert.ok(validateCustomerInfo([]).errors.name);
  });

  it('excludes identifiers and other fields from the update', () => {
    const { customer } = validateCustomerInfo({ id: 'injected', createdAt: 'yesterday', name: 'Company', contactEmail: 'contact@example.com' });
    assert.equal(customer.id, undefined);
    assert.equal(customer.createdAt, undefined);
  });
});
