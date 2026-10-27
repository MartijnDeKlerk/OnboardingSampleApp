import React, { useEffect, useState } from 'react';

const DATA_TYPES = [
  ['accounts', 'Chart of accounts'],
  ['clients', 'Clients'],
  ['contacts', 'Contacts'],
  ['transactions', 'Transactions']
];
const typeLabel = type => DATA_TYPES.find(([id]) => id === type)?.[1] || type;

// Like the other tabs, but 404 resolves to null and 409 keeps its blockers.
async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The server is unavailable. Please try again.');
  const data = await response.json();
  if (response.status === 404 && options.allowMissing) return null;
  if (!response.ok) throw Object.assign(new Error(data.error || 'The request failed. Please try again.'), { data });
  return data;
}

const csvCell = value => /[",\r\n]/.test(String(value ?? '')) ? `"${String(value).replace(/"/g, '""')}"` : String(value ?? '');

function downloadIssues(issues, name) {
  const header = ['datasetType', 'row', 'recordId', 'field', 'severity', 'message'];
  const csv = [header, ...issues.map(issue => header.map(key => issue[key]))].map(row => row.map(csvCell).join(',')).join('\n') + '\n';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Counts({ counts, label }) {
  return <dl className="import-counts" aria-label={label}>
    {DATA_TYPES.map(([type, name]) => <div key={type}><dt>{name}</dt><dd>{counts[type]}</dd></div>)}
  </dl>;
}

function Issues({ issues, fileName }) {
  if (!issues.length) return <p className="sample-issues-none">No issues found.</p>;
  const errors = issues.filter(issue => issue.severity === 'error').length;
  return <div className="import-issues">
    <div className="import-issues-header">
      <p className="sample-issues-totals">{errors} errors · {issues.length - errors} warnings</p>
      <button type="button" className="secondary-button" onClick={() => downloadIssues(issues, fileName)}>Download failed-rows report</button>
    </div>
    <div className="table-scroll"><table className="data-table import-issues-table">
      <thead><tr><th>Data type</th><th>Row</th><th>Record ID</th><th>Field</th><th>Severity</th><th>Message</th></tr></thead>
      <tbody>{issues.map((issue, index) => <tr key={index}>
        <td>{typeLabel(issue.datasetType)}</td><td>{issue.row}</td><td>{issue.recordId || '—'}</td><td>{issue.field || '—'}</td>
        <td><span className={`issue-badge ${issue.severity}`}>{issue.severity}</span></td><td>{issue.message}</td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}

export default function ImportTab({ selectedCustomerId, onSelectCustomer, onSaved, onOpenTab }) {
  const [customers, setCustomers] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blockers, setBlockers] = useState([]);
  const [dryRun, setDryRun] = useState(null);
  const [lastImport, setLastImport] = useState(null);
  const [justImported, setJustImported] = useState(false);
  const customerId = selectedCustomerId || '';

  useEffect(() => {
    const controller = new AbortController();
    requestJson('/api/customers', { signal: controller.signal }).then(data => {
      setCustomers(data);
      if (!selectedCustomerId || !data.some(customer => customer.id === selectedCustomerId)) onSelectCustomer(data[0]?.id || '');
      setLoading(false);
    }).catch(err => {
      if (err.name === 'AbortError') return;
      setError(err.message);
      setLoading(false);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setStatus(null);
    setDryRun(null);
    setBlockers([]);
    setLastImport(null);
    setJustImported(false);
    setError('');
    if (!customerId) return;
    const controller = new AbortController();
    const id = encodeURIComponent(customerId);
    const options = { signal: controller.signal, allowMissing: true };
    Promise.all([
      requestJson(`/api/customers/${id}/onboarding`, options),
      requestJson(`/api/customers/${id}/mappings`, options),
      requestJson(`/api/tenants/${id}`, options),
      requestJson(`/api/customers/${id}/import`, options)
    ]).then(([onboarding, mappings, tenant, previous]) => {
      setStatus({ onboarding, mapped: (mappings || []).map(mapping => mapping.datasetType), tenant });
      setLastImport(previous);
    }).catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [customerId]);

  async function run(path) {
    setBusy(true);
    setError('');
    setBlockers([]);
    try {
      return await requestJson(`/api/customers/${encodeURIComponent(customerId)}/${path}`, { method: 'POST' });
    } catch (err) {
      if (err.data?.blockers) setBlockers(err.data.blockers);
      else setError(err.message);
      if (err.data?.issues) setDryRun({ ready: false, counts: err.data.counts, issues: err.data.issues });
      return null;
    } finally { setBusy(false); }
  }

  async function startDryRun() {
    setDryRun(null);
    setJustImported(false);
    const result = await run('import/dry-run');
    if (result) setDryRun(result);
  }

  async function startImport() {
    const result = await run('import');
    if (!result) return;
    setLastImport(result);
    setJustImported(true);
    setDryRun(null);
    setStatus(current => current && { ...current, onboarding: result.onboarding || current.onboarding });
    onSaved();
  }

  const step = id => status?.onboarding?.steps.find(item => item.id === id)?.status;
  const mappedCount = DATA_TYPES.filter(([type]) => status?.mapped.includes(type)).length;
  const checklist = status && [
    { label: 'Customer Info', done: step('step_1') === 'completed', detail: step('step_1') === 'completed' ? 'Saved' : 'Not saved yet', tab: 'customer-info' },
    { label: 'Data Mapping', done: mappedCount === DATA_TYPES.length, detail: `${mappedCount} of ${DATA_TYPES.length} data types saved`, tab: 'data-mapping' },
    { label: 'Tenant', done: status.tenant?.status === 'active', detail: status.tenant ? `Status: ${status.tenant.status}` : 'Not set up yet', tab: 'tenant-setup' }
  ];
  const customerName = customers.find(customer => customer.id === customerId)?.name || 'this customer';
  const progress = status?.onboarding?.progressPercent;

  return <section className="import-tab" aria-labelledby="import-heading">
    <h2 id="import-heading">Import</h2>
    <p className="section-description">Check the saved mappings against each other, then load them into the customer's tenant. Re-importing replaces the previous import.</p>
    {loading ? <p>Loading customers…</p> : <>
      <div className="customer-picker">
        <div className="form-field">
          <label htmlFor="import-customer">Customer</label>
          <select id="import-customer" value={customerId} disabled={busy} onChange={event => onSelectCustomer(event.target.value)}>
            {!customers.length && <option value="">No customers yet</option>}
            {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </div>
      </div>

      {checklist && <div className="import-readiness">
        <h3>Readiness</h3>
        <ul className="checklist" aria-label="Import readiness">
          {checklist.map(item => <li key={item.label} className={item.done ? 'ready' : 'not-ready'}>
            <span className={`step-status ${item.done ? 'completed' : 'pending'}`}>{item.done ? '✓' : '!'}</span>
            <span><strong>{item.label}</strong> — {item.detail}</span>
            {!item.done && onOpenTab && <button type="button" className="text-button" onClick={() => onOpenTab(item.tab)}>Open {item.label === 'Tenant' ? 'Tenant Setup' : item.label}</button>}
          </li>)}
        </ul>
      </div>}

      <div className="form-actions">
        <button type="button" className="secondary-button" disabled={busy || !customerId} onClick={startDryRun}>{busy ? 'Working…' : 'Run dry run'}</button>
        <button type="button" className="primary-button" disabled={busy || !dryRun?.ready} onClick={startImport}>Import into tenant</button>
      </div>

      {!!blockers.length && <div className="mapping-warning import-blockers" role="alert">
        <strong>Import is blocked for {customerName}:</strong>
        <ul>{blockers.map(blocker => <li key={blocker.code}>{blocker.message}</li>)}</ul>
      </div>}
      {error && <p className="form-error feedback" role="alert">{error}</p>}

      {dryRun && <div className="import-dry-run">
        <h3>Dry run</h3>
        <p className={dryRun.ready ? 'success-message feedback' : 'mapping-warning'}>
          {dryRun.ready ? 'Ready to import. Nothing has been loaded yet.' : 'Fix the errors below in Data Mapping, then run the dry run again.'}
        </p>
        <Counts counts={dryRun.counts} label="Records to import" />
        <Issues issues={dryRun.issues} fileName={`import-issues-${customerId}.csv`} />
      </div>}

      {lastImport && <div className="import-result" data-testid="import-result">
        <h3>{justImported ? 'Import complete' : 'Last import'}</h3>
        <p>Imported {DATA_TYPES.reduce((sum, [type]) => sum + lastImport.counts[type], 0)} records for {customerName} into tenant {lastImport.tenantId} on {new Date(lastImport.importedAt).toLocaleString()}.</p>
        <Counts counts={lastImport.counts} label="Imported records" />
        {!!lastImport.issues.length && <Issues issues={lastImport.issues} fileName={`import-warnings-${customerId}.csv`} />}
        {progress === 100
          ? <p className="import-celebration">🎉 Onboarding complete — {customerName} is fully set up (100%).</p>
          : progress != null && <p className="session-note">Onboarding progress: {progress}%. Finish the remaining steps to complete onboarding.</p>}
      </div>}
      <p className="session-note">Imported data is kept in memory for this workshop session and resets when the server restarts.</p>
    </>}
  </section>;
}
