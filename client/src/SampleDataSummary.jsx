import React, { useState } from 'react';

const COLLAPSED_ISSUE_LIMIT = 5;
const COUNT_LABELS = [
  { key: 'clients', label: 'Clients' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'chartOfAccounts', label: 'Chart of accounts' },
  { key: 'transactions', label: 'Transactions' }
];

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function displayValue(value) {
  return value === undefined || value === null || value === '' ? 'Unknown' : String(value);
}

export default function SampleDataSummary({ profile }) {
  const [showAllIssues, setShowAllIssues] = useState(false);
  // Errors first (stable sort keeps the server's order within each severity) so they are visible when collapsed.
  const issues = (Array.isArray(profile.issues) ? [...profile.issues] : [])
    .sort((a, b) => (a?.severity === 'error' ? 0 : 1) - (b?.severity === 'error' ? 0 : 1));
  const errorCount = issues.filter(issue => issue.severity === 'error').length;
  const warningCount = issues.length - errorCount;
  const visibleIssues = showAllIssues ? issues : issues.slice(0, COLLAPSED_ISSUE_LIMIT);
  const hiddenCount = issues.length - visibleIssues.length;

  return (
    <section className="sample-summary" aria-labelledby="sample-summary-heading">
      <h3 id="sample-summary-heading">Sample data summary: {profile.label || profile.id}</h3>
      <dl className="sample-summary-facts">
        <div><dt>Schema style</dt><dd>{displayValue(profile.schemaStyle)}</dd></div>
        <div><dt>Date format</dt><dd>{displayValue(profile.dateFormat)}</dd></div>
        <div><dt>Currency</dt><dd>{displayValue(profile.currency)}</dd></div>
      </dl>
      <dl className="sample-summary-counts" aria-label="Record counts">
        {COUNT_LABELS.map(({ key, label }) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{Number.isFinite(profile.counts?.[key]) ? profile.counts[key] : '—'}</dd>
          </div>
        ))}
      </dl>

      <h4 className="sample-issues-heading">Data issues</h4>
      {issues.length === 0 ? (
        <p className="sample-issues-none">No data issues found</p>
      ) : <>
        <p className="sample-issues-totals">{plural(errorCount, 'error')}, {plural(warningCount, 'warning')}</p>
        <ul className="sample-issues" id="sample-issues-list">
          {visibleIssues.map((issue, index) => {
            const severity = issue.severity === 'error' ? 'error' : 'warning';
            return (
              <li key={`${issue.file}-${issue.row}-${issue.field}-${index}`} className={`sample-issue ${severity}`}>
                <span className={`issue-badge ${severity}`}>{severity === 'error' ? 'Error' : 'Warning'}</span>
                <span>
                  <span className="issue-location">
                    {displayValue(issue.file)}, row {displayValue(issue.row)}, field {displayValue(issue.field)}:
                  </span>{' '}
                  {displayValue(issue.message)}
                </span>
              </li>
            );
          })}
        </ul>
        {issues.length > COLLAPSED_ISSUE_LIMIT && (
          <button
            type="button"
            className="link-button"
            aria-expanded={showAllIssues}
            aria-controls="sample-issues-list"
            onClick={() => setShowAllIssues(value => !value)}
          >
            {showAllIssues ? 'Show fewer issues' : `Show ${hiddenCount} more ${hiddenCount === 1 ? 'issue' : 'issues'}`}
          </button>
        )}
      </>}
    </section>
  );
}
