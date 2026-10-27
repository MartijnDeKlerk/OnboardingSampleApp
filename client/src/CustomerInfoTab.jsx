import React, { useEffect, useState } from 'react';

const EMPTY_FORM = { name: '', contactEmail: '', industry: '', region: '' };
const FIELDS = [
  { name: 'name', label: 'Company name', required: true, maxLength: 200, autoComplete: 'organization' },
  { name: 'contactEmail', label: 'Contact email', required: true, type: 'email', maxLength: 254, autoComplete: 'email' },
  { name: 'industry', label: 'Industry (optional)', maxLength: 200 },
  { name: 'region', label: 'Region (optional)', maxLength: 200 }
];

function toForm(customer) {
  return Object.fromEntries(FIELDS.map(field => [field.name, customer?.[field.name] || '']));
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

  function selectCustomer(id) {
    onSelectCustomer(id);
    setForm(toForm(customers.find(customer => customer.id === id)));
    setErrors({});
    setSaveError('');
    setNotice('');
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
      </>}
    </section>
  );
}
