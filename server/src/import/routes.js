const express = require('express');
const { randomUUID } = require('node:crypto');
const store = require('../data/store');
const { schemas } = require('../mapping/schemas');
const { checkImport, IMPORT_ORDER } = require('./checks');
const { calculateProgress } = require('../models');
const router = express.Router();

// Import needs every data type mapped and an active tenant to load into.
function getBlockers(customerId) {
  const blockers = [];
  const mapped = store.getCustomerMappings(customerId).map(mapping => mapping.datasetType);
  const missing = Object.keys(schemas).filter(type => !mapped.includes(type));
  if (missing.length) {
    blockers.push({
      code: 'data_mapping_incomplete', missing,
      message: `Complete Data Mapping first. Still needed: ${missing.map(type => schemas[type].label).join(', ')}.`
    });
  }
  const tenant = store.getTenantByCustomerId(customerId);
  if (!tenant) blockers.push({ code: 'tenant_missing', message: 'Set up a tenant for this customer first.' });
  else if (tenant.status !== 'active') {
    blockers.push({ code: 'tenant_not_active', tenantStatus: tenant.status, message: `The tenant must be active before import (current status: ${tenant.status}).` });
  }
  return blockers;
}

// Shared gate + dry run. Sends the 404/409 response itself and returns null.
function dryRun(req, res) {
  const customerId = req.params.id;
  if (!store.getCustomerById(customerId)) {
    res.status(404).json({ error: 'Customer not found.' });
    return null;
  }
  const blockers = getBlockers(customerId);
  if (blockers.length) {
    res.status(409).json({ error: 'Import is blocked until the earlier steps are done.', blockers });
    return null;
  }
  return checkImport(store.getCustomerMappings(customerId));
}

router.post('/customers/:id/import/dry-run', (req, res) => {
  const check = dryRun(req, res);
  if (!check) return;
  const { records, ...result } = check;
  res.json(result);
});

router.post('/customers/:id/import', (req, res) => {
  const check = dryRun(req, res);
  if (!check) return;
  const { records, ready, counts, issues } = check;
  if (!ready) return res.status(400).json({ error: 'Fix the errors found by the dry run before importing.', ready, counts, issues });
  const tenant = store.getTenantByCustomerId(req.params.id);
  // Load parents before children: accounts, clients, contacts, transactions.
  const loaded = {};
  for (const type of IMPORT_ORDER) loaded[type] = records[type].map(record => ({ ...record }));
  res.json(store.saveImport(req.params.id, tenant.id, loaded, {
    importId: `imp_${randomUUID()}`, importedAt: new Date().toISOString(), tenantId: tenant.id, counts, issues
  }));
});

router.get('/customers/:id/import', (req, res) => {
  if (!store.getCustomerById(req.params.id)) return res.status(404).json({ error: 'Customer not found.' });
  const result = store.getLastImport(req.params.id);
  if (!result) return res.status(404).json({ error: 'No import has run for this customer yet.' });
  res.json(result);
});

// Test support: lets e2e tests put a customer's tenant into a given state
// without the Tenant Setup flow. Disabled when NODE_ENV=production.
if (process.env.NODE_ENV !== 'production') {
  router.put('/test-support/tenants/:customerId', (req, res) => {
    const customerId = req.params.customerId;
    if (!store.getCustomerById(customerId)) return res.status(404).json({ error: 'Customer not found.' });
    const status = req.body?.status;
    if (!['pending', 'provisioning', 'active', 'failed'].includes(status)) return res.status(400).json({ error: 'Unknown tenant status.' });
    const tenant = store.upsertTenant(customerId, { status });
    // An active tenant means Tenant Setup is done, as provisioning would record.
    const current = store.getOnboardingState(customerId);
    if (current && status === 'active') {
      const steps = current.steps.map(step => step.id === 'step_3' ? { ...step, status: 'completed' } : step);
      store.updateOnboardingState(customerId, { steps, progressPercent: calculateProgress(steps) });
    }
    res.json(tenant);
  });
}

module.exports = router;
module.exports.getBlockers = getBlockers;
