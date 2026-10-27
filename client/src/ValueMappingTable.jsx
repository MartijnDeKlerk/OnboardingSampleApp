import React from 'react';

// Review picklist values for each mapped field. `valueMappings` comes from the
// last preview; `overrides` holds the user's local choices ({ [field]: { [source]: target } }).
export default function ValueMappingTable({ valueMappings, overrides, disabled, onChange }) {
  if (!valueMappings?.length) return null;
  return <div className="value-mapping" data-testid="value-mapping">
    <h4>Value mapping</h4>
    <p className="session-note">Map each source value to a target value. Suggestions come from the analysis; every value must be mapped before saving.</p>
    {valueMappings.map(group => <div key={group.field} className="table-scroll value-mapping-group">
      <table className="data-table mapping-table value-mapping-table">
        <caption>{group.label}</caption>
        <thead><tr><th scope="col">Source value</th><th scope="col">Rows</th><th scope="col">Target</th></tr></thead>
        <tbody>{group.values.map(value => {
          const override = overrides?.[group.field]?.[value.source];
          const current = override ?? value.target ?? '';
          const suggested = value.suggested != null && current === value.suggested;
          return <tr key={value.source} className={current ? undefined : 'value-unmapped'}>
            <th scope="row"><code>{value.source === '' ? '(blank)' : value.source}</code></th>
            <td>{value.count}</td>
            <td>
              <div className="value-target">
                <select aria-label={`Target for ${group.label} "${value.source}"`} value={current} disabled={disabled} onChange={event => onChange(group.field, value.source, event.target.value)}>
                  <option value="">Choose…</option>
                  {group.targets.map(target => <option key={target} value={target}>{target}</option>)}
                </select>
                {!current ? <span className="issue-badge error">Unmapped</span>
                  : suggested ? <span className="issue-badge suggested">Suggested</span>
                  : <span className="issue-badge overridden">Overridden</span>}
              </div>
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>)}
  </div>;
}
