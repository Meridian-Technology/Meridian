import React from 'react';
import { useNavigate } from 'react-router-dom';
import Dashboard from '../../components/Dashboard/Dashboard';
import TenantManagementPage from './TenantManagement/TenantManagementPage';
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
  ];

  return (
    <Dashboard
      menuItems={menuItems}
      additionalClass="admin platform-admin"
      logo={AdminLogo}
      onBack={() => navigate('/select-school')}
      enableSubSidebar={false}
    />
  );
}

export default PlatformAdmin;
