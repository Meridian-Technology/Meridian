/**
 * MOCKUP ONLY — Admin Outreach System. Uses Meridian Dashboard + Admin-style layout.
 * Does not touch any real systems. Use as UI reference, then delete.
 * Route: /mockup/admin-outreach
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import Dashboard from '../../components/Dashboard/Dashboard';
import AdminLogo from '../../assets/Brand Image/ADMIN.svg';
import OutreachCampaigns from './OutreachCampaigns';
import OutreachCompose from './OutreachCompose';
import OutreachConfig from './OutreachConfig';

export default function AdminOutreachMock() {
  const navigate = useNavigate();

  const menuItems = [
    {
      label: 'Campaigns',
      icon: 'mdi:email-multiple',
      element: <OutreachCampaigns />,
    },
    {
      label: 'New outreach',
      icon: 'mdi:send',
      element: <OutreachCompose />,
    },
    {
      label: 'Configuration',
      icon: 'mdi:cog',
      element: <OutreachConfig />,
    },
  ];

  return (
    <Dashboard
      menuItems={menuItems}
      additionalClass="admin"
      logo={AdminLogo}
      onBack={() => navigate('/events-dashboard')}
    />
  );
}
