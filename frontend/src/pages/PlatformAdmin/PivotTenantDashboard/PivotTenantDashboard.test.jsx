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

jest.mock('../../../components/Dashboard/Dashboard', () => ({
  __esModule: true,
  default: ({ menuItems }) => (
    <nav data-testid="tenant-dash-shell">
      {menuItems.map((item, index) => (
        <div
          key={item.label}
          data-testid={`menu-${index}`}
          data-icon={item.icon}
        >
          <span>{item.label}</span>
          {item.element}
        </div>
      ))}
    </nav>
  ),
}));

jest.mock('./PivotTenantOverviewPage', () => () => <div>overview-page</div>);
jest.mock('./PivotTenantCurationPage', () => () => <div>curation-page</div>);
jest.mock('./PivotTenantJourneysPage', () => () => <div>journeys-page</div>);
jest.mock('./PivotTenantDropDeckPage', () => () => <div>drop-deck-page</div>);
jest.mock('./PivotTenantCatalogPage', () => () => <div>catalog-page</div>);
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

describe('PivotTenantDashboard Catalog shell', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('appends Catalog as page 4 on the tenant shell, not under Curation', () => {
    renderDashboard();

    expect(screen.getByTestId('tenant-dash-shell')).toBeInTheDocument();
    expect(screen.getByTestId('menu-1')).toHaveTextContent('Curation');
    expect(screen.getByTestId('menu-1')).toHaveTextContent('curation-page');
    expect(screen.getByTestId('menu-4')).toHaveTextContent('Catalog');
    expect(screen.getByTestId('menu-4')).toHaveAttribute(
      'data-icon',
      'mdi:account-group-outline',
    );
    expect(screen.getByTestId('menu-4')).toHaveTextContent('catalog-page');
    expect(screen.queryByTestId('menu-5')).toBeNull();
  });
});
