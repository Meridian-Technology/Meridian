import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { getCurrentTenantKey, getCurrentTenantDisplayName } from '../../../config/tenantRedirect';
import './TenantSelectorBanner.scss';

/**
 * Banner shown on login/register pages to display current institution and allow changing it.
 */
function TenantSelectorBanner() {
  const navigate = useNavigate();
  const location = useLocation();
  const tenantKey = getCurrentTenantKey();
  const displayName = getCurrentTenantDisplayName();

  if (!tenantKey) return null;

  const handleChange = () => {
    const path = location.pathname + (location.search || '');
    const next = path !== '/' ? `?next=${encodeURIComponent(path)}` : '';
    navigate(`/select-school${next}`);
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
