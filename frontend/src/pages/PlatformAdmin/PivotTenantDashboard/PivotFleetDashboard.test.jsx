import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PivotFleetDashboard from './PivotFleetDashboard';
import PivotTenantDashboard from './PivotTenantDashboard';

const mockUseFetch = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
}));

jest.mock('../../../hooks/useAdminDashboardTheme', () => ({
  __esModule: true,
  default: () => ({ isDark: false }),
}));

jest.mock('../../../components/Dashboard/Dashboard', () => {
  const { useSearchParams } = require('react-router-dom');
  return {
    __esModule: true,
    default: ({ menuItems, middleItem, defaultPage = 0 }) => {
      const [searchParams] = useSearchParams();
      const parsed = parseInt(searchParams.get('page') || String(defaultPage), 10);
      const page = Number.isFinite(parsed) ? parsed : defaultPage;
      const active = menuItems[page] || menuItems[defaultPage];
      return (
        <nav data-testid="fleet-dash-shell">
          {middleItem}
          {menuItems.map((item, index) => (
            <div key={item.label} data-testid={`menu-${index}`}>
              <span>{item.label}</span>
            </div>
          ))}
          {active?.element}
        </nav>
      );
    },
  };
});

jest.mock('./PivotFleetOverviewPage', () => () => <div>fleet-overview-page</div>);
jest.mock('./PivotVoicePage', () => ({ scope }) => (
  <div>fleet-voice-page:{scope}</div>
));
jest.mock('./PivotFleetLaunchPage', () => () => <div>fleet-launch-page</div>);
jest.mock('./PivotComputeJobs', () => ({
  __esModule: true,
  PIVOT_FLEET_COMPUTE_JOBS_PAGE: 3,
  default: ({ scope, cityDisplayName, pageIndex }) => (
    <div>fleet-compute-jobs:{scope}:{cityDisplayName}:{pageIndex}</div>
  ),
}));
jest.mock('./PivotTenantAnalyticsPage', () => ({ scope }) => (
  <div>fleet-analytics-page:{scope}</div>
));
jest.mock('../PivotNotifications/PivotFleetNotificationsPage', () => () => (
  <div>fleet-notifications-page</div>
));
jest.mock('./PivotTenantOverviewPage', () => () => <div>overview-page</div>);
jest.mock('./PivotTenantCurationPage', () => () => <div>curation-page</div>);
jest.mock('./PivotTenantJourneysPage', () => () => <div>journeys-page</div>);
jest.mock('./PivotTenantDropDeckPage', () => () => <div>drop-deck-page</div>);
jest.mock('./PivotTenantCatalogPage', () => () => <div>catalog-page</div>);
// Mocked like every other tab: its real graph reaches Popup, which imports
// @iconify-icon as untransformed ESM and cannot be loaded under jest.
jest.mock('./carousel/PivotCarouselPage', () => () => <div>carousel-page</div>);
jest.mock('./PivotTenantLaunchPage', () => () => <div>city-launch-page</div>);
jest.mock('./PivotTenantDropdown', () => ({ cityDisplayName }) => (
  <div>{cityDisplayName || 'city-switcher'}</div>
));
jest.mock('./PivotJustGoLogo', () => () => <div>logo</div>);

function tenantsFetch() {
  return {
    data: {
      success: true,
      data: {
        tenants: [
          {
            tenantKey: 'nyc',
            name: 'NYC',
            location: 'New York',
            pivotPilot: true,
          },
        ],
      },
    },
    loading: false,
    error: null,
    refetch: jest.fn(),
  };
}

function renderFleet(path = '/platform-admin/pivot') {
  mockUseFetch.mockReturnValue(tenantsFetch());
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/platform-admin/pivot" element={<PivotFleetDashboard />} />
        <Route path="/platform-admin/pivot/:tenantKey" element={<PivotTenantDashboard />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PivotFleetDashboard', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the fleet Overview shell at /platform-admin/pivot, not the missing-city gate', () => {
    renderFleet('/platform-admin/pivot');

    expect(screen.getByTestId('fleet-dash-shell')).toBeInTheDocument();
    expect(screen.getByText('fleet-overview-page')).toBeInTheDocument();
    expect(screen.queryByText('fleet-voice-page:platform')).not.toBeInTheDocument();
    expect(screen.getByText('All cities')).toBeInTheDocument();
    expect(screen.queryByText('Missing city')).not.toBeInTheDocument();
    expect(screen.queryByText('overview-page')).not.toBeInTheDocument();
  });

  it('appends Voice, Launch, and the global compute queue without reordering existing pages', () => {
    renderFleet('/platform-admin/pivot');

    expect(screen.getByTestId('menu-0')).toHaveTextContent('Overview');
    expect(screen.getByTestId('menu-1')).toHaveTextContent('Voice');
    expect(screen.getByTestId('menu-2')).toHaveTextContent('Launch');
    expect(screen.getByTestId('menu-3')).toHaveTextContent('Compute jobs');
    expect(screen.getByTestId('menu-4')).toHaveTextContent('Analytics');
    expect(screen.getByTestId('menu-5')).toHaveTextContent('Notifications');
  });

  it('shows Voice at /platform-admin/pivot?page=1', () => {
    renderFleet('/platform-admin/pivot?page=1');

    expect(screen.getByText('fleet-voice-page:platform')).toBeInTheDocument();
    expect(screen.queryByText('fleet-overview-page')).not.toBeInTheDocument();
    expect(screen.queryByText('fleet-launch-page')).not.toBeInTheDocument();
  });

  it('shows Launch at /platform-admin/pivot?page=2', () => {
    renderFleet('/platform-admin/pivot?page=2');

    expect(screen.getByText('fleet-launch-page')).toBeInTheDocument();
    expect(screen.queryByText('fleet-voice-page:platform')).not.toBeInTheDocument();
    expect(screen.queryByText('fleet-overview-page')).not.toBeInTheDocument();
  });

  it('shows the all-cities compute queue at /platform-admin/pivot?page=3', () => {
    renderFleet('/platform-admin/pivot?page=3');

    expect(screen.getByText('fleet-compute-jobs:fleet:All cities:3')).toBeInTheDocument();
    expect(screen.queryByText('fleet-overview-page')).not.toBeInTheDocument();
  });

  it('shows Analytics at /platform-admin/pivot?page=4', () => {
    renderFleet('/platform-admin/pivot?page=4');

    expect(screen.getByText('fleet-analytics-page:fleet')).toBeInTheDocument();
    expect(screen.queryByText('fleet-overview-page')).not.toBeInTheDocument();
  });

  it('shows fleet Notifications at /platform-admin/pivot?page=5 without shifting Analytics', () => {
    renderFleet('/platform-admin/pivot?page=5');

    expect(screen.getByText('fleet-notifications-page')).toBeInTheDocument();
    expect(screen.queryByText('fleet-analytics-page:fleet')).not.toBeInTheDocument();
    expect(screen.queryByText('fleet-overview-page')).not.toBeInTheDocument();
  });
});
