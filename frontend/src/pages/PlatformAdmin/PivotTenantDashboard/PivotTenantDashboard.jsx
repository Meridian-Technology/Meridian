import React, { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Dashboard from '../../../components/Dashboard/Dashboard';
import { useFetch } from '../../../hooks/useFetch';
import useAdminDashboardTheme from '../../../hooks/useAdminDashboardTheme';
import { isPivotTenant } from '../TenantManagement/tenantPivotUtils';
import PivotTenantOverviewPage from './PivotTenantOverviewPage';
import PivotTenantCurationPage from './PivotTenantCurationPage';
import PivotTenantJourneysPage from './PivotTenantJourneysPage';
import PivotTenantDropDeckPage from './PivotTenantDropDeckPage';
import PivotTenantCatalogPage from './PivotTenantCatalogPage';
import PivotVoicePage from './PivotVoicePage';
import PivotTenantDropdown from './PivotTenantDropdown';
import PivotJustGoLogo from './PivotJustGoLogo';
import '../../Admin/Admin.scss';
import '../TenantManagement/TenantManagementPage.scss';
import '../PlatformAdmin.scss';
import './PivotTenantDashboard.scss';

const NO_FETCH_CACHE = { enabled: false };

function normalizeTenantKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function PivotTenantGate({ title, body, onBack }) {
  return (
    <div className="admin platform-admin">
      <div className="pivot-tenant-dash__gate">
        <h1 className="pivot-tenant-dash__gate-title">{title}</h1>
        <p className="pivot-tenant-dash__gate-body">{body}</p>
        <button type="button" className="linear-btn linear-btn--secondary" onClick={onBack}>
          Back to tenants
        </button>
      </div>
    </div>
  );
}

/**
 * Per-tenant Just Go ops shell.
 * Route: /platform-admin/pivot/:tenantKey?page=0|1|2|3|4|5
 * Catalog is page=4; Voice is page=5 (appended — do not insert).
 */
function PivotTenantDashboard() {
  const navigate = useNavigate();
  const { tenantKey: tenantKeyParam } = useParams();
  const tenantKey = normalizeTenantKey(tenantKeyParam);
  const { isDark } = useAdminDashboardTheme();

  const goToTenants = () => navigate('/platform-admin?page=0');

  const { data, loading, error, refetch } = useFetch('/admin/platform/tenants', {
    cache: NO_FETCH_CACHE,
  });

  const tenants = data?.success ? data.data?.tenants || [] : [];

  const tenant = useMemo(() => {
    if (!tenantKey || !tenants.length) return null;
    return tenants.find((row) => normalizeTenantKey(row.tenantKey) === tenantKey) || null;
  }, [tenants, tenantKey]);

  const cityDisplayName = tenant?.location || tenant?.name || tenantKey;

  const menuItems = useMemo(
    () => [
      {
        label: 'Overview',
        icon: 'ic:round-dashboard',
        element: (
          <PivotTenantOverviewPage
            key={tenantKey}
            tenantKey={tenantKey}
            cityDisplayName={cityDisplayName}
          />
        ),
      },
      {
        label: 'Curation',
        icon: 'mdi:clipboard-edit-outline',
        element: (
          <PivotTenantCurationPage
            key={tenantKey}
            tenantKey={tenantKey}
            cityDisplayName={cityDisplayName}
          />
        ),
      },
      {
        label: 'User journeys',
        icon: 'mdi:graph',
        element: (
          <PivotTenantJourneysPage
            key={tenantKey}
            tenantKey={tenantKey}
            cityDisplayName={cityDisplayName}
          />
        ),
      },
      {
        label: 'Drop deck',
        icon: 'mdi:cards-playing-outline',
        element: (
          <PivotTenantDropDeckPage
            key={tenantKey}
            tenantKey={tenantKey}
            cityDisplayName={cityDisplayName}
            storedOverrides={tenant?.pivotDeckConfig}
            onSaved={refetch}
          />
        ),
      },
      {
        label: 'Catalog',
        icon: 'mdi:account-group-outline',
        element: (
          <PivotTenantCatalogPage
            key={tenantKey}
            tenantKey={tenantKey}
            cityDisplayName={cityDisplayName}
          />
        ),
      },
      {
        label: 'Voice',
        icon: 'mdi:format-quote-close-outline',
        element: (
          <PivotVoicePage
            key={tenantKey}
            scope="tenant"
            tenantKey={tenantKey}
            cityDisplayName={cityDisplayName}
          />
        ),
      },
    ],
    [tenantKey, cityDisplayName, tenant?.pivotDeckConfig, refetch],
  );

  if (!tenantKey) {
    return (
      <PivotTenantGate
        title="Missing city"
        body="Open a pivot tenant dashboard from Tenant management, or use /platform-admin/pivot/:tenantKey."
        onBack={goToTenants}
      />
    );
  }

  if (error && !tenants.length) {
    return (
      <PivotTenantGate
        title="Unable to load tenants"
        body={typeof error === 'string' ? error : 'Could not verify this city. Try again from Tenant management.'}
        onBack={goToTenants}
      />
    );
  }

  if (!loading && !tenant) {
    return (
      <PivotTenantGate
        title="City not found"
        body={
          <>
            No tenant matches <code className="pivot-tenant-dash__gate-code">{tenantKey}</code>.
          </>
        }
        onBack={goToTenants}
      />
    );
  }

  if (!loading && tenant && !isPivotTenant(tenant)) {
    return (
      <PivotTenantGate
        title="Not a pivot city"
        body={
          <>
            <code className="pivot-tenant-dash__gate-code">{tenantKey}</code> is not a Just Go / pivot
            pilot tenant.
          </>
        }
        onBack={goToTenants}
      />
    );
  }

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
          currentTenantKey={tenantKey}
          cityDisplayName={cityDisplayName}
          loading={loading}
        />
      }
      onBack={goToTenants}
      enableSubSidebar={false}
      defaultPage={0}
      primaryColor="#ff4f1f"
      secondaryColor={isDark ? 'rgba(255, 79, 31, 0.22)' : 'rgba(255, 79, 31, 0.12)'}
    />
  );
}

export default PivotTenantDashboard;
