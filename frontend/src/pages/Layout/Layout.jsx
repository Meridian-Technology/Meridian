import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom'; // Allows for nested routes to be rendered within this layout
import { updateReferrerOnNavigation } from '../../utils/referrerContext';
import Banner from '../../components/Banner/Banner'; // Import your Banner component
import OrgInviteModal from '../../components/OrgInviteModal/OrgInviteModal';
import useAuth from '../../hooks/useAuth';
import { useNotification } from '../../NotificationContext';
import { isWww, isPathAllowedOnWww } from '../../config/tenantRedirect';

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

  const handleOrgInviteAccept = (invite) => {
    setPendingOrgInvites(prev => prev.filter(inv => inv._id !== invite._id));
  };

  const handleOrgInviteDecline = (invite) => {
    setPendingOrgInvites(prev => prev.filter(inv => inv._id !== invite._id));
  };

  // Redirect to domain picker when on www/localhost without tenant and path requires tenant
  const hasDevTenantOverride = process.env.NODE_ENV !== 'production' && typeof window !== 'undefined' && localStorage.getItem('devTenantOverride');
  if (isWww() && !hasDevTenantOverride && !isPathAllowedOnWww(location.pathname)) {
    const path = location.pathname + (location.search || '');
    const next = path !== '/' ? `?next=${encodeURIComponent(path)}` : '';
    return <Navigate to={`/select-school${next}`} replace />;
  }
  
  return (
    <div style={{minHeight: viewport, position: 'relative', overflowX: 'clip', width: '100%'}}>
      {/* The Banner is rendered here and will appear across all pages */}
      <Banner visible={visible} setVisible={setVisible} bannerType="default" />
      
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
            <Outlet />      
        </div>
      </main>
    </div>
  );
}

export default Layout;
