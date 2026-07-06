import React from 'react';
import { useNavigate } from 'react-router-dom';
import Dashboard from '../../components/Dashboard/Dashboard';
import TenantManagementPage from './TenantManagement/TenantManagementPage';
import PivotLabPage from './PivotLab/PivotLabPage';
import PivotWeeklyDropPage from './PivotWeeklyDrop/PivotWeeklyDropPage';
import AdminLogo from '../../assets/Brand Image/ADMIN.svg';
import '../Admin/Admin.scss';
import './PlatformAdmin.scss';

function PlatformAdmin() {
  const navigate = useNavigate();

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
  ];

  return (
    <Dashboard
      menuItems={menuItems}
      additionalClass="admin platform-admin"
      logo={AdminLogo}
      onBack={() => navigate('/select-school')}
      enableSubSidebar={false}
      primaryColor={'black'}
      secondaryColor={'rgba(185, 185, 185, 0.2)'}
    />
  );
}

export default PlatformAdmin;
