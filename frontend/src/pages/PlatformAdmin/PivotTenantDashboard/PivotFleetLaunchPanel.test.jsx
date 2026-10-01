import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PivotFleetLaunchPage from './PivotFleetLaunchPage';

const mockUseFetch = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
}));

jest.mock('./PivotTenantPage', () => ({
  __esModule: true,
  default: ({ title, cityDisplayName, children }) => (
    <div>
      <h1>{title}</h1>
      <p>{cityDisplayName}</p>
      {children}
    </div>
  ),
}));

function fleetPayload(overrides = {}) {
  return {
    success: true,
    data: {
      range: { from: '2026-07-22T18:00:00.000Z', to: '2026-08-19T18:00:00.000Z' },
      conversionNote: 'Conversion uses the city\'s current landingMode.',
      totals: {
        views: 30,
        uniqueVisitors: 14,
        waitlistSignups: 5,
        storeClicks: 9,
        conversionRate: 0.4,
      },
      cities: [
        {
          tenantKey: 'nyc',
          cityDisplayName: 'New York City',
          landingMode: 'waitlist',
          views: 10,
          waitlistSignups: 4,
          storeClicks: 1,
          conversionRate: 0.4,
          lastSignupAt: '2026-08-10T00:00:00.000Z',
        },
        {
          tenantKey: 'sf',
          cityDisplayName: 'San Francisco',
          landingMode: 'launched',
          views: 20,
          waitlistSignups: 1,
          storeClicks: 8,
          conversionRate: 0.4,
          lastSignupAt: null,
        },
      ],
      ...overrides,
    },
  };
}

function renderFleetLaunch() {
  return render(
    <MemoryRouter>
      <PivotFleetLaunchPage />
    </MemoryRouter>,
  );
}

describe('PivotFleetLaunchPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders totals and links each city to Launch ?page=6', () => {
    mockUseFetch.mockReturnValue({
      data: fleetPayload(),
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderFleetLaunch();

    expect(mockUseFetch).toHaveBeenCalledWith('/admin/pivot/launch', expect.any(Object));
    expect(screen.getByRole('heading', { name: 'Launch' })).toBeInTheDocument();
    expect(screen.getByText('All cities')).toBeInTheDocument();
    expect(screen.getAllByText('40%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: 'New York City' })).toHaveAttribute(
      'href',
      '/platform-admin/pivot/nyc?page=6',
    );
    expect(screen.getByRole('link', { name: 'San Francisco' })).toHaveAttribute(
      'href',
      '/platform-admin/pivot/sf?page=6',
    );
    expect(screen.queryByText(/\+1/)).toBeNull();
  });

  it('does not crash when the fleet is empty', () => {
    mockUseFetch.mockReturnValue({
      data: fleetPayload({ cities: [], totals: { views: 0, conversionRate: 0 } }),
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderFleetLaunch();

    expect(screen.getByText('No pivot cities yet.')).toBeInTheDocument();
  });

  it('does not crash when cities is missing', () => {
    mockUseFetch.mockReturnValue({
      data: { success: true, data: { totals: {} } },
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderFleetLaunch();

    expect(screen.getByText('No pivot cities yet.')).toBeInTheDocument();
  });

  it('shows loading and error states', () => {
    mockUseFetch.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: jest.fn(),
    });
    const { unmount } = renderFleetLaunch();
    expect(screen.getByText('Loading launch stats…')).toBeInTheDocument();
    unmount();

    mockUseFetch.mockReturnValue({
      data: null,
      loading: false,
      error: 'fleet down',
      refetch: jest.fn(),
    });
    renderFleetLaunch();
    expect(screen.getByRole('alert')).toHaveTextContent('fleet down');
  });
});
