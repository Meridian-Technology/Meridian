import React from 'react';
import { useNavigate } from 'react-router-dom';
import Dashboard from '../../components/Dashboard/Dashboard';
import TenantManagementPage from './TenantManagement/TenantManagementPage';
import PivotLabPage from './PivotLab/PivotLabPage';
import PivotWeeklyDropPage from './PivotWeeklyDrop/PivotWeeklyDropPage';
import PlatformAdminsPage from './PlatformAdmins/PlatformAdminsPage';
import useAdminDashboardTheme from '../../hooks/useAdminDashboardTheme';
import AdminLogo from '../../assets/Brand Image/ADMIN.svg';
import '../Admin/Admin.scss';
import './PlatformAdmin.scss';

function PlatformAdmin() {
  const navigate = useNavigate();
  const { isDark } = useAdminDashboardTheme();

  const menuItems = [
    {
      label: 'Tenants',
      icon: 'mdi:city-variant-outline',
      element: <TenantManagementPage />,
    },
    {
      label: 'Pivot Lab',
      icon: 'mdi:flask-outline',
      element: <PivotLabPage />,
    },
    {
      label: 'Weekly drop',
      icon: 'mdi:bell-ring-outline',
      element: <PivotWeeklyDropPage />,
    },
    {
      label: 'Platform admins',
      icon: 'mdi:shield-account-outline',
      element: <PlatformAdminsPage />,
    },
  ];

  return (
    <Dashboard
      menuItems={menuItems}
      additionalClass={`admin platform-admin${isDark ? ' platform-admin--dark' : ''}`}
      logo={AdminLogo}
      onBack={() => navigate('/select-school')}
      enableSubSidebar={false}
      primaryColor={isDark ? '#e8eaed' : 'black'}
      secondaryColor={isDark ? 'rgba(139, 147, 230, 0.22)' : 'rgba(185, 185, 185, 0.2)'}
    />
  );
}

export default PlatformAdmin;
