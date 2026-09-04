process.env.REACT_APP_ENABLE_RICH_LOCATION_MIGRATION_UI = 'true';

const mockUseFetch = jest.fn();
const mockAuthenticatedRequest = jest.fn();
const mockAddNotification = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
  authenticatedRequest: (...args) => mockAuthenticatedRequest(...args),
}));
jest.mock('../../../NotificationContext', () => ({
  useNotification: () => ({ addNotification: mockAddNotification }),
}));
jest.mock('@iconify-icon/react', () => ({ Icon: () => null }));
jest.mock('./PivotTenantPage', () => ({ actions, children }) => (
  <div>{actions}<main>{children}</main></div>
));

const React = require('react');
const { fireEvent, render, screen, waitFor } = require('@testing-library/react');
const PivotTenantLocationMigrationPage = require('./PivotTenantLocationMigrationPage').default;

const STATUS = {
  success: true,
  data: {
    tenantKey: 'nyc',
    constraints: {
      countryCode: 'US',
      bounds: { north: 41, south: 40, east: -73, west: -75 },
    },
    configuredControls: {
      rollout: 'off', reads: false, writes: false, autocomplete: false, search: false,
    },
    providerConfigured: true,
    needsReview: 0,
    runs: { live: null, historical: null },
    leases: { live: null, historical: null },
  },
};

function fetchResult(data) {
  return { data, loading: false, error: null, refetch: jest.fn() };
}

describe('PivotTenantLocationMigrationPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFetch.mockImplementation((url) => (
      url.endsWith('/reviews')
        ? fetchResult({ success: true, data: { candidates: [] } })
        : fetchResult(STATUS)
    ));
    mockAuthenticatedRequest.mockResolvedValue({
      data: {
        success: true,
        data: {
          status: 'completed',
          dryRun: true,
          scope: 'live',
          counts: { scanned: 1, applied: 1 },
          items: [],
        },
      },
    });
  });

  test('starts with a safe dry run and requires the tenant key before apply', async () => {
    render(<PivotTenantLocationMigrationPage tenantKey="nyc" cityDisplayName="New York" />);

    expect(screen.getByRole('button', { name: 'Apply next batch' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Dry run next batch' }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/platform/tenants/nyc/rich-location-migration/run',
      expect.objectContaining({
        method: 'POST',
        data: expect.objectContaining({ apply: false, scope: 'live' }),
      }),
    ));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dry run next batch' })).toBeEnabled());

    fireEvent.change(screen.getByLabelText('Type nyc to apply'), { target: { value: 'nyc' } });
    expect(screen.getByRole('button', { name: 'Apply next batch' })).toBeEnabled();
  });

  test('saves the structured boundary form and rollout controls', async () => {
    render(<PivotTenantLocationMigrationPage tenantKey="nyc" cityDisplayName="New York" />);

    fireEvent.click(screen.getByLabelText(/Rich location reads/));
    fireEvent.click(screen.getByRole('button', { name: 'Save boundary & rollout' }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/platform/tenants/nyc',
      expect.objectContaining({
        method: 'PUT',
        data: {
          richLocationConstraints: {
            countryCode: 'US',
            bounds: { north: 41, south: 40, east: -73, west: -75 },
          },
          richLocationControls: {
            rollout: 'off', reads: true, writes: false, autocomplete: false, search: false,
          },
        },
      }),
    ));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save boundary & rollout' })).toBeEnabled());
  });

  test('emergency disable only sends disabled rollout controls', async () => {
    render(<PivotTenantLocationMigrationPage tenantKey="nyc" cityDisplayName="New York" />);

    fireEvent.change(screen.getByLabelText('Country code'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Disable rollout' }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/platform/tenants/nyc',
      expect.objectContaining({
        method: 'PUT',
        data: { richLocationControls: {
          rollout: 'off', reads: false, writes: false, autocomplete: false, search: false,
        } },
      }),
    ));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Disable rollout' })).toBeEnabled());
  });
});
