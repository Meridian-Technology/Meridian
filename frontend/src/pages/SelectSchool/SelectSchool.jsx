import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import {
  getTenantDefinitions,
  getTenantRedirectUrl,
  setLastTenant,
  setTenantConfigCache,
} from '../../config/tenantRedirect';
import useAuth from '../../hooks/useAuth';
import backgroundImage from '../../assets/LandingBackground.png';
import logo from '../../assets/Brand Image/BEACON.svg';
import './SelectSchool.scss';

const STORAGE_KEY = 'devTenantOverride';

/**
 * School picker page. Shown when user on www (or localhost in dev) tries to access login/register.
 * User must choose a school before auth; redirects to tenant subdomain.
 */
function SelectSchool() {
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [tenants, setTenants] = useState(() => getTenantDefinitions());
  const nextParam = searchParams.get('next');
  // When already logged in, go to dashboard instead of login to avoid flash/redirect loop
  const nextPath = nextParam || (isAuthenticated ? '/events-dashboard' : '/login');

  useEffect(() => {
    let cancelled = false;
    async function loadTenantConfig() {
      try {
        const response = await fetch('/api/tenant-config', { credentials: 'include' });
        if (!response.ok) return;
        const payload = await response.json();
        if (!payload?.success || !Array.isArray(payload?.data?.tenants)) return;
        setTenantConfigCache(payload.data.tenants);
        if (!cancelled) {
          setTenants(getTenantDefinitions());
        }
      } catch (_) {}
    }
    loadTenantConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const domains = useMemo(
    () =>
      tenants.map((tenant) => ({
        key: tenant.tenantKey,
        name: tenant.name || tenant.tenantKey,
        subdomain: tenant.subdomain || tenant.tenantKey,
        location: tenant.location || '',
        status: tenant.status || 'active',
        statusMessage: tenant.statusMessage || '',
      })),
    [tenants]
  );

  const redirectToTenant = (school, path) => {
    if (!school) return;
    setLastTenant(school);
    if (process.env.NODE_ENV !== 'production') {
      try {
        localStorage.setItem(STORAGE_KEY, school);
      } catch (_) {}
      window.location.href = `${window.location.origin}${path}`;
      return;
    }
    window.location.href = getTenantRedirectUrl(school, path);
  };

  const isTenantSelectable = (domain) => domain.status === 'active';

  const getStatusLabel = (status) => {
    if (status === 'coming_soon') return 'Coming soon';
    if (status === 'maintenance') return 'Under maintenance';
    return '';
  };

  return (
    <div className="SelectSchool" style={{ backgroundImage: `url(${backgroundImage})` }}>
      <div className="SelectSchool__overlay" />
      <div className="SelectSchool__content">
        <header className="SelectSchool__header">
          <div className="SelectSchool__logo">
            <img src={logo} alt="Meridian" />
          </div>
          <h1 className="SelectSchool__title">Select your institution</h1>
          <p className="SelectSchool__subtitle">
            Choose your university or organization to continue
          </p>
        </header>

        <div className="SelectSchool__domains">
          {domains.length === 0 ? (
            <div className="SelectSchool__empty">No institutions are currently available.</div>
          ) : (
            domains.map((domain) => (
              <div
                key={domain.key}
                className={`SelectSchool__card ${!isTenantSelectable(domain) ? 'SelectSchool__card--disabled' : ''}`}
                role="button"
                aria-disabled={!isTenantSelectable(domain)}
                tabIndex={isTenantSelectable(domain) ? 0 : -1}
                onClick={() => isTenantSelectable(domain) && redirectToTenant(domain.key, nextPath)}
                onKeyDown={(e) => e.key === 'Enter' && isTenantSelectable(domain) && redirectToTenant(domain.key, nextPath)}
              >
                <div className="SelectSchool__card-icon">
                  <Icon icon="mdi:school" />
                </div>
                <div className="SelectSchool__card-info">
                  <span className="SelectSchool__card-name">
                    {domain.name}
                    {domain.status !== 'active' && (
                      <span className="SelectSchool__status-tag">{getStatusLabel(domain.status)}</span>
                    )}
                  </span>
                  <span className="SelectSchool__card-domain">{domain.subdomain}.meridian.study</span>
                  {domain.location && (
                    <span className="SelectSchool__card-location">{domain.location}</span>
                  )}
                  {domain.statusMessage && (
                    <span className="SelectSchool__card-status-message">{domain.statusMessage}</span>
                  )}
                </div>
                {isTenantSelectable(domain) && (
                  <Icon icon="mdi:chevron-right" className="SelectSchool__card-chevron" />
                )}
              </div>
            ))
          )}
        </div>

        {nextParam && nextParam !== '/login' && nextParam !== '/register' && (
          <p className="SelectSchool__hint">Select an institution above to continue</p>
        )}
      </div>
    </div>
  );
}

export default SelectSchool;
