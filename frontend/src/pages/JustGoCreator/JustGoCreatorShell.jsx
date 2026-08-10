import React from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import justGoWordmark from '../../assets/pivot/just-go-wordmark-dark.svg';
import { getCurrentTenantDisplayName, getCurrentTenantKey } from '../../config/tenantRedirect';
import useAuth from '../../hooks/useAuth';
import justGoCreatorCopy from './justGoCreatorCopy';
import { DemoIndicator } from './demo';
import { JUSTGO_CREATOR_ROUTES } from './justGoCreatorRoutes';
import './JustGoCreatorShell.scss';

/**
 * Just Go Creator console chrome — white canvas, ink type, orange pill CTA.
 * Reskin register only; see BRANDING.md / justGoCreatorTokens.scss.
 */
function JustGoCreatorShell() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const tenantKey = getCurrentTenantKey();
  const displayName = getCurrentTenantDisplayName();
  const cityLabel =
    (displayName && displayName !== 'Institution' ? displayName : null) ||
    tenantKey ||
    justGoCreatorCopy.shell.cityFallback;

  const handleSignOut = async () => {
    try {
      await logout?.();
    } catch {
      // Best-effort; still leave the console.
    }
    navigate('/login', { replace: true });
  };

  return (
    <div className="justgo-creator">
      <header className="justgo-creator__bar">
        <Link to={JUSTGO_CREATOR_ROUTES.home} className="justgo-creator__brand">
          <img
            className="justgo-creator__wordmark"
            src={justGoWordmark}
            alt={justGoCreatorCopy.wordmarkAlt}
            draggable={false}
          />
          <div className="justgo-creator__brand-meta">
            <p className="justgo-creator__eyebrow">{justGoCreatorCopy.shell.eyebrow}</p>
            <p className="justgo-creator__city">{cityLabel}</p>
          </div>
        </Link>

        <nav className="justgo-creator__nav" aria-label="Creator">
          {DemoIndicator ? <DemoIndicator /> : null}
          <NavLink
            to={JUSTGO_CREATOR_ROUTES.home}
            end
            className={({ isActive }) =>
              `justgo-creator__nav-link${isActive ? ' justgo-creator__nav-link--active' : ''}`
            }
          >
            {justGoCreatorCopy.shell.navHome}
          </NavLink>
          <NavLink
            to={JUSTGO_CREATOR_ROUTES.newListing}
            className={({ isActive }) =>
              `justgo-creator__nav-link justgo-creator__nav-link--accent${
                isActive ? ' justgo-creator__nav-link--active' : ''
              }`
            }
          >
            {justGoCreatorCopy.shell.navNew}
          </NavLink>
          <button
            type="button"
            className="justgo-creator__sign-out"
            onClick={handleSignOut}
          >
            {justGoCreatorCopy.shell.signOut}
          </button>
        </nav>
      </header>

      <main className="justgo-creator__main">
        <Outlet />
      </main>
    </div>
  );
}

export default JustGoCreatorShell;
