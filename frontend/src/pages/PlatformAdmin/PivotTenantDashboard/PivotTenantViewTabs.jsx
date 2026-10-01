import React from 'react';
import './PivotTenantViewTabs.scss';

/**
 * Segmented view switch under a city page header (Audience, Growth).
 * `views` is `[{ id, label }]`; the owning page keeps `value` in the URL.
 */
function PivotTenantViewTabs({ views, value, onChange, ariaLabel }) {
  return (
    <div className="pivot-tenant-view-tabs" role="tablist" aria-label={ariaLabel}>
      {views.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          className={value === option.id ? 'is-active' : undefined}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default PivotTenantViewTabs;
