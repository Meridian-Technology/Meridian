import React, { useMemo } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Dashboard from '../../../components/Dashboard/Dashboard';
import { useFetch } from '../../../hooks/useFetch';
import useAdminDashboardTheme from '../../../hooks/useAdminDashboardTheme';
import { isPivotTenant } from '../TenantManagement/tenantPivotUtils';
import PivotFleetOverviewPage from './PivotFleetOverviewPage';
import PivotVoicePage from './PivotVoicePage';
import PivotFleetGrowthPage from './PivotFleetGrowthPage';
import PivotComputeJobs, { PIVOT_FLEET_COMPUTE_JOBS_PAGE } from './PivotComputeJobs';
import PivotNotificationsPage from '../PivotNotifications/PivotNotificationsPage';
import PivotTenantDropdown from './PivotTenantDropdown';
import PivotJustGoLogo from './PivotJustGoLogo';
import '../../Admin/Admin.scss';
import '../TenantManagement/TenantManagementPage.scss';
import '../PlatformAdmin.scss';
import './PivotTenantDashboard.scss';

const NO_FETCH_CACHE = { enabled: false };
const FLEET_GROWTH_PAGE = 2;

/* Analytics (4) merged into Growth (2) as its Acquisition view. */
function LegacyFleetAnalyticsRedirect() {
  const [searchParams] = useSearchParams();
  const next = new URLSearchParams(searchParams);
  next.set('page', String(FLEET_GROWTH_PAGE));
  next.set('growth', 'acquisition');
  return <Navigate to={`?${next.toString()}`} replace />;
}

/**
 * Fleet Just Go ops shell.
 * Route: /platform-admin/pivot?page=0|1|2|3|4|5
 * Voice is page=1; Growth is page=2 (overview, landing, acquisition); Compute
 * jobs is page=3; page=4 (former Analytics) redirects to Growth → Acquisition;
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
        label: 'Growth',
        // Second in the sidebar; its ?page= index stays 2.
        navOrder: 0.5,
        icon: 'mdi:rocket-launch-outline',
        element: <PivotFleetGrowthPage />,
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
        hideFromNav: true,
        navParentIndex: FLEET_GROWTH_PAGE,
        icon: 'mdi:chart-funnel',
        element: <LegacyFleetAnalyticsRedirect />,
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
