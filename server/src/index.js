const express = require('express');
const cors = require('cors');
const store = require('./data/store');
const { validateCustomerInfo } = require('./models/customer-info');
const { listSampleData, loadProfile } = require('./profile/sample-data');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/api', require('./mapping/routes'));
app.use('/api', require('./import/routes'));
app.use('/api', require('./tenant/routes'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all customers
app.get('/api/customers', (req, res) => {
  res.json(store.getCustomers());
});

function saveCustomerInfo(req, res) {
  if (req.params.id && !store.getCustomerById(req.params.id)) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  const { customer, errors } = validateCustomerInfo(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Check the highlighted fields.', errors });
  }
  const result = store.saveCustomerInfo(req.params.id, customer);
  res.status(req.params.id ? 200 : 201).json(result);
}

app.post('/api/customers', saveCustomerInfo);
app.put('/api/customers/:id', saveCustomerInfo);

// Get customer by ID
app.get('/api/customers/:id', (req, res) => {
  const customer = store.getCustomerById(req.params.id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  res.json(customer);
});

// Get onboarding state for a customer
app.get('/api/customers/:id/onboarding', (req, res) => {
  const state = store.getOnboardingState(req.params.id);
  if (!state) {
    return res.status(404).json({ error: 'Onboarding state not found' });
  }
  res.json(state);
});

// Get all onboarding states (dashboard view)
app.get('/api/onboarding', (req, res) => {
  const states = store.getAllOnboardingStates();
  const customers = store.getCustomers();
  
  // Join customer info with onboarding state
  const dashboard = states.map(state => {
    const customer = customers.find(c => c.id === state.customerId);
    return {
      ...state,
      customerName: customer?.name || 'Unknown',
      customerIndustry: customer?.industry || '',
      customerRegion: customer?.region || '',
      tenantStatus: store.getTenantByCustomerId(state.customerId)?.status || null
    };
  });
  
  res.json(dashboard);
});

// Get tenant by customer ID
app.get('/api/tenants/:customerId', (req, res) => {
  const tenant = store.getTenantByCustomerId(req.params.customerId);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  res.json(tenant);
});

// Customer sample-data folders available for profiling
app.get('/api/sample-data', async (req, res, next) => {
  try {
    res.json(await listSampleData());
  } catch (error) {
    next(error);
  }
});

// Pre-fill suggestion and data-quality summary for one sample-data folder
app.get('/api/sample-data/:id/profile', async (req, res, next) => {
  try {
    const profile = await loadProfile(req.params.id);
    if (!profile) {
      return res.status(404).json({ error: 'Sample data not found' });
    }
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'The request is too large. Use a CSV of 500 KB or less.' });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request must contain valid JSON.' });
  next(error);
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Onboarding API server running at http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health`);
  });
}

module.exports = app;
