import React, { useEffect, useRef, useState } from 'react';
import SampleDataSummary from './SampleDataSummary';

const EMPTY_FORM = { name: '', contactEmail: '', industry: '', region: '' };
const FIELDS = [
  { name: 'name', label: 'Company name', required: true, maxLength: 200, autoComplete: 'organization' },
  { name: 'contactEmail', label: 'Contact email', required: true, type: 'email', maxLength: 254, autoComplete: 'email' },
  { name: 'industry', label: 'Industry (optional)', maxLength: 200 },
  { name: 'region', label: 'Region (optional)', maxLength: 200 }
];

// Fields that sample data may suggest. contactEmail is never pre-filled.
const PREFILL_FIELDS = ['name', 'industry', 'region'];
const FIELD_LABELS = { name: 'Company name', industry: 'Industry', region: 'Region' };

function toForm(customer) {
  return Object.fromEntries(FIELDS.map(field => [field.name, customer?.[field.name] || '']));
}

function listFields(names) {
  return names.map(name => FIELD_LABELS[name]).join(', ');
}

// Fill only empty fields so values the user typed are never overwritten.
function applySuggestion(form, suggestion) {
  const next = { ...form };
  const filled = [];
  const keptExisting = [];
  PREFILL_FIELDS.forEach(name => {
    const suggested = typeof suggestion?.[name] === 'string' ? suggestion[name].trim() : '';
    if (!suggested) return;
    const current = form[name].trim();
    if (!current) {
      next[name] = suggested;
      filled.push(name);
    } else if (current !== suggested) {
      keptExisting.push(name);
    }
  });
  return { form: next, filled, keptExisting };
}

function describePrefill(label, filled, keptExisting) {
  const parts = [];
  parts.push(filled.length
    ? `Pre-filled ${listFields(filled)} from ${label}.`
    : `No empty fields to pre-fill from ${label}.`);
  if (keptExisting.length) {
    parts.push(`Left unchanged because they already had different values: ${listFields(keptExisting)}.`);
  }
  parts.push('Review the details and click Save customer info to keep them.');
  return parts.join(' ');
}

export default function CustomerInfoTab({ selectedCustomerId, onSelectCustomer, onSaved }) {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState({});
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [sampleSources, setSampleSources] = useState([]);
  const [sampleSourceId, setSampleSourceId] = useState('');
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState('');
  const [prefillNotice, setPrefillNotice] = useState('');
  const [sampleProfile, setSampleProfile] = useState(null);
  const profileRequest = useRef(null);
  // Latest form values, so a profile that arrives after the user kept typing merges with their newest input.
  const latestForm = useRef(form);
  latestForm.current = form;

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/customers', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Could not load customers. Refresh the page to try again.');
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Could not load customers. Refresh the page to try again.');
        return data;
      })
      .then(data => {
        const selected = selectedCustomerId === null
          ? data[0]
          : data.find(customer => customer.id === selectedCustomerId);
        setCustomers(data);
        onSelectCustomer(selected?.id || '');
        setForm(toForm(selected));
        setLoading(false);
      })
      .catch(error => {
        if (error.name === 'AbortError') return;
        setLoadError(error.message);
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  // Sample data is optional: any failure hides the pre-fill control and leaves the manual form working.
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/sample-data', { signal: controller.signal })
      .then(async response => {
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return [];
        const data = await response.json();
        if (!Array.isArray(data)) return [];
        return data.filter(source => source && typeof source.id === 'string' && source.id && typeof source.label === 'string');
      })
      .then(sources => {
        setSampleSources(sources);
        setSampleSourceId(sources[0]?.id || '');
      })
      .catch(error => {
        if (error.name === 'AbortError') return;
        console.warn('Sample data sources unavailable:', error);
        setSampleSources([]);
      });
    return () => {
      controller.abort();
      profileRequest.current?.abort();
    };
  }, []);

  async function loadSampleProfile() {
    if (!sampleSourceId || sampleLoading) return;
    profileRequest.current?.abort();
    const controller = new AbortController();
    profileRequest.current = controller;
    setSampleLoading(true);
    setSampleError('');
    setPrefillNotice('');
    setNotice('');
    try {
      const response = await fetch(`/api/sample-data/${encodeURIComponent(sampleSourceId)}/profile`, { signal: controller.signal });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('The server could not load this sample data. Please try again.');
      }
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error
          ? `Could not load sample data: ${result.error}`
          : 'Could not load this sample data. Please try again.');
      }
      if (!result || typeof result !== 'object' || !result.suggestedCustomer || typeof result.suggestedCustomer !== 'object') {
        throw new Error('The sample data profile was not in the expected format.');
      }
      const label = result.label || sampleSources.find(source => source.id === sampleSourceId)?.label || sampleSourceId;
      const outcome = applySuggestion(latestForm.current, result.suggestedCustomer);
      setForm(outcome.form);
      setErrors(current => Object.fromEntries(Object.entries(current).filter(([name]) => !outcome.filled.includes(name))));
      setSaveError('');
      setSampleProfile(result);
      setPrefillNotice(describePrefill(label, outcome.filled, outcome.keptExisting));
    } catch (error) {
      if (error.name === 'AbortError') return;
      setSampleError(error.message === 'Failed to fetch'
        ? 'Could not reach the server to load sample data. Please try again.'
        : error.message);
    } finally {
      if (profileRequest.current === controller) {
        profileRequest.current = null;
        setSampleLoading(false);
      }
    }
  }

  function selectCustomer(id) {
    onSelectCustomer(id);
    setForm(toForm(customers.find(customer => customer.id === id)));
    setErrors({});
    setSaveError('');
    setNotice('');
    setPrefillNotice('');
    setSampleError('');
  }

  async function saveCustomer(event) {
    event.preventDefault();
    if (saving) return;
    const details = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]));
    const validationErrors = {};
    if (!details.name) validationErrors.name = 'Enter a company name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.contactEmail)) {
      validationErrors.contactEmail = 'Enter a valid contact email.';
    }
    setErrors(validationErrors);
    setNotice('');
    setSaveError('');
    setPrefillNotice('');
    setSampleError('');
    if (Object.keys(validationErrors).length) {
      event.currentTarget.elements.namedItem(Object.keys(validationErrors)[0]).focus();
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(selectedCustomerId ? `/api/customers/${encodeURIComponent(selectedCustomerId)}` : '/api/customers', {
        method: selectedCustomerId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details)
      });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('The server could not save your changes. Your entries are still here; please try again.');
      }
      const result = await response.json();
      if (!response.ok) {
        setErrors(result.errors || {});
        throw new Error(result.error || 'Could not save customer information. Please try again.');
      }
      setCustomers(current => {
        const exists = current.some(customer => customer.id === result.customer.id);
        return exists ? current.map(customer => customer.id === result.customer.id ? result.customer : customer) : [...current, result.customer];
      });
      onSelectCustomer(result.customer.id);
      setForm(toForm(result.customer));
      setNotice(`Saved ${result.customer.name}. Customer Info is complete. Onboarding progress: ${result.onboarding.progressPercent}%.`);
      onSaved();
    } catch (error) {
      setSaveError(error.message === 'Failed to fetch' ? 'Could not reach the server. Your entries are still here; please try again.' : error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="customer-info" aria-labelledby="customer-info-heading">
      <h2 id="customer-info-heading">Customer Info</h2>
      <p className="section-description">Collect the company details for onboarding. Company name and contact email are required.</p>

      {loading ? <p role="status">Loading customers…</p> : loadError ? <p className="form-error" role="alert">{loadError}</p> : <>
        <div className="customer-picker">
          <div className="form-field">
            <label htmlFor="customer-select">Customer</label>
            <select id="customer-select" value={selectedCustomerId || ''} onChange={event => selectCustomer(event.target.value)} disabled={saving}>
              <option value="">New customer</option>
              {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </div>
          <button type="button" className="secondary-button" onClick={() => selectCustomer('')} disabled={saving}>Add customer</button>
        </div>

        {sampleSources.length > 0 && (
          <div className="sample-prefill">
            <div className="sample-prefill-controls">
              <div className="form-field">
                <label htmlFor="sample-data-select">Pre-fill from sample data</label>
                <select
                  id="sample-data-select"
                  value={sampleSourceId}
                  onChange={event => setSampleSourceId(event.target.value)}
                  disabled={saving || sampleLoading}
                  aria-describedby="sample-data-hint"
                >
                  {sampleSources.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}
                </select>
              </div>
              <button type="button" className="secondary-button" onClick={loadSampleProfile} disabled={saving || sampleLoading || !sampleSourceId}>
                {sampleLoading ? 'Loading…' : 'Load'}
              </button>
            </div>
            <p className="session-note" id="sample-data-hint">Fills empty fields only. Contact email is never pre-filled, and nothing is saved until you click Save customer info.</p>
            {sampleLoading && <p className="session-note" role="status">Loading sample data…</p>}
            {sampleError && <p className="form-error feedback" role="alert">{sampleError}</p>}
            {prefillNotice && <p className="info-message feedback" role="status">{prefillNotice}</p>}
          </div>
        )}

        <form onSubmit={saveCustomer} noValidate>
          <div className="form-grid">
            {FIELDS.map(field => <div className="form-field" key={field.name}>
              <label htmlFor={`customer-${field.name}`}>{field.label}</label>
              <input
                id={`customer-${field.name}`}
                name={field.name}
                type={field.type || 'text'}
                required={field.required}
                maxLength={field.maxLength}
                autoComplete={field.autoComplete || 'off'}
                value={form[field.name]}
                disabled={saving}
                aria-invalid={Boolean(errors[field.name])}
                aria-describedby={errors[field.name] ? `error-${field.name}` : undefined}
                onChange={event => {
                  setForm(current => ({ ...current, [field.name]: event.target.value }));
                  setErrors(current => ({ ...current, [field.name]: undefined }));
                  setNotice('');
                  setSaveError('');
                }}
              />
              {errors[field.name] && <p className="form-error" id={`error-${field.name}`} role="alert">{errors[field.name]}</p>}
            </div>)}
          </div>
          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save customer info'}</button>
            <span className="session-note">Saved for this workshop session. A server restart resets the data.</span>
          </div>
          {saveError && <p className="form-error feedback" role="alert">{saveError}</p>}
          {notice && <p className="success-message feedback" role="status">{notice}</p>}
        </form>

        {sampleProfile && <SampleDataSummary key={sampleProfile.id} profile={sampleProfile} />}
      </>}
    </section>
  );
}
