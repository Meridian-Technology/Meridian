import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { isPivotTenant } from '../TenantManagement/tenantPivotUtils';
import { PIVOT_TENANT_PAGES } from './pivotTenantPageRoutes';
import {
  PIVOT_FLEET_NOTIFICATIONS_PAGE,
  PIVOT_TENANT_NOTIFICATIONS_PAGE,
} from '../PivotNotifications/notificationJobRoutes';
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

/** Menu indexes that share a label across fleet vs city shells. */
export const PIVOT_OPS_PAGES = Object.freeze({
  overview: PIVOT_TENANT_PAGES.overview,
  fleetVoice: 1,
  fleetGrowth: 2,
  fleetCompute: 3,
  // Legacy fleet Analytics index; it redirects to Growth → Acquisition.
  fleetAnalytics: 4,
  fleetNotifications: PIVOT_FLEET_NOTIFICATIONS_PAGE,
  cityVoice: PIVOT_TENANT_PAGES.voice,
  cityGrowth: PIVOT_TENANT_PAGES.growth,
  cityNotifications: PIVOT_TENANT_NOTIFICATIONS_PAGE,
  cityCompute: PIVOT_TENANT_PAGES.computeJobs,
  // Legacy city Analytics index; it redirects to Growth → Acquisition.
  cityAnalytics: PIVOT_TENANT_PAGES.analytics,
});

/** Growth views (`?growth=`) each shell has; the rest fall back to Overview. */
const GROWTH_VIEWS_BY_SHELL = Object.freeze({
  fleet: new Set(['landing', 'acquisition']),
  city: new Set(['landing', 'waitlist', 'qr', 'acquisition']),
});

function parsePageParam(searchParams) {
  const raw = searchParams.get('page');
  if (raw == null || raw === '') return PIVOT_OPS_PAGES.overview;
  const parsed = parseInt(raw, 10);
  return Number.isInteger(parsed) ? parsed : PIVOT_OPS_PAGES.overview;
}

function pageLabelForShell(shell, page) {
  if (page === PIVOT_OPS_PAGES.overview) return 'overview';
  const pages = shell === 'fleet'
    ? {
        voice: PIVOT_OPS_PAGES.fleetVoice,
        growth: PIVOT_OPS_PAGES.fleetGrowth,
        compute: PIVOT_OPS_PAGES.fleetCompute,
        analytics: PIVOT_OPS_PAGES.fleetAnalytics,
        notifications: PIVOT_OPS_PAGES.fleetNotifications,
      }
    : {
        voice: PIVOT_OPS_PAGES.cityVoice,
        growth: PIVOT_OPS_PAGES.cityGrowth,
        compute: PIVOT_OPS_PAGES.cityCompute,
        analytics: PIVOT_OPS_PAGES.cityAnalytics,
        notifications: PIVOT_OPS_PAGES.cityNotifications,
      };
  return Object.keys(pages).find((label) => pages[label] === page) || null;
}

function pageForLabel(shell, label) {
  const fleet = shell === 'fleet';
  if (label === 'voice') return fleet ? PIVOT_OPS_PAGES.fleetVoice : PIVOT_OPS_PAGES.cityVoice;
  if (label === 'growth') return fleet ? PIVOT_OPS_PAGES.fleetGrowth : PIVOT_OPS_PAGES.cityGrowth;
  if (label === 'compute') return fleet ? PIVOT_OPS_PAGES.fleetCompute : PIVOT_OPS_PAGES.cityCompute;
  if (label === 'notifications') {
    return fleet ? PIVOT_OPS_PAGES.fleetNotifications : PIVOT_OPS_PAGES.cityNotifications;
  }
  return PIVOT_OPS_PAGES.overview;
}

/**
 * Remap `?page=` by menu label when switching fleet ↔ city.
 * Shared labels (Voice, Growth, Compute jobs, Notifications) keep their tab, and
 * Growth keeps its `growth` view when the other shell has it (Waitlist and QR
 * codes are city-only, so they land on fleet Growth → Overview). Legacy
 * Analytics indexes land on Growth → Acquisition.
 * City-only pages (Curation, Catalog, …) have no fleet equivalent and drop to Overview.
 */
export function remapPivotOpsSearch(searchParams, { from, to }) {
  const params = new URLSearchParams(searchParams);
  if (from === to) {
    const query = params.toString();
    return query ? `?${query}` : '';
  }

  const fromPage = parsePageParam(params);
  let label = from === 'city'
    && fromPage === PIVOT_TENANT_PAGES.carousel
    && params.get('creative') === 'copy'
    ? 'voice'
    : pageLabelForShell(from, fromPage);
  let growthView = params.get('growth');
  if (label === 'analytics') {
    label = 'growth';
    growthView = 'acquisition';
  }

  const nextPage = pageForLabel(to, label);
  if (!nextPage) {
    params.delete('page');
  } else {
    params.set('page', String(nextPage));
  }
  params.delete('creative');
  params.delete('growth');
  if (label === 'growth' && GROWTH_VIEWS_BY_SHELL[to].has(growthView)) {
    params.set('growth', growthView);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * Pivot-only city switcher for Just Go ops dashboards.
 * Navigates between /platform-admin/pivot (all cities) and
 * /platform-admin/pivot/:tenantKey. City → city keeps ?page=;
 * fleet ↔ city remaps shared tabs by label (Voice 1↔5, Growth 2↔6, Compute 3↔10,
 * Notifications 5↔9); legacy Analytics 4 / 11 land on Growth → Acquisition.
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

  const isAllCities = !currentKey;

  const displayLabel =
    cityDisplayName ||
    (isAllCities
      ? 'All cities'
      : cityLabel(pivotTenants.find((row) => normalizeTenantKey(row.tenantKey) === currentKey))) ||
    currentKey ||
    (loading ? 'Loading…' : 'Pivot city');

  const handleSelectTenant = useCallback(
    (tenantKey) => {
      const nextKey = normalizeTenantKey(tenantKey);
      if (nextKey === currentKey) {
        setShowDrop(false);
        return;
      }
      const from = currentKey ? 'city' : 'fleet';
      const to = nextKey ? 'city' : 'fleet';
      const query = remapPivotOpsSearch(searchParams, { from, to });
      navigate(
        nextKey
          ? `/platform-admin/pivot/${nextKey}${query}`
          : `/platform-admin/pivot${query}`,
      );
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
            <div
              className={`drop-option ${isAllCities ? 'selected' : ''}`}
              role="option"
              aria-selected={isAllCities}
              onClick={() => handleSelectTenant('')}
            >
              <Icon
                icon="mdi:earth"
                width={22}
                height={22}
                className="admin-tenant-dropdown__row-icon"
                aria-hidden
              />
              <div className="admin-tenant-dropdown__option-text">
                <p>All cities</p>
                <span className="admin-tenant-dropdown__meta">Fleet overview</span>
              </div>
            </div>
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
