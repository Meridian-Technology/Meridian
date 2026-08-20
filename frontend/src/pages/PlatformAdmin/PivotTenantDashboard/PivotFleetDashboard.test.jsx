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
jest.mock('./PivotTenantOverviewPage', () => () => <div>overview-page</div>);
jest.mock('./PivotTenantCurationPage', () => () => <div>curation-page</div>);
jest.mock('./PivotTenantJourneysPage', () => () => <div>journeys-page</div>);
jest.mock('./PivotTenantDropDeckPage', () => () => <div>drop-deck-page</div>);
jest.mock('./PivotTenantCatalogPage', () => () => <div>catalog-page</div>);
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

  it('appends Voice as page 1 without reordering Overview', () => {
    renderFleet('/platform-admin/pivot');

    expect(screen.getByTestId('menu-0')).toHaveTextContent('Overview');
    expect(screen.getByTestId('menu-1')).toHaveTextContent('Voice');
  });

  it('shows Voice at /platform-admin/pivot?page=1', () => {
    renderFleet('/platform-admin/pivot?page=1');

    expect(screen.getByText('fleet-voice-page:platform')).toBeInTheDocument();
    expect(screen.queryByText('fleet-overview-page')).not.toBeInTheDocument();
  });
});
