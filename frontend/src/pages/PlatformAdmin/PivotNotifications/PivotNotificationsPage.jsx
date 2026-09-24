import React from 'react';
import PivotTenantPage from '../PivotTenantDashboard/PivotTenantPage';
import PivotFleetNotificationsPage from './PivotFleetNotificationsPage';

/**
 * One Notifications panel for the fleet shell and a city shell.
 * Activity and the schedule list stay on the page. A schedule opens
 * its check history in a popup.
 */
function PivotNotificationsPage({
  tenantKey = '',
  tenant = null,
  tenants = [],
}) {
  const scopedTenant = String(tenantKey || '').trim().toLowerCase();
  const cityName = tenant?.location || tenant?.name || (scopedTenant || 'All cities');
  const knownTenants = tenants.length
    ? tenants
    : (tenant ? [tenant] : []);

  return (
    <PivotTenantPage
      title="Notifications"
      tenantKey={scopedTenant}
      cityDisplayName={cityName}
      subtitle="What went out, who is eligible for the next drop, and the history of each schedule."
      className="pivot-fleet-notifications"
    >
      <PivotFleetNotificationsPage
        embedded
        tenants={knownTenants}
        tenantKey={scopedTenant}
      />
    </PivotTenantPage>
  );
}

export default PivotNotificationsPage;
