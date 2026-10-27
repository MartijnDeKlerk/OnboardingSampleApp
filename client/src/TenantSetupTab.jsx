import React, { useEffect, useRef, useState } from 'react';

const POLL_MS = 500;
const EMPTY_FORM = { plan: 'professional', subdomain: '', dataRegion: 'US', currency: 'USD', dateFormat: 'MM/DD/YYYY', adminEmail: '' };
const FIELDS = [
  { name: 'plan', label: 'Plan', options: [['starter', 'Starter'], ['professional', 'Professional'], ['enterprise', 'Enterprise']] },
  { name: 'subdomain', label: 'Subdomain', hint: '3–40 lowercase letters, numbers and hyphens. Must be unique.', maxLength: 40 },
  { name: 'dataRegion', label: 'Data region', options: [['EU', 'EU'], ['US', 'US']] },
  { name: 'currency', label: 'Currency', options: [['GBP', 'GBP'], ['EUR', 'EUR'], ['USD', 'USD']] },
  { name: 'dateFormat', label: 'Date format', options: [['DD/MM/YYYY', 'DD/MM/YYYY'], ['MM/DD/YYYY', 'MM/DD/YYYY'], ['YYYY-MM-DD', 'YYYY-MM-DD']] },
  { name: 'adminEmail', label: 'Admin email', type: 'email', maxLength: 254 }
];
export const TENANT_STATUS_LABELS = { pending: 'Pending', provisioning: 'Provisioning', active: 'Active', failed: 'Failed' };

class RequestError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new RequestError('The server is unavailable. Your settings are still here; please try again.', response.status);
  }
  const data = await response.json();
  if (!response.ok) throw new RequestError(data.error || 'The request failed. Please try again.', response.status, data);
  return data;
}

function readableError(error) {
  return error.message === 'Failed to fetch' ? 'Could not reach the server. Your settings are still here; please try again.' : error.message;
}

function toForm(tenant, defaults) {
  const configured = tenant?.subdomain ? tenant : { ...defaults, plan: tenant?.plan || defaults?.plan };
  return Object.fromEntries(Object.keys(EMPTY_FORM).map(name => [name, configured?.[name] || EMPTY_FORM[name]]));
}

export default function TenantSetupTab({ selectedCustomerId, onSelectCustomer, onSaved, onCustomerInfo }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [details, setDetails] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const customerId = selectedCustomerId || '';
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const focusAfterSave = useRef(null);

  // Fields are disabled while saving, so move focus to the first invalid field once re-enabled.
  useEffect(() => {
    if (saving || !focusAfterSave.current) return;
    focusAfterSave.current();
    focusAfterSave.current = null;
  }, [saving]);

  useEffect(() => {
    const controller = new AbortController();
    requestJson('/api/customers', { signal: controller.signal }).then(data => {
      setCustomers(data);
      if (!selectedCustomerId || !data.some(customer => customer.id === selectedCustomerId)) onSelectCustomer(data[0]?.id || '');
      setLoading(false);
    }).catch(err => {
      if (err.name === 'AbortError') return;
      setLoadError(readableError(err));
      setLoading(false);
    });
    return () => controller.abort();
  }, []);

  // Load gating, the existing tenant and suggested settings for the selected customer.
  useEffect(() => {
    setDetails(null);
    setTenant(null);
    setErrors({});
    setError('');
    setNotice('');
    if (!customerId) return;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    Promise.all([
      requestJson(`/api/customers/${encodeURIComponent(customerId)}/onboarding`, options),
      requestJson(`/api/customers/${encodeURIComponent(customerId)}/tenant`, options).catch(err => {
        if (err.status === 404) return null;
        throw err;
      }),
      requestJson(`/api/customers/${encodeURIComponent(customerId)}/tenant/defaults`, options)
    ]).then(([onboarding, existing, defaults]) => {
      setDetails({ onboarding, defaults });
      setTenant(existing);
      setForm(toForm(existing, defaults));
    }).catch(err => { if (err.name !== 'AbortError') setError(readableError(err)); });
    return () => controller.abort();
  }, [customerId]);

  // Poll while provisioning; stops on unmount, customer change, or a final status.
  const provisioning = tenant?.status === 'provisioning';
  useEffect(() => {
    if (!provisioning || !customerId) return;
    let timer;
    let cancelled = false;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const latest = await requestJson(`/api/customers/${encodeURIComponent(customerId)}/tenant`, { signal: controller.signal });
        if (cancelled) return;
        if (latest.status === 'provisioning') { timer = setTimeout(poll, POLL_MS); return; }
        const onboarding = await requestJson(`/api/customers/${encodeURIComponent(customerId)}/onboarding`, { signal: controller.signal });
        if (cancelled) return;
        setTenant(latest);
        setDetails(current => current && { ...current, onboarding });
        setNotice(latest.status === 'active'
          ? `Tenant ${latest.subdomain} is active. Tenant Setup is complete. Onboarding progress: ${onboarding.progressPercent}%.`
          : '');
        onSavedRef.current();
      } catch (err) {
        if (cancelled || err.name === 'AbortError') return;
        timer = setTimeout(poll, POLL_MS * 2);
      }
    };
    timer = setTimeout(poll, POLL_MS);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [provisioning, customerId]);

  async function provision(event) {
    event.preventDefault();
    if (saving || provisioning) return;
    const formElement = event.currentTarget;
    setSaving(true);
    setErrors({});
    setError('');
    setNotice('');
    try {
      const result = await requestJson(`/api/customers/${encodeURIComponent(customerId)}/tenant`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
      });
      setTenant(result.tenant);
      setForm(toForm(result.tenant));
      setDetails(current => current && { ...current, onboarding: result.onboarding });
      onSaved();
    } catch (err) {
      const fieldErrors = err.data?.errors || {};
      setErrors(fieldErrors);
      setError(readableError(err));
      const first = Object.keys(fieldErrors)[0];
      focusAfterSave.current = first ? () => formElement.elements.namedItem(first)?.focus() : null;
    } finally {
      setSaving(false);
    }
  }

  const infoComplete = Boolean(details?.onboarding.steps.some(step => step.id === 'step_1' && step.status === 'completed'));
  const status = tenant?.status;
  const busy = saving || provisioning;
  const submitLabel = saving ? 'Submitting…'
    : status === 'failed' ? 'Retry provisioning'
    : status === 'active' ? 'Re-provision with changes'
    : 'Provision tenant';

  return <section className="tenant-setup" aria-labelledby="tenant-setup-heading">
    <h2 id="tenant-setup-heading">Tenant Setup</h2>
    <p className="section-description">Provision the customer's platform tenant. Settings are pre-filled from Customer Info; Data Mapping is not required.</p>
    {loading ? <p role="status">Loading customers…</p> : loadError ? <p className="form-error" role="alert">{loadError}</p> : <>
      <div className="customer-picker">
        <div className="form-field">
          <label htmlFor="tenant-customer">Customer</label>
          <select id="tenant-customer" value={customerId} disabled={saving} onChange={event => onSelectCustomer(event.target.value)}>
            {!customers.length && <option value="">No customers yet</option>}
            {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </div>
      </div>

      {details && <>
        <dl className="tenant-summary">
          <div><dt>Tenant status</dt><dd><TenantBadge status={status} /></dd></div>
          {tenant?.subdomain && <div><dt>Subdomain</dt><dd>{tenant.subdomain}</dd></div>}
          <div><dt>Onboarding progress</dt><dd>{details.onboarding.progressPercent}%</dd></div>
        </dl>

        {!infoComplete && <p className="mapping-warning">Save Customer Info for this customer before setting up the tenant. <button type="button" className="text-button" onClick={onCustomerInfo}>Open Customer Info</button></p>}

        {provisioning && <p className="info-message feedback" role="status">Provisioning {tenant.subdomain}… This usually takes a few seconds.</p>}
        {notice && !provisioning && <p className="success-message feedback" role="status">{notice}</p>}
        {status === 'failed' && !error && <div className="form-error feedback tenant-failure" role="alert">
          <strong>Provisioning failed.</strong> {tenant.failureReason || 'The provisioning service reported an error.'}
        </div>}

        <form onSubmit={provision} noValidate className="tenant-form">
          <div className="form-grid">
            {FIELDS.map(field => {
              const id = `tenant-${field.name}`;
              const describedBy = [field.hint && `${id}-hint`, errors[field.name] && `${id}-error`].filter(Boolean).join(' ') || undefined;
              const common = {
                id, name: field.name, value: form[field.name], disabled: busy || !infoComplete,
                'aria-invalid': Boolean(errors[field.name]), 'aria-describedby': describedBy,
                onChange: event => {
                  setForm(current => ({ ...current, [field.name]: event.target.value }));
                  setErrors(current => ({ ...current, [field.name]: undefined }));
                }
              };
              return <div className="form-field" key={field.name}>
                <label htmlFor={id}>{field.label}</label>
                {field.options
                  ? <select {...common}>{field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                  : <input {...common} type={field.type || 'text'} maxLength={field.maxLength} autoComplete="off" spellCheck={false} />}
                {field.hint && <p className="session-note" id={`${id}-hint`}>{field.hint}</p>}
                {errors[field.name] && <p className="form-error" id={`${id}-error`}>{errors[field.name]}</p>}
              </div>;
            })}
          </div>
          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={busy || !infoComplete || !customerId}>{submitLabel}</button>
            <span className="session-note">Simulated provisioning. Subdomains starting with "fail-" fail on purpose.</span>
          </div>
        </form>
      </>}
      {error && <p className="form-error feedback" role="alert">{error}</p>}
    </>}
  </section>;
}

export function TenantBadge({ status }) {
  const key = status || 'none';
  return <span className={`tenant-badge ${key}`}>{TENANT_STATUS_LABELS[status] || 'No tenant'}</span>;
}
