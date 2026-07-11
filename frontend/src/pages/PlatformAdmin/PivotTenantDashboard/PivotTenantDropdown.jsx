import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { isPivotTenant } from '../TenantManagement/tenantPivotUtils';
import '../../ClubDash/OrgDropdown/OrgDropdown.scss';
import '../../Admin/AdminTenantDropdown/AdminTenantDropdown.scss';
import './PivotTenantDropdown.scss';

function normalizeTenantKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function cityLabel(tenant) {
  if (!tenant) return '';
  return tenant.location || tenant.name || tenant.tenantKey || '';
}

/**
 * Pivot-only city switcher for the per-tenant ops dashboard.
 * Navigates within /platform-admin/pivot/:tenantKey and preserves ?page= (+ filters).
 */
function PivotTenantDropdown({
  tenants = [],
  currentTenantKey,
  cityDisplayName,
  loading = false,
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showDrop, setShowDrop] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  const currentKey = normalizeTenantKey(currentTenantKey);

  const pivotTenants = useMemo(() => {
    return (tenants || [])
      .filter(isPivotTenant)
      .slice()
      .sort((a, b) => cityLabel(a).localeCompare(cityLabel(b), undefined, { sensitivity: 'base' }));
  }, [tenants]);

  useEffect(() => {
    if (showDrop) {
      setShouldRender(true);
      setIsAnimating(true);
      return undefined;
    }
    setIsAnimating(false);
    const timer = setTimeout(() => setShouldRender(false), 200);
    return () => clearTimeout(timer);
  }, [showDrop]);

  const displayLabel =
    cityDisplayName ||
    cityLabel(pivotTenants.find((row) => normalizeTenantKey(row.tenantKey) === currentKey)) ||
    currentKey ||
    (loading ? 'Loading…' : 'Pivot city');

  const handleSelectTenant = useCallback(
    (tenantKey) => {
      const nextKey = normalizeTenantKey(tenantKey);
      if (!nextKey || nextKey === currentKey) {
        setShowDrop(false);
        return;
      }
      const query = searchParams.toString();
      navigate(`/platform-admin/pivot/${nextKey}${query ? `?${query}` : ''}`);
      setShowDrop(false);
    },
    [currentKey, navigate, searchParams],
  );

  return (
    <div
      className="org-dropdown admin-tenant-dropdown pivot-tenant-dropdown"
      onClick={() => setShowDrop(!showDrop)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setShowDrop(!showDrop);
        }
      }}
      aria-expanded={showDrop}
      aria-haspopup="listbox"
      aria-label="Switch pivot city"
    >
      <Icon
        icon="mdi:map-marker-radius-outline"
        width={22}
        height={22}
        className="pivot-tenant-dropdown__lead-icon"
        aria-hidden
      />
      <div className="admin-tenant-dropdown__titles">
        <h1 title={displayLabel}>{displayLabel}</h1>
        {currentKey ? <span className="admin-tenant-dropdown__key">{currentKey}</span> : null}
      </div>
      <Icon
        className="admin-tenant-dropdown__chevron"
        icon={showDrop ? 'ic:round-keyboard-arrow-up' : 'ic:round-keyboard-arrow-down'}
        width="24"
        height="24"
        aria-hidden
      />
      {shouldRender ? (
        <div
          className={`dropdown ${!isAnimating ? 'dropdown-exit' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="org-list" role="listbox">
            {loading && !pivotTenants.length ? (
              <div className="drop-option pivot-tenant-dropdown__empty" role="presentation">
                <p>Loading cities…</p>
              </div>
            ) : null}
            {!loading && !pivotTenants.length ? (
              <div className="drop-option pivot-tenant-dropdown__empty" role="presentation">
                <p>No pivot cities</p>
              </div>
            ) : null}
            {pivotTenants.map((tenant) => {
              const key = normalizeTenantKey(tenant.tenantKey);
              const selected = key === currentKey;
              return (
                <div
                  className={`drop-option ${selected ? 'selected' : ''}`}
                  key={tenant.tenantKey}
                  role="option"
                  aria-selected={selected}
                  onClick={() => handleSelectTenant(tenant.tenantKey)}
                >
                  <Icon
                    icon="mdi:city-variant-outline"
                    width={22}
                    height={22}
                    className="admin-tenant-dropdown__row-icon"
                    aria-hidden
                  />
                  <div className="admin-tenant-dropdown__option-text">
                    <p>{cityLabel(tenant)}</p>
                    <span className="admin-tenant-dropdown__meta">
                      {tenant.tenantKey}
                      {tenant.status && tenant.status !== 'active'
                        ? ` · ${String(tenant.status).replace(/_/g, ' ')}`
                        : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default PivotTenantDropdown;
