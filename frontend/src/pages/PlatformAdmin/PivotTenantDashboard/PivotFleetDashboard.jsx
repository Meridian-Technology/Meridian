import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Dashboard from '../../../components/Dashboard/Dashboard';
import { useFetch } from '../../../hooks/useFetch';
import useAdminDashboardTheme from '../../../hooks/useAdminDashboardTheme';
import PivotFleetOverviewPage from './PivotFleetOverviewPage';
import PivotTenantDropdown from './PivotTenantDropdown';
import PivotJustGoLogo from './PivotJustGoLogo';
import '../../Admin/Admin.scss';
import '../TenantManagement/TenantManagementPage.scss';
import '../PlatformAdmin.scss';
import './PivotTenantDashboard.scss';

const NO_FETCH_CACHE = { enabled: false };

/**
 * Fleet Just Go ops shell.
 * Route: /platform-admin/pivot
 */
function PivotFleetDashboard() {
  const navigate = useNavigate();
  const { isDark } = useAdminDashboardTheme();

  const { data, loading } = useFetch('/admin/platform/tenants', {
    cache: NO_FETCH_CACHE,
  });

  const tenants = data?.success ? data.data?.tenants || [] : [];

  const menuItems = useMemo(
    () => [
      {
        label: 'Overview',
        icon: 'ic:round-dashboard',
        element: <PivotFleetOverviewPage />,
      },
    ],
    [],
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
