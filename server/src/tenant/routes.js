const express = require('express');
const store = require('../data/store');
const { suggestTenantConfig, validateTenantConfig, sameConfig } = require('./config');
const { scheduleProvisioning } = require('./provisioner');
const router = express.Router();

function takenSubdomains(customerId) {
  return store.getTenants().filter(tenant => tenant.customerId !== customerId && tenant.subdomain).map(tenant => tenant.subdomain);
}

router.get('/customers/:id/tenant/defaults', (req, res) => {
  const customer = store.getCustomerById(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });
  res.json(suggestTenantConfig(customer, takenSubdomains(customer.id)));
});

router.get('/customers/:id/tenant', (req, res) => {
  if (!store.getCustomerById(req.params.id)) return res.status(404).json({ error: 'Customer not found.' });
  const tenant = store.getTenantByCustomerId(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'No tenant has been set up for this customer yet.' });
  res.json(tenant);
});

router.post('/customers/:id/tenant', (req, res) => {
  const customerId = req.params.id;
  if (!store.getCustomerById(customerId)) return res.status(404).json({ error: 'Customer not found.' });
  if (!store.isStepCompleted(customerId, 'step_1')) {
    return res.status(409).json({ error: 'Save Customer Info for this customer before setting up the tenant.' });
  }
  const existing = store.getTenantByCustomerId(customerId);
  if (existing?.status === 'provisioning') {
    return res.status(409).json({ error: 'This tenant is already being provisioned. Wait for it to finish.' });
  }
  const { config, errors } = validateTenantConfig(req.body, {
    isSubdomainTaken: subdomain => store.isSubdomainTaken(subdomain, customerId)
  });
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Check the highlighted fields.', errors });
  }
  if (existing?.status === 'active' && sameConfig(existing, config)) {
    return res.status(409).json({ error: 'This tenant is already active with these settings. Change a setting to re-provision it.' });
  }
  const result = store.startTenantProvisioning(customerId, config);
  scheduleProvisioning(customerId, config);
  res.status(202).json(result);
});

module.exports = router;
