const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { schemas } = require('./schemas');
const { analyzeCsv } = require('./csv');
const store = require('../data/store');
const router = express.Router();

const sampleCustomers = [
  ['abc', 'ABC Accounting', 'CustomerA_ABCAccounting'],
  ['xyz', 'XYZ Financial Services', 'CustomerB_XYZFinancialServices'],
  ['premier', 'Premier Bookkeeping', 'CustomerC_PremierBookkeeping']
];
const samples = sampleCustomers.flatMap(([prefix, customer, folder]) => Object.values(schemas).map(schema => ({
  id: `${prefix}-${schema.id}`, label: `${customer} — ${schema.label}`, datasetType: schema.id,
  fileName: schema.id === 'accounts' ? 'chart_of_accounts.csv' : `${schema.id}.csv`, folder
})));

router.get('/mapping/options', (req, res) => {
  res.json({ datasets: Object.values(schemas), samples: samples.map(({ folder, ...sample }) => sample) });
});

router.get('/mapping/samples/:sampleId', (req, res) => {
  const sample = samples.find(item => item.id === req.params.sampleId);
  if (!sample) return res.status(404).json({ error: 'Sample file not found.' });
  try {
    const csv = fs.readFileSync(path.resolve(__dirname, '../../../sample-data', sample.folder, sample.fileName), 'utf8');
    res.json({ csv, fileName: sample.fileName, datasetType: sample.datasetType });
  } catch {
    res.status(500).json({ error: 'Could not read the sample file.' });
  }
});

router.post('/mapping/preview', (req, res) => {
  res.json(analyzeCsv(req.body || {}));
});

router.get('/customers/:id/mappings', (req, res) => {
  if (!store.getCustomerById(req.params.id)) return res.status(404).json({ error: 'Customer not found.' });
  res.json(store.getCustomerMappings(req.params.id));
});

router.post('/customers/:id/mappings', (req, res) => {
  if (!store.getCustomerById(req.params.id)) return res.status(404).json({ error: 'Customer not found.' });
  const state = store.getOnboardingState(req.params.id);
  if (!state?.steps.some(step => step.id === 'step_1' && step.status === 'completed')) {
    return res.status(409).json({ error: 'Save Customer Info for this customer before completing Data Mapping.' });
  }
  const body = req.body || {};
  const analysis = analyzeCsv(body);
  if (analysis.errors.length) return res.status(400).json({ error: 'Resolve the CSV errors before saving.', analysis });
  if (analysis.repairs.length && body.acceptRepairs !== true) {
    return res.status(400).json({ error: 'Review and accept the proposed CSV repairs before saving.' });
  }
  if (analysis.unmappedHeaders.length && body.acceptUnmapped !== true) {
    return res.status(400).json({ error: 'Confirm the source columns excluded from the mapped export before saving.' });
  }
  res.json(store.saveDataMapping(req.params.id, {
    datasetType: body.datasetType,
    fileName: typeof body.fileName === 'string' ? body.fileName.slice(0, 200) : 'uploaded.csv',
    originalCsv: body.csv,
    columnMapping: analysis.mapping,
    dateFormat: body.dateFormat || 'auto',
    correctedCsv: analysis.correctedCsv,
    mappedCsv: analysis.mappedCsv,
    totalRows: analysis.totalRows,
    repairs: analysis.repairs,
    savedPreview: analysis.preview,
    unmappedHeaders: analysis.unmappedHeaders
  }));
});

module.exports = router;
