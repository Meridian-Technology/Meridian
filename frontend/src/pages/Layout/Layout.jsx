import React, { Suspense, useState, useEffect } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom'; // Allows for nested routes to be rendered within this layout
import { updateReferrerOnNavigation } from '../../utils/referrerContext';
import Banner from '../../components/Banner/Banner'; // Import your Banner component
import OrgInviteModal from '../../components/OrgInviteModal/OrgInviteModal';
import useAuth from '../../hooks/useAuth';
import { useNotification } from '../../NotificationContext';
import { isWww, isPathAllowedOnWww, isJustGoHost, isJustGoWwwHost, isPathAllowedOnJustGoHost, hasDevTenantOverride, getLastTenant, getTenantKeys, getTenantRedirectUrl, justGoApexUrl } from '../../config/tenantRedirect';
import {
  applyJustGoTabIcon,
  restoreCampusTabIcon,
  shouldHideCampusBanner,
} from '../JustGoLanding/justGoLandingUtils';

function Layout() {
  const [visible, setVisible] = useState(false);
  const [viewport, setViewport] = useState("100vh");
  const location = useLocation();
  const { pendingOrgInvites, showOrgInviteModal, dismissOrgInviteModal, setPendingOrgInvites } = useAuth();
  const { addNotification } = useNotification();

  // SPA referrer tracking: store previous pathname for accurate referrer on any page view
  useEffect(() => {
    updateReferrerOnNavigation(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
      let height = window.innerHeight;
      setViewport(height + 'px');
      //add listener
  },[]);

  const justGoHost = isJustGoHost();
  const hideCampusChrome = shouldHideCampusBanner(location.pathname, justGoHost);
  const pathAllowedOnHost = justGoHost
    ? isPathAllowedOnJustGoHost(location.pathname)
    : isPathAllowedOnWww(location.pathname);

  useEffect(() => {
    if (!isJustGoWwwHost()) return undefined;
    window.location.replace(
      justGoApexUrl(`${location.pathname}${location.search || ''}${location.hash || ''}`),
    );
    return undefined;
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    if (hideCampusChrome) applyJustGoTabIcon();
    else restoreCampusTabIcon();
  }, [hideCampusChrome]);

  const handleOrgInviteAccept = (invite) => {
    setPendingOrgInvites(prev => prev.filter(inv => inv._id !== invite._id));
  };

  const handleOrgInviteDecline = (invite) => {
    setPendingOrgInvites(prev => prev.filter(inv => inv._id !== invite._id));
  };

  // On www: if user has a saved tenant from a previous domain selection, auto-redirect there
  // Just Go apex is not campus www — never bounce it to a school subdomain.
  if (!justGoHost && isWww() && !hasDevTenantOverride() && !pathAllowedOnHost) {
    const lastTenant = getLastTenant();
    const validTenants = getTenantKeys();
    if (lastTenant && validTenants.includes(lastTenant)) {
      const path = location.pathname + (location.search || '');
      if (process.env.NODE_ENV !== 'production') {
        try {
          localStorage.setItem('devTenantOverride', lastTenant);
        } catch (_) {}
      }
      const url = getTenantRedirectUrl(lastTenant, path);
      window.location.href = url;
      return null;
    }
  }

  // Redirect to domain picker when on www/localhost without tenant and path requires tenant
  if (!justGoHost && isWww() && !hasDevTenantOverride() && !pathAllowedOnHost) {
    const path = location.pathname + (location.search || '');
    const next = path !== '/' ? `?next=${encodeURIComponent(path)}` : '';
    return <Navigate to={`/select-school${next}`} replace />;
  }

  // On tenant subdomain, / goes straight to events dashboard (no landing).
  // justgo.lol is apex, not a school — Task 0.2 maps / to JustGoLanding.
  if (!justGoHost && !isWww() && location.pathname === '/') {
    return <Navigate to="/events-dashboard" replace />;
  }

  return (
    <div style={{minHeight: viewport, position: 'relative', overflowX: 'clip', width: '100%'}}>
      {/* The Banner is rendered here and will appear across all pages */}
      {!hideCampusChrome ? (
        <Banner visible={visible} setVisible={setVisible} bannerType="default" />
      ) : null}
      
      {/* Org invite modal - shown when user has pending invites */}
      {showOrgInviteModal && pendingOrgInvites?.length > 0 && (
        <OrgInviteModal
          invites={pendingOrgInvites}
          onAccept={handleOrgInviteAccept}
          onDecline={handleOrgInviteDecline}
          onClose={dismissOrgInviteModal}
          addNotification={addNotification}
        />
      )}
      
      {/* This will render the content of the page (children) */}
      <main style={{minHeight: viewport, overflowX: 'clip', width: '100%'}}>
        <div className="out" style={{minHeight: viewport, overflowX: 'clip', width: '100%'}}>
            <Suspense fallback={null}>
              <Outlet />
            </Suspense>
        </div>
      </main>
    </div>
  );
}

export default Layout;
