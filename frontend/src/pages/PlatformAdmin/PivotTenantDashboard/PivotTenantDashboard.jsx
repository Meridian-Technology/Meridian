import React, { Suspense, useMemo } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Dashboard from '../../../components/Dashboard/Dashboard';
import { useFetch } from '../../../hooks/useFetch';
import useAdminDashboardTheme from '../../../hooks/useAdminDashboardTheme';
import { isPivotTenant } from '../TenantManagement/tenantPivotUtils';
import PivotTenantOverviewPage from './PivotTenantOverviewPage';
import PivotTenantContentPage from './PivotTenantContentPage';
import PivotTenantAudiencePage from './PivotTenantAudiencePage';
import PivotVoicePage from './PivotVoicePage';
import PivotCarouselPage from './carousel/PivotCarouselPage';
import { DESIGN_REVIEW_ENABLED } from './creativeStudioAccess';
import PivotTenantGrowthPage from './PivotTenantGrowthPage';
import PivotNotificationsPage from '../PivotNotifications/PivotNotificationsPage';
import PivotComputeJobs from './PivotComputeJobs';
import { RICH_LOCATION_MIGRATION_UI_ENABLED } from './PivotTenantLocationMigrationPage';
import PivotTenantDropdown from './PivotTenantDropdown';
import PivotJustGoLogo from './PivotJustGoLogo';
import {
  PIVOT_TENANT_PAGES,
  PIVOT_TENANT_PAGE_IDS,
  pivotTenantPageIndex,
} from './pivotTenantPageRoutes';
import '../../Admin/Admin.scss';
import '../TenantManagement/TenantManagementPage.scss';
import '../PlatformAdmin.scss';
import './PivotTenantDashboard.scss';

const NO_FETCH_CACHE = { enabled: false };
const DesignReview = process.env.NODE_ENV === 'production'
  ? null
  : React.lazy(() => import('./carousel/PivotCoverLab'));

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

/*
 * Catalog (4) and Location migration (7) merged into Content (1). Their old
 * bookmarks open the matching Content tab; Location migration falls back to
 * Events while its UI flag is off.
 */
function LegacyContentRedirect({ content }) {
  const [searchParams] = useSearchParams();
  const next = new URLSearchParams(searchParams);
  next.set('page', String(PIVOT_TENANT_PAGES.content));
  if (content) next.set('content', content);
  else next.delete('content');
  return <Navigate to={`?${next.toString()}`} replace />;
}

function DisabledDesignReviewRedirect() {
  const [searchParams] = useSearchParams();
  const next = new URLSearchParams(searchParams);
  next.set('page', String(PIVOT_TENANT_PAGES.carousel));
  next.delete('creative');
  return <Navigate to={`?${next.toString()}`} replace />;
}

/*
 * Drop deck (3) merged into Audience (2). A bookmark with a user opens that
 * user's scored deck; a pinned batchWeek keeps the ranking on that week.
 * Without a user, the page was mostly visited for the scoring rules.
 */
function LegacyDropDeckRedirect() {
  const [searchParams] = useSearchParams();
  const next = new URLSearchParams(searchParams);
  next.set('page', String(PIVOT_TENANT_PAGES.audience));
  if (next.get('userId')) {
    next.set('audience', 'users');
    next.set('userPane', 'ranking');
    if (next.get('batchWeek')) next.set('deckWeek', 'page');
  } else {
    next.set('audience', 'rules');
  }
  return <Navigate to={`?${next.toString()}`} replace />;
}

/* Analytics (11) merged into Growth (6) as its Acquisition view. */
function LegacyAnalyticsRedirect() {
  const [searchParams] = useSearchParams();
  const next = new URLSearchParams(searchParams);
  next.set('page', String(PIVOT_TENANT_PAGES.growth));
  next.set('growth', 'acquisition');
  return <Navigate to={`?${next.toString()}`} replace />;
}

function LegacyCreativeLink({ tenantKey, cityDisplayName }) {
  const [searchParams] = useSearchParams();
  const creative = searchParams.get('creative');
  if (creative === 'copy' || creative === 'design') {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(creative === 'copy' ? PIVOT_TENANT_PAGES.voice :
      DESIGN_REVIEW_ENABLED ? PIVOT_TENANT_PAGES.coverLab : PIVOT_TENANT_PAGES.carousel));
    next.delete('creative');
    if (creative === 'copy') {
      next.delete('deckId');
      next.delete('curation');
      next.delete('account');
    }
    return <Navigate to={`?${next.toString()}`} replace />;
  }
  return <PivotCarouselPage tenantKey={tenantKey} cityDisplayName={cityDisplayName} />;
}

/**
 * Per-tenant Just Go ops shell.
 * Route: /platform-admin/pivot/:tenantKey?page=0..12.
 * Content (1) holds events, sources, organizers, and (flagged) locations; the
 * old Catalog (4) and Location migration (7) indexes redirect into it.
 * Audience (2) holds journeys, the user/deck inspector, and deck rules; the
 * old Drop deck index (3) redirects into it. Growth (6) holds landing,
 * waitlist, QR codes, and acquisition; the old Analytics index (11) redirects
 * into it. Voice (5) and Carousels (8) are
 * separate entries. Cover Lab (12) is dev-only.
 * Named identities are in pivotTenantPageRoutes.js; numeric URLs remain valid.
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

  const menuItems = useMemo(() => {
    const items = [
      {
        key: 'overview',
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
        key: 'content',
        label: 'Content',
        icon: 'mdi:clipboard-edit-outline',
        element: (
          <PivotTenantContentPage
            key={tenantKey}
            tenantKey={tenantKey}
            cityDisplayName={cityDisplayName}
            onTenantUpdated={refetch}
          />
        ),
      },
      {
        key: 'audience',
        label: 'Audience',
        icon: 'mdi:account-eye-outline',
        element: (
          <PivotTenantAudiencePage
            key={tenantKey}
            tenantKey={tenantKey}
            cityDisplayName={cityDisplayName}
            storedDeckOverrides={tenant?.pivotDeckConfig}
            onDeckSaved={refetch}
          />
        ),
      },
      {
        key: 'dropDeck',
        hideFromNav: true,
        navParentIndex: PIVOT_TENANT_PAGES.audience,
        label: 'Drop deck',
        icon: 'mdi:cards-playing-outline',
        element: <LegacyDropDeckRedirect />,
      },
      {
        key: 'catalog',
        hideFromNav: true,
        navParentIndex: PIVOT_TENANT_PAGES.content,
        label: 'Catalog',
        icon: 'mdi:account-group-outline',
        element: <LegacyContentRedirect content="organizers" />,
      },
      {
        key: 'voice',
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
      {
        key: 'growth',
        // Second in the sidebar; its ?page= index stays 6.
        navOrder: 0.5,
        label: 'Growth',
        icon: 'mdi:rocket-launch-outline',
        element: (
          <PivotTenantGrowthPage
            key={tenantKey}
            tenantKey={tenantKey}
            cityDisplayName={cityDisplayName}
          />
        ),
      },
    ];

    items.push({
      key: 'locationMigration',
      hideFromNav: true,
      navParentIndex: PIVOT_TENANT_PAGES.content,
      label: 'Location migration',
      icon: 'mdi:map-marker-path',
      element: (
        <LegacyContentRedirect content={RICH_LOCATION_MIGRATION_UI_ENABLED ? 'locations' : null} />
      ),
    });

    /*
     * Appended, not slotted in beside Curation where it belongs by subject.
     * Menu position is the ?page= index, so inserting anywhere but the end
     * renumbers every tab after it and breaks bookmarks people already hold.
     */
    items.push({
      key: 'carousel',
      label: 'Carousels',
      icon: 'mdi:image-multiple-outline',
      element: (
        <LegacyCreativeLink
          key={tenantKey}
          tenantKey={tenantKey}
          cityDisplayName={cityDisplayName}
        />
      ),
    });

    items.push({
      key: 'notifications',
      label: 'Notifications',
      icon: 'mdi:bell-ring-outline',
      element: (
        <PivotNotificationsPage
          key={tenantKey}
          tenantKey={tenantKey}
          tenant={tenant}
          tenants={tenants.filter(isPivotTenant)}
        />
      ),
    });

    items.push({
      key: 'computeJobs',
      label: 'Compute jobs',
      icon: 'mdi:server-network-outline',
      element: (
        <PivotComputeJobs
          key={tenantKey}
          tenantKey={tenantKey}
          cityDisplayName={cityDisplayName}
        />
      ),
    });

    /* Reserved: the old Analytics bookmark opens Growth → Acquisition. */
    items.push({
      key: 'analytics',
      hideFromNav: true,
      navParentIndex: PIVOT_TENANT_PAGES.growth,
      label: 'Analytics',
      icon: 'mdi:chart-funnel',
      element: <LegacyAnalyticsRedirect />,
    });

    // In production, the old design-review bookmark returns to Carousels.
    items.push({
      key: 'coverLab',
      hideFromNav: true,
      navParentIndex: PIVOT_TENANT_PAGES.carousel,
      label: 'Cover lab (temp)',
      icon: 'mdi:palette-outline',
      element: DESIGN_REVIEW_ENABLED ? (
        <Suspense fallback={<p role="status">Loading design review…</p>}>
          <DesignReview key={tenantKey} tenantKey={tenantKey} />
        </Suspense>
      ) : <DisabledDesignReviewRedirect />,
    });

    // The array index is the legacy URL contract. Fail loudly if a future
    // addition accidentally changes a page's bookmark destination.
    if (items.length !== PIVOT_TENANT_PAGE_IDS.length
      || items.some((item, index) => pivotTenantPageIndex(item.key) !== index)) {
      throw new Error('Pivot tenant dashboard page registry is out of sync.');
    }
    return items;
  }, [tenantKey, cityDisplayName, tenant, tenants, refetch]);

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
