import React from 'react';
import { useLocation } from 'react-router-dom';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { getCurrentTenantKey, getCurrentTenantDisplayName, getWwwUrl } from '../../../config/tenantRedirect';
import './TenantSelectorBanner.scss';

/**
 * Banner shown on login/register pages to display current institution and allow changing it.
 * Change redirects to www subdomain so user picks from the domain picker.
 */
function TenantSelectorBanner() {
  const location = useLocation();
  const tenantKey = getCurrentTenantKey();
  const displayName = getCurrentTenantDisplayName();

  if (!tenantKey) return null;

  const handleChange = () => {
    const path = location.pathname + (location.search || '');
    const next = path !== '/' ? `?next=${encodeURIComponent(path)}` : '';
    window.location.href = getWwwUrl(`/select-school${next}`);
  };

  return (
    <div className="TenantSelectorBanner">
      <span className="TenantSelectorBanner__name">{displayName}</span>
      <button
        type="button"
        className="TenantSelectorBanner__change"
        onClick={handleChange}
      >
        Change
        <Icon icon="mdi:chevron-right" />
      </button>
    </div>
  );
}

export default TenantSelectorBanner;
