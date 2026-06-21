import React, { useState, useEffect } from 'react';
import { getTenantKeys, DEMO_TENANT_KEY } from '../../config/tenantRedirect';
import './DevTenantSelector.scss';

const STORAGE_KEY = 'devTenantOverride';

const DEV_TENANT_LABELS = {
  [DEMO_TENANT_KEY]: 'demo (events-demo)',
};

/**
 * Dev-only tenant selector. Allows switching between rpi, tvcog, and demo for local testing
 * without subdomains. Only renders when NODE_ENV !== 'production'.
 */
function DevTenantSelector() {
  const [override, setOverride] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setOverride(localStorage.getItem(STORAGE_KEY) || '');
  }, []);

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  const tenantKeys = getTenantKeys({ includeDemo: true });

  const handleSelect = (value) => {
    if (value === '') {
      localStorage.removeItem(STORAGE_KEY);
      setOverride('');
    } else {
      localStorage.setItem(STORAGE_KEY, value);
      setOverride(value);
    }
    setIsOpen(false);
    window.location.reload();
  };

  const displayLabel = override
    ? (DEV_TENANT_LABELS[override] || override)
    : 'default (rpi)';

  return (
    <div className="DevTenantSelector">
      <button
        type="button"
        className="DevTenantSelector__trigger"
        onClick={() => setIsOpen(!isOpen)}
        title="Switch tenant for local testing"
        aria-label={`Tenant override: ${displayLabel}`}
      >
        <span className="DevTenantSelector__label">Tenant: {displayLabel}</span>
      </button>
      {isOpen && (
        <div className="DevTenantSelector__dropdown">
          <button
            type="button"
            onClick={() => handleSelect('')}
            className={`DevTenantSelector__option ${!override ? 'DevTenantSelector__option--active' : ''}`}
          >
            default (rpi)
          </button>
          {tenantKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleSelect(key)}
              className={`DevTenantSelector__option ${override === key ? 'DevTenantSelector__option--active' : ''}`}
            >
              {DEV_TENANT_LABELS[key] || key}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default DevTenantSelector;
