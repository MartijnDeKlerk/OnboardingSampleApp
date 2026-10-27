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
