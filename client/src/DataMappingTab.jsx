import React, { useEffect, useState } from 'react';
import ValueMappingTable from './ValueMappingTable';

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The server is unavailable. Your CSV is still here; try again.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request failed. Please try again.');
  return data;
}

function downloadCsv(csv, name) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DataMappingTab({ selectedCustomerId, onSelectCustomer, onSaved, onCustomerInfo }) {
  const [options, setOptions] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [savedMappings, setSavedMappings] = useState([]);
  const [infoComplete, setInfoComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sampleId, setSampleId] = useState('xyz-clients');
  const [datasetType, setDatasetType] = useState('clients');
  const [dateFormat, setDateFormat] = useState('auto');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('pasted.csv');
  const [mapping, setMapping] = useState(null);
  const [valueMapping, setValueMapping] = useState(null);
  const [result, setResult] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [acceptRepairs, setAcceptRepairs] = useState(false);
  const [acceptUnmapped, setAcceptUnmapped] = useState(false);
  const customerId = selectedCustomerId || '';

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      requestJson('/api/mapping/options', { signal: controller.signal }),
      requestJson('/api/customers', { signal: controller.signal })
    ]).then(([catalog, data]) => {
      setOptions(catalog);
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
    setSavedMappings([]);
    setInfoComplete(false);
    if (!customerId) return;
    const controller = new AbortController();
    Promise.all([
      requestJson(`/api/customers/${encodeURIComponent(customerId)}/mappings`, { signal: controller.signal }),
      requestJson(`/api/customers/${encodeURIComponent(customerId)}/onboarding`, { signal: controller.signal })
    ]).then(([saved, state]) => {
      setSavedMappings(saved);
      setInfoComplete(state.steps.some(step => step.id === 'step_1' && step.status === 'completed'));
    }).catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [customerId]);

  function invalidate() {
    setDirty(true);
    setAcceptRepairs(false);
    setAcceptUnmapped(false);
    setError('');
    setNotice('');
  }

  function loadSource(source) {
    setCsv(source.csv);
    setDatasetType(source.datasetType || datasetType);
    setFileName(source.fileName || 'uploaded.csv');
    setDateFormat(source.dateFormat || 'auto');
    setMapping(source.columnMapping || null);
    setValueMapping(source.valueMapping || null);
    setResult(null);
    invalidate();
  }

  async function loadSample() {
    setBusy(true);
    setError('');
    try { loadSource(await requestJson(`/api/mapping/samples/${encodeURIComponent(sampleId)}`)); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function loadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 500000) { setError('Choose a CSV of 500 KB or less.'); return; }
    setBusy(true);
    try { loadSource({ csv: await file.text(), fileName: file.name }); }
    catch { setError('Could not read this file. Please choose it again.'); }
    finally { setBusy(false); }
  }

  const requestBody = () => ({ csv, datasetType, dateFormat, ...(mapping ? { mapping } : {}), ...(valueMapping ? { valueMapping } : {}) });

  function changeValueTarget(field, source, target) {
    setValueMapping(current => {
      const fieldMap = { ...current?.[field] };
      if (target) fieldMap[source] = target;
      else delete fieldMap[source];
      const next = { ...current, [field]: fieldMap };
      if (!Object.keys(fieldMap).length) delete next[field];
      return Object.keys(next).length ? next : null;
    });
    invalidate();
  }

  async function preview() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const analysis = await requestJson('/api/mapping/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody())
      });
      setResult(analysis);
      setMapping(Object.keys(analysis.mapping).length ? analysis.mapping : null);
      setDirty(false);
      setAcceptRepairs(false);
      setAcceptUnmapped(false);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const saved = await requestJson(`/api/customers/${encodeURIComponent(customerId)}/mappings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...requestBody(), fileName, acceptRepairs, acceptUnmapped })
      });
      setSavedMappings(current => [...current.filter(item => item.datasetType !== saved.mapping.datasetType), saved.mapping]);
      setNotice(`Saved ${saved.mapping.totalRows} rows for ${customers.find(customer => customer.id === customerId)?.name || 'this customer'}. Data Mapping is complete. Onboarding progress: ${saved.onboarding.progressPercent}%.`);
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const schema = options?.datasets.find(dataset => dataset.id === datasetType);
  const approved = result && (!result.repairs.length || acceptRepairs) && (!result.unmappedHeaders.length || acceptUnmapped);
  const ready = result && !dirty && !result.errors.length && approved;

  return <section className="data-mapping" aria-labelledby="data-mapping-heading">
    <h2 id="data-mapping-heading">Data Mapping</h2>
    <p className="section-description">Prepare one CSV at a time: inspect repairs, map columns, then save the data for import. Saving the first valid file completes this workshop step.</p>
    {loading ? <p role="status">Loading mapping tools…</p> : !options ? <p role="alert" className="form-error">{error}</p> : <>
      <div className="mapping-controls form-grid">
        <div className="form-field">
          <label htmlFor="mapping-customer">Customer</label>
          <select id="mapping-customer" value={customerId} disabled={busy} onChange={event => { onSelectCustomer(event.target.value); setNotice(''); setError(''); }}>
            {!customers.length && <option value="">No customers yet</option>}
            {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="mapping-type">Data type</label>
          <select id="mapping-type" value={datasetType} disabled={busy} onChange={event => { setDatasetType(event.target.value); setMapping(null); setValueMapping(null); setResult(null); invalidate(); }}>
            {options.datasets.map(dataset => <option key={dataset.id} value={dataset.id}>{dataset.label}</option>)}
          </select>
        </div>
      </div>

      <div className="mapping-source">
        <h3>1. Load CSV</h3>
        <div className="customer-picker sample-picker">
          <div className="form-field">
            <label htmlFor="mapping-sample">Sample data</label>
            <select id="mapping-sample" value={sampleId} disabled={busy} onChange={event => setSampleId(event.target.value)}>
              {options.samples.map(sample => <option key={sample.id} value={sample.id}>{sample.label}</option>)}
            </select>
          </div>
          <button type="button" className="secondary-button" disabled={busy} onClick={loadSample}>Load sample</button>
        </div>
        <div className="form-field file-upload">
          <label htmlFor="mapping-file">Upload CSV (up to 500 KB / 5,000 rows)</label>
          <input id="mapping-file" type="file" accept=".csv,text/csv" onChange={loadFile} disabled={busy} />
        </div>
        <div className="form-field">
          <label htmlFor="mapping-csv">CSV content</label>
          <textarea id="mapping-csv" rows={7} spellCheck={false} value={csv} disabled={busy} onChange={event => { setCsv(event.target.value); setFileName('pasted.csv'); setMapping(null); setValueMapping(null); invalidate(); }} placeholder="Paste a header row followed by your data…" />
        </div>
        <div className="mapping-toolbar">
          <div className="form-field">
            <label htmlFor="mapping-date-format">Source date format</label>
            <select id="mapping-date-format" value={dateFormat} disabled={busy} onChange={event => { setDateFormat(event.target.value); invalidate(); }}>
              <option value="auto">Auto (sample schema; otherwise ISO)</option>
              <option value="YMD">YYYY-MM-DD</option>
              <option value="MDY">MM/DD/YYYY</option>
              <option value="DMY">DD-MM-YYYY</option>
            </select>
          </div>
          <button type="button" className="primary-button" onClick={preview} disabled={busy || !csv.trim()}>{busy ? 'Working…' : 'Analyze and preview'}</button>
        </div>
      </div>

      {result && <div className="mapping-result">
        <h3>2. Review repairs and mapping</h3>
        <div className="mapping-summary" role="status">
          <strong>{result.totalRows} rows</strong><span>{result.repairs.length} proposed repairs</span><span>{result.errors.length} errors</span>
          <span>{result.normalizedDates} dates normalized</span>
        </div>
        {dirty && <p className="mapping-warning" role="status">Settings changed. Analyze and preview again before saving or downloading.</p>}
        {result.detectedSource && <p className="session-note">Detected: {result.detectedSource}. Dates use {result.dateFormat} and export as YYYY-MM-DD. IDs keep leading zeros; amounts keep decimal precision. {result.valueMappings ? 'Picklist values are mapped to target values below.' : 'Status and category values are preserved.'}</p>}
        {!!result.errors.length && <div className="mapping-warning" role="alert">
          <strong>Resolve these errors before saving. No rows will be silently discarded.</strong>
          <ul>{result.errors.slice(0, 50).map((issue, index) => <li key={index}>{issue.line ? `Line ${issue.line}: ` : ''}{issue.message}</li>)}</ul>
          {result.errors.length > 50 && <p>And {result.errors.length - 50} more errors.</p>}
        </div>}
        {!!result.repairs.length && <>
          <details open className="repair-details">
            <summary>Proposed CSV repairs ({result.repairs.length})</summary>
            <div className="table-scroll"><table className="data-table repair-table">
              <thead><tr><th>Line</th><th>Reason</th><th>Original</th><th>Proposed row</th></tr></thead>
              <tbody>{result.repairs.map(repair => <tr key={repair.line}>
                <td>{repair.line}</td><td>{repair.reason}</td><td><code>{repair.original}</code></td><td><code>{repair.corrected}</code></td>
              </tr>)}</tbody>
            </table></div>
          </details>
          <label className="mapping-confirm"><input type="checkbox" checked={acceptRepairs} disabled={busy || dirty} onChange={event => setAcceptRepairs(event.target.checked)} />I reviewed and accept the proposed repairs.</label>
        </>}
        {!!result.headers.length && <div className="table-scroll"><table className="data-table mapping-table">
          <thead><tr><th>Target field</th><th>Source column</th><th>First value</th></tr></thead>
          <tbody>{schema.fields.map(field => <tr key={field.key}>
            <th scope="row">{field.label}{field.required ? ' *' : ''}</th>
            <td><select aria-label={`Source column for ${field.label}`} value={mapping?.[field.key] || ''} disabled={busy} onChange={event => { setMapping(current => ({ ...current, [field.key]: event.target.value })); invalidate(); }}>
              <option value="">{field.required ? 'Choose a column' : 'Do not map'}</option>
              {result.headers.map(header => <option key={header} value={header}>{header}</option>)}
            </select></td>
            <td>{result.preview[0]?.[field.key] || '—'}</td>
          </tr>)}</tbody>
        </table></div>}
        {!!result.unmappedHeaders.length && <label className="mapping-confirm mapping-warning">
          <input type="checkbox" checked={acceptUnmapped} disabled={busy || dirty} onChange={event => setAcceptUnmapped(event.target.checked)} />
          I accept excluding these source columns from the mapped export: {result.unmappedHeaders.join(', ')}. They remain in the repaired source CSV.
        </label>}
        <ValueMappingTable valueMappings={result.valueMappings} overrides={valueMapping} disabled={busy} onChange={changeValueTarget} />
        {!!result.preview.length && <details open className="mapped-preview">
          <summary>Mapped data preview (first {result.preview.length} of {result.totalRows} rows)</summary>
          <div className="table-scroll"><table className="data-table">
            <thead><tr>{schema.fields.map(field => <th key={field.key}>{field.key}</th>)}</tr></thead>
            <tbody>{result.preview.map((row, index) => <tr key={index}>{schema.fields.map(field => <td key={field.key}>{row[field.key]}</td>)}</tr>)}</tbody>
          </table></div>
        </details>}
        <div className="form-actions mapping-downloads">
          <button type="button" className="secondary-button" disabled={busy || dirty || !result.correctedCsv || (result.repairs.length > 0 && !acceptRepairs)} onClick={() => downloadCsv(result.correctedCsv, `repaired-${fileName}`)}>Download repaired CSV</button>
          <button type="button" className="secondary-button" disabled={busy || !ready} onClick={() => downloadCsv(result.mappedCsv, `mapped-${datasetType}.csv`)}>Download mapped CSV</button>
        </div>
        <h3 className="mapping-save-heading">3. Save for import</h3>
        {!infoComplete && <p className="mapping-warning">Save Customer Info for this customer first. <button type="button" className="text-button" onClick={onCustomerInfo}>Open Customer Info</button></p>}
        <button type="button" className="primary-button" disabled={busy || !ready || !customerId || !infoComplete} onClick={save}>Save mapping for customer</button>
        <p className="session-note">This prepares the file for the Import step. Data is saved for this workshop session and resets when the server restarts.</p>
      </div>}

      {error && <p className="form-error feedback" role="alert">{error}</p>}
      {notice && <p className="success-message feedback" role="status">{notice}</p>}
      {!!savedMappings.length && <div className="saved-mappings" data-testid="saved-mappings">
        <h3>Saved files for this customer</h3>
        <ul>{savedMappings.map(saved => <li key={saved.datasetType}>
          <span><strong>{options.datasets.find(dataset => dataset.id === saved.datasetType)?.label}</strong> — {saved.fileName} · {saved.totalRows} rows · {saved.repairs.length} repairs</span>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => loadSource({ ...saved, csv: saved.originalCsv })}>Load saved file</button>
        </li>)}</ul>
      </div>}
    </>}
  </section>;
}
