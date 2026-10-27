/**
 * In-Memory Data Store
 * Simple storage for the training exercise - no database needed
 */

const { randomUUID } = require('node:crypto');
const { createCustomer, createTenant, createDefaultOnboardingSteps, calculateProgress } = require('../models');

// In-memory storage
const store = {
  customers: [],
  tenants: [],
  onboardingStates: [],
  dataMappings: []
};

// Seed with example data
function seedData() {
  // Example customer - Acme Corporation
  const exampleCustomer = createCustomer({
    id: 'cust_001',
    name: 'Acme Corporation',
    industry: 'Manufacturing',
    region: 'North America',
    contactEmail: 'onboarding@acme.example.com',
    createdAt: '2025-01-15T10:00:00Z'
  });

  // Example tenant for Acme
  const exampleTenant = createTenant({
    id: 'tenant_001',
    customerId: 'cust_001',
    status: 'pending',
    plan: 'professional',
    createdAt: '2025-01-15T10:00:00Z'
  });

  // Example onboarding state - just started, nothing completed
  const exampleOnboardingState = {
    customerId: 'cust_001',
    steps: createDefaultOnboardingSteps(),
    progressPercent: 0
  };

  store.customers.push(exampleCustomer);
  store.tenants.push(exampleTenant);
  store.onboardingStates.push(exampleOnboardingState);
}

// Initialize with seed data
seedData();

// Store access functions
function getCustomers() {
  return [...store.customers];
}

function getCustomerById(id) {
  return store.customers.find(c => c.id === id);
}

function addCustomer(customer) {
  store.customers.push(customer);
  return customer;
}

function saveCustomerInfo(customerId, details) {
  let customer = customerId ? getCustomerById(customerId) : null;
  if (customerId && !customer) return null;

  if (customer) {
    Object.assign(customer, details);
  } else {
    customer = createCustomer({ ...details, id: `cust_${randomUUID()}` });
    addCustomer(customer);
  }

  const current = getOnboardingState(customer.id);
  const steps = (current?.steps || createDefaultOnboardingSteps()).map(step =>
    step.id === 'step_1' ? { ...step, status: 'completed' } : step
  );
  const onboarding = { customerId: customer.id, steps, progressPercent: calculateProgress(steps) };
  if (current) updateOnboardingState(customer.id, onboarding);
  else addOnboardingState(onboarding);

  return { customer, onboarding };
}

function getTenants() {
  return [...store.tenants];
}

function getCustomerMappings(customerId) {
  return store.dataMappings.filter(mapping => mapping.customerId === customerId);
}

function saveDataMapping(customerId, mapping) {
  const saved = { ...mapping, customerId, savedAt: new Date().toISOString() };
  const index = store.dataMappings.findIndex(item => item.customerId === customerId && item.datasetType === saved.datasetType);
  if (index === -1) store.dataMappings.push(saved);
  else store.dataMappings[index] = saved;
  // Import needs every data type, so Data Mapping completes only once all are saved.
  const mapped = getCustomerMappings(customerId).map(item => item.datasetType);
  const required = Object.keys(require('../mapping/schemas').schemas);
  const complete = required.every(type => mapped.includes(type));
  const current = getOnboardingState(customerId);
  const steps = current.steps.map(step => step.id === 'step_2' ? { ...step, status: complete ? 'completed' : 'in_progress' } : step);
  const onboarding = updateOnboardingState(customerId, { steps, progressPercent: calculateProgress(steps) });
  return { mapping: saved, onboarding, dataMapping: { required, mapped: required.filter(type => mapped.includes(type)), complete } };
}

function getTenantByCustomerId(customerId) {
  return store.tenants.find(t => t.customerId === customerId);
}

function addTenant(tenant) {
  store.tenants.push(tenant);
  return tenant;
}

function getOnboardingState(customerId) {
  return store.onboardingStates.find(s => s.customerId === customerId);
}

function getAllOnboardingStates() {
  return [...store.onboardingStates];
}

function addOnboardingState(state) {
  store.onboardingStates.push(state);
  return state;
}

function updateOnboardingState(customerId, updates) {
  const index = store.onboardingStates.findIndex(s => s.customerId === customerId);
  if (index !== -1) {
    store.onboardingStates[index] = { ...store.onboardingStates[index], ...updates };
    return store.onboardingStates[index];
  }
  return null;
}

module.exports = {
  getCustomers,
  getCustomerById,
  addCustomer,
  saveCustomerInfo,
  getCustomerMappings,
  saveDataMapping,
  getTenants,
  getTenantByCustomerId,
  addTenant,
  getOnboardingState,
  getAllOnboardingStates,
  addOnboardingState,
  updateOnboardingState
};

// --- Import (step 4) -------------------------------------------------------
// Imported records live in a per-tenant in-memory store. Each import replaces
// the tenant's previous records, so re-importing the same data is idempotent.
store.imports = new Map(); // tenantId -> { customerId, records, result }

function saveImport(customerId, tenantId, records, result) {
  store.imports.set(tenantId, { customerId, records, result });
  const current = getOnboardingState(customerId);
  const steps = current.steps.map(step => step.id === 'step_4' ? { ...step, status: 'completed' } : step);
  const onboarding = updateOnboardingState(customerId, { steps, progressPercent: calculateProgress(steps) });
  return { ...result, onboarding };
}

function getLastImport(customerId) {
  const tenant = getTenantByCustomerId(customerId);
  const saved = tenant && store.imports.get(tenant.id);
  return saved && saved.customerId === customerId ? saved.result : null;
}

function getTenantRecords(tenantId) {
  return store.imports.get(tenantId)?.records || null;
}

// Creates the customer's tenant or merges updates into it (tests and test support).
function upsertTenant(customerId, updates) {
  const tenant = getTenantByCustomerId(customerId);
  if (tenant) return Object.assign(tenant, updates);
  return addTenant(createTenant({ ...updates, customerId }));
}

Object.assign(module.exports, { saveImport, getLastImport, getTenantRecords, upsertTenant });
// --- Tenant Setup ---------------------------------------------------------
// Appended (and exported separately) to keep the existing functions untouched.

function setStepStatus(customerId, stepId, status) {
  const current = getOnboardingState(customerId);
  if (!current) return null;
  const steps = current.steps.map(step => step.id === stepId ? { ...step, status } : step);
  return updateOnboardingState(customerId, { steps, progressPercent: calculateProgress(steps) });
}

function isStepCompleted(customerId, stepId) {
  return Boolean(getOnboardingState(customerId)?.steps.some(step => step.id === stepId && step.status === 'completed'));
}

function isSubdomainTaken(subdomain, exceptCustomerId) {
  return store.tenants.some(tenant => tenant.customerId !== exceptCustomerId && tenant.subdomain === subdomain);
}

/**
 * Creates or updates the customer's tenant with a validated configuration and
 * marks it `provisioning`. Tenant Setup stays completed if it already was.
 */
function startTenantProvisioning(customerId, config) {
  const now = new Date().toISOString();
  let tenant = getTenantByCustomerId(customerId);
  if (!tenant) tenant = addTenant(createTenant({ id: `tenant_${randomUUID()}`, customerId, createdAt: now }));
  Object.assign(tenant, config, { status: 'provisioning', failureReason: null, updatedAt: now });
  const onboarding = isStepCompleted(customerId, 'step_3')
    ? getOnboardingState(customerId)
    : setStepStatus(customerId, 'step_3', 'in_progress');
  return { tenant: { ...tenant }, onboarding };
}

/**
 * Finishes a provisioning run: success makes the tenant `active` and completes
 * Tenant Setup; a failureReason makes it `failed` (an already completed Tenant
 * Setup step stays completed). Returns null if the tenant is not provisioning.
 */
function finishTenantProvisioning(customerId, { failureReason } = {}) {
  const tenant = getTenantByCustomerId(customerId);
  if (!tenant || tenant.status !== 'provisioning') return null;
  if (failureReason) {
    Object.assign(tenant, { status: 'failed', failureReason });
    if (!isStepCompleted(customerId, 'step_3')) setStepStatus(customerId, 'step_3', 'failed');
  } else {
    Object.assign(tenant, { status: 'active', failureReason: null, provisionedAt: new Date().toISOString() });
    setStepStatus(customerId, 'step_3', 'completed');
  }
  return { tenant: { ...tenant }, onboarding: getOnboardingState(customerId) };
}

Object.assign(module.exports, {
  isStepCompleted,
  isSubdomainTaken,
  startTenantProvisioning,
  finishTenantProvisioning
});
