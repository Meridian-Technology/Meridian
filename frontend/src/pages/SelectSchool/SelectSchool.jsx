import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { getTenantKeys, getTenantRedirectUrl, setLastTenant } from '../../config/tenantRedirect';
import useAuth from '../../hooks/useAuth';
import backgroundImage from '../../assets/LandingBackground.png';
import logo from '../../assets/Brand Image/BEACON.svg';
import './SelectSchool.scss';

const STORAGE_KEY = 'devTenantOverride';

const DOMAIN_META = {
  rpi: {
    name: 'Rensselaer Polytechnic Institute',
    subdomain: 'rpi',
    location: 'Troy, NY',
  },
  tvcog: {
    name: 'Center of Gravity',
    subdomain: 'tvcog',
    location: 'Troy, NY',
  },
};

/**
 * School picker page. Shown when user on www (or localhost in dev) tries to access login/register.
 * User must choose a school before auth; redirects to tenant subdomain.
 */
function SelectSchool() {
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const nextParam = searchParams.get('next');
  // When already logged in, go to dashboard instead of login to avoid flash/redirect loop
  const nextPath = nextParam || (isAuthenticated ? '/events-dashboard' : '/login');
  const tenantKeys = getTenantKeys();

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

  const domains = tenantKeys.map((key) => ({
    key,
    ...(DOMAIN_META[key] || { name: key, subdomain: key, location: '' }),
  }));

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
          {domains.map((domain) => (
            <div
              key={domain.key}
              className="SelectSchool__card"
              role="button"
              tabIndex={0}
              onClick={() => redirectToTenant(domain.key, nextPath)}
              onKeyDown={(e) => e.key === 'Enter' && redirectToTenant(domain.key, nextPath)}
            >
              <div className="SelectSchool__card-icon">
                <Icon icon="mdi:school" />
              </div>
              <div className="SelectSchool__card-info">
                <span className="SelectSchool__card-name">{domain.name}</span>
                <span className="SelectSchool__card-domain">{domain.subdomain}.meridian.study</span>
                {domain.location && (
                  <span className="SelectSchool__card-location">{domain.location}</span>
                )}
              </div>
              <Icon icon="mdi:chevron-right" className="SelectSchool__card-chevron" />
            </div>
          ))}
        </div>

        {nextParam && nextParam !== '/login' && nextParam !== '/register' && (
          <p className="SelectSchool__hint">Select an institution above to continue</p>
        )}
      </div>
    </div>
  );
}

export default SelectSchool;
