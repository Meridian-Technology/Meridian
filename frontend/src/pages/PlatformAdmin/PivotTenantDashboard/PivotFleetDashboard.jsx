import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Dashboard from '../../../components/Dashboard/Dashboard';
import { useFetch } from '../../../hooks/useFetch';
import useAdminDashboardTheme from '../../../hooks/useAdminDashboardTheme';
import { isPivotTenant } from '../TenantManagement/tenantPivotUtils';
import PivotFleetOverviewPage from './PivotFleetOverviewPage';
import PivotVoicePage from './PivotVoicePage';
import PivotFleetLaunchPage from './PivotFleetLaunchPage';
import PivotComputeJobs, { PIVOT_FLEET_COMPUTE_JOBS_PAGE } from './PivotComputeJobs';
import PivotTenantAnalyticsPage from './PivotTenantAnalyticsPage';
import PivotNotificationsPage from '../PivotNotifications/PivotNotificationsPage';
import PivotTenantDropdown from './PivotTenantDropdown';
import PivotJustGoLogo from './PivotJustGoLogo';
import '../../Admin/Admin.scss';
import '../TenantManagement/TenantManagementPage.scss';
import '../PlatformAdmin.scss';
import './PivotTenantDashboard.scss';

const NO_FETCH_CACHE = { enabled: false };

/**
 * Fleet Just Go ops shell.
 * Route: /platform-admin/pivot?page=0|1|2|3|4|5
 * Voice is page=1; Launch is page=2; Compute jobs is page=3; Analytics is page=4;
 * Notifications is page=5 (appended).
 */
function PivotFleetDashboard() {
  const navigate = useNavigate();
  const { isDark } = useAdminDashboardTheme();

  const { data, loading, refetch } = useFetch('/admin/platform/tenants', {
    cache: NO_FETCH_CACHE,
  });

  const tenants = data?.success ? data.data?.tenants || [] : [];
  const pivotTenants = useMemo(() => tenants.filter(isPivotTenant), [tenants]);
  const mobileEnvOverrides = data?.success
    ? data.data?.pivotMobileEnvOverrides || {}
    : {};

  const menuItems = useMemo(
    () => [
      {
        label: 'Overview',
        icon: 'ic:round-dashboard',
        element: (
          <PivotFleetOverviewPage
            tenants={tenants}
            tenantsLoading={loading}
            mobileEnvOverrides={mobileEnvOverrides}
            onTenantsSaved={refetch}
          />
        ),
      },
      {
        label: 'Voice',
        icon: 'mdi:format-quote-close-outline',
        element: <PivotVoicePage scope="platform" />,
      },
      {
        label: 'Launch',
        icon: 'mdi:rocket-launch-outline',
        element: <PivotFleetLaunchPage />,
      },
      {
        label: 'Compute jobs',
        icon: 'mdi:server-network-outline',
        element: (
          <PivotComputeJobs
            scope="fleet"
            cityDisplayName="All cities"
            pageIndex={PIVOT_FLEET_COMPUTE_JOBS_PAGE}
            tenants={pivotTenants}
          />
        ),
      },
      {
        label: 'Analytics',
        icon: 'mdi:chart-funnel',
        element: <PivotTenantAnalyticsPage scope="fleet" cityDisplayName="All cities" />,
      },
      {
        label: 'Notifications',
        icon: 'mdi:bell-ring-outline',
        element: <PivotNotificationsPage tenants={pivotTenants} />,
      },
    ],
    [pivotTenants, tenants, loading, mobileEnvOverrides, refetch],
  );

  return (
    <Dashboard
      menuItems={menuItems}
      additionalClass={`admin platform-admin pivot-tenant-dash${
        isDark ? ' platform-admin--dark' : ''
      }`}
      logo={<PivotJustGoLogo />}
      middleItem={
        <PivotTenantDropdown
          tenants={tenants}
          currentTenantKey=""
          cityDisplayName="All cities"
          loading={loading}
        />
      }
      onBack={() => navigate('/platform-admin?page=0')}
      enableSubSidebar={false}
      defaultPage={0}
      primaryColor="#ff4f1f"
      secondaryColor={isDark ? 'rgba(255, 79, 31, 0.22)' : 'rgba(255, 79, 31, 0.12)'}
    />
  );
}

export default PivotFleetDashboard;
