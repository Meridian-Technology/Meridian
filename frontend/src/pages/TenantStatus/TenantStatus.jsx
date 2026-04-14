import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import backgroundImage from '../../assets/LandingBackground.png';
import logo from '../../assets/Brand Image/BEACON.svg';
import './TenantStatus.scss';
import { getCurrentTenantKey } from '../../config/tenantRedirect';

function prettifyTenantLabel(tenantKey) {
  if (!tenantKey) return 'selected';
  return tenantKey.toUpperCase();
}

function getStatusContent(status, tenantName) {
  if (status === 'coming_soon') {
    return {
      title: `${tenantName} is launching soon`,
      subtitle: 'We are preparing this tenant and it is not open for access yet.',
      helper: 'Please check again later.',
    };
  }
  if (status === 'maintenance') {
    return {
      title: `${tenantName} is temporarily unavailable`,
      subtitle: 'This tenant is currently under maintenance.',
      helper: 'Please try again shortly.',
    };
  }
  return {
    title: `${tenantName} is currently unavailable`,
    subtitle: 'Access to this tenant is not available right now.',
    helper: 'Please try again later.',
  };
}

function TenantStatus() {
  const navigate = useNavigate();
  const tenantKey = getCurrentTenantKey();
  const [tenantName, setTenantName] = useState(prettifyTenantLabel(tenantKey));
  const [status, setStatus] = useState('maintenance');

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      try {
        const response = await fetch('/api/tenant-config', { credentials: 'include' });
        if (!response.ok) return;
        const payload = await response.json();
        const rows = Array.isArray(payload?.data?.tenants) ? payload.data.tenants : [];
        const match = rows.find((row) => row?.tenantKey === tenantKey);
        if (!cancelled && match) {
          if (match.status === 'active') {
            navigate('/events-dashboard', { replace: true });
            return;
          }
          setTenantName(match.name || prettifyTenantLabel(match.tenantKey));
          setStatus(match.status || 'maintenance');
        }
      } catch (_) {}
    }
    loadStatus();
    return () => {
      cancelled = true;
    };
  }, [navigate, tenantKey]);

  const content = useMemo(() => getStatusContent(status, tenantName), [status, tenantName]);

  return (
    <div className="TenantStatus" style={{ backgroundImage: `url(${backgroundImage})` }}>
      <div className="TenantStatus__overlay" />
      <div className="TenantStatus__content">
        <header className="TenantStatus__header">
          <div className="TenantStatus__logo">
            <img src={logo} alt="Meridian" />
          </div>
          <h1 className="TenantStatus__title">{content.title}</h1>
          <p className="TenantStatus__subtitle">
            {content.subtitle}
          </p>
          <p className="TenantStatus__helper">{content.helper}</p>
        </header>
      </div>
    </div>
  );
}

export default TenantStatus;
