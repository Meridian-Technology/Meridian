import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
    default: ({ menuItems, defaultPage = 0 }) => {
      const [searchParams] = useSearchParams();
      const parsed = parseInt(searchParams.get('page') || String(defaultPage), 10);
      const page = Number.isFinite(parsed) ? parsed : defaultPage;
      const active = menuItems[page] || menuItems[defaultPage];
      return (
        <nav data-testid="tenant-dash-shell">
          {menuItems.map((item, index) => (
            <div
              key={item.label}
              data-testid={`menu-${index}`}
              data-icon={item.icon}
            >
              <span>{item.label}</span>
            </div>
          ))}
          {active?.element}
        </nav>
      );
    },
  };
});

jest.mock('./PivotTenantOverviewPage', () => () => <div>overview-page</div>);
jest.mock('./PivotTenantCurationPage', () => () => <div>curation-page</div>);
jest.mock('./PivotTenantJourneysPage', () => () => <div>journeys-page</div>);
jest.mock('./PivotTenantDropDeckPage', () => () => <div>drop-deck-page</div>);
jest.mock('./PivotTenantCatalogPage', () => () => <div>catalog-page</div>);
jest.mock('./PivotVoicePage', () => ({ scope, tenantKey }) => (
  <div>
    city-voice-page:{scope}:{tenantKey}
  </div>
));
jest.mock('./PivotTenantLaunchPage', () => ({ tenantKey }) => (
  <div>city-launch-page:{tenantKey}</div>
));
jest.mock('./PivotTenantLocationMigrationPage', () => ({
  __esModule: true,
  default: ({ tenantKey }) => <div>city-location-migration-page:{tenantKey}</div>,
  RICH_LOCATION_MIGRATION_UI_ENABLED: true,
}));
jest.mock('./PivotTenantDropdown', () => () => <div>city-switcher</div>);
jest.mock('./PivotJustGoLogo', () => () => <div>logo</div>);

function renderDashboard(path = '/platform-admin/pivot/nyc?page=4') {
  mockUseFetch.mockReturnValue({
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
  });

  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/platform-admin/pivot/:tenantKey"
          element={<PivotTenantDashboard />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PivotTenantDashboard city operations shell', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('keeps existing bookmarks stable and appends Location migration as page 7', () => {
    renderDashboard('/platform-admin/pivot/nyc');

    expect(screen.getByTestId('tenant-dash-shell')).toBeInTheDocument();
    expect(screen.getByTestId('menu-0')).toHaveTextContent('Overview');
    expect(screen.getByTestId('menu-1')).toHaveTextContent('Curation');
    expect(screen.getByTestId('menu-4')).toHaveTextContent('Catalog');
    expect(screen.getByTestId('menu-4')).toHaveAttribute(
      'data-icon',
      'mdi:account-group-outline',
    );
    expect(screen.getByTestId('menu-5')).toHaveTextContent('Voice');
    expect(screen.getByTestId('menu-5')).toHaveAttribute(
      'data-icon',
      'mdi:format-quote-close-outline',
    );
    expect(screen.getByTestId('menu-6')).toHaveTextContent('Launch');
    expect(screen.getByTestId('menu-6')).toHaveAttribute(
      'data-icon',
      'mdi:rocket-launch-outline',
    );
    expect(screen.getByTestId('menu-7')).toHaveTextContent('Location migration');
    expect(screen.getByTestId('menu-7')).toHaveAttribute(
      'data-icon',
      'mdi:map-marker-path',
    );
  });

  it('keeps ?page=4 Catalog bookmarks on Catalog', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=4');

    expect(screen.getByText('catalog-page')).toBeInTheDocument();
    expect(screen.queryByText(/city-voice-page/)).toBeNull();
    expect(screen.queryByText(/city-launch-page/)).toBeNull();
    expect(screen.queryByText('curation-page')).toBeNull();
  });

  it('shows city Voice at ?page=5', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=5');

    expect(screen.getByText('city-voice-page:tenant:nyc')).toBeInTheDocument();
    expect(screen.queryByText('catalog-page')).toBeNull();
    expect(screen.queryByText(/city-launch-page/)).toBeNull();
  });

  it('shows city Launch at ?page=6 and keeps Overview off that page', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=6');

    expect(screen.getByText('city-launch-page:nyc')).toBeInTheDocument();
    expect(screen.queryByText('overview-page')).toBeNull();
    expect(screen.queryByText(/city-voice-page/)).toBeNull();
  });

  it('shows the tenant-specific location migration at ?page=7', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=7');

    expect(screen.getByText('city-location-migration-page:nyc')).toBeInTheDocument();
    expect(screen.queryByText('overview-page')).toBeNull();
    expect(screen.queryByText('curation-page')).toBeNull();
  });

  it('does not show Launch (or waitlist emails) on Overview', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=0');

    expect(screen.getByText('overview-page')).toBeInTheDocument();
    expect(screen.queryByText(/city-launch-page/)).toBeNull();
    expect(screen.queryByText(/\+1/)).toBeNull();
  });
});
