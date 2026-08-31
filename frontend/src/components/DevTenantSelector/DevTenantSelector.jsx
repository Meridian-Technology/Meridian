import React, { useState, useEffect } from 'react';
import {
  JUSTGO_HOST_OVERRIDE_KEY,
  getTenantKeys,
  readJustGoHostOverride,
} from '../../config/tenantRedirect';
import './DevTenantSelector.scss';

const STORAGE_KEY = 'devTenantOverride';
const JUSTGO_MODE = '__justgo_apex__';

/**
 * Dev-only tenant selector. Allows switching between rpi and tvcog for local testing
 * without subdomains. Only renders when NODE_ENV !== 'production'.
 */
function DevTenantSelector() {
  const [override, setOverride] = useState('');
  const [justGoHost, setJustGoHost] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setOverride(localStorage.getItem(STORAGE_KEY) || '');
    setJustGoHost(readJustGoHostOverride());
  }, []);

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  const tenantKeys = getTenantKeys({ includeHidden: true, includePivot: true });

  const handleSelect = (value) => {
    if (value === JUSTGO_MODE) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(JUSTGO_HOST_OVERRIDE_KEY, '1');
      setOverride('');
      setJustGoHost(true);
    } else if (value === '') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(JUSTGO_HOST_OVERRIDE_KEY);
      setOverride('');
      setJustGoHost(false);
    } else {
      localStorage.setItem(STORAGE_KEY, value);
      localStorage.removeItem(JUSTGO_HOST_OVERRIDE_KEY);
      setOverride(value);
      setJustGoHost(false);
    }
    setIsOpen(false);
    window.location.reload();
  };

  const displayLabel = justGoHost ? 'justgo.lol (apex)' : override || 'default (rpi)';

  return (
    <div className="DevTenantSelector">
      <button
        type="button"
        className="DevTenantSelector__trigger"
        onClick={() => setIsOpen(!isOpen)}
        title="Switch tenant or public host for local testing"
        aria-label={`Development context: ${displayLabel}`}
      >
        <span className="DevTenantSelector__label">Dev context: {displayLabel}</span>
      </button>
      {isOpen && (
        <div className="DevTenantSelector__dropdown">
          <button
            type="button"
            onClick={() => handleSelect('')}
            className={`DevTenantSelector__option ${!override && !justGoHost ? 'DevTenantSelector__option--active' : ''}`}
          >
            default (rpi)
          </button>
          <button
            type="button"
            onClick={() => handleSelect(JUSTGO_MODE)}
            className={`DevTenantSelector__option ${justGoHost ? 'DevTenantSelector__option--active' : ''}`}
          >
            justgo.lol (apex)
          </button>
          {tenantKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleSelect(key)}
              className={`DevTenantSelector__option ${override === key ? 'DevTenantSelector__option--active' : ''}`}
            >
              {key}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default DevTenantSelector;
