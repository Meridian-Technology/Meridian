process.env.REACT_APP_ENABLE_RICH_LOCATION_MIGRATION_UI = 'true';

const mockUseFetch = jest.fn();
const mockAuthenticatedRequest = jest.fn();
const mockAddNotification = jest.fn();

jest.mock('../../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
  authenticatedRequest: (...args) => mockAuthenticatedRequest(...args),
}));
jest.mock('../../../../NotificationContext', () => ({
  useNotification: () => ({ addNotification: mockAddNotification }),
}));
jest.mock('@iconify-icon/react', () => ({ Icon: () => null }));

const React = require('react');
const { fireEvent, render, screen, waitFor } = require('@testing-library/react');
const RichLocationMigrationPanel = require('./RichLocationMigrationPanel').default;

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
  return {
    data,
    loading: false,
    error: null,
    refetch: jest.fn(),
  };
}

describe('RichLocationMigrationPanel', () => {
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

  test('defaults to dry-run and requires typed confirmation before apply', async () => {
    render(<RichLocationMigrationPanel tenant={{ tenantKey: 'nyc', tenantType: 'pivot' }} />);

    const apply = screen.getByRole('button', { name: 'Apply next batch' });
    expect(apply).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Dry run next batch' }));
    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/platform/tenants/nyc/rich-location-migration/run',
      expect.objectContaining({
        method: 'POST',
        data: expect.objectContaining({ apply: false, scope: 'live' }),
      }),
    ));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dry run next batch' })).toBeEnabled());

    fireEvent.change(screen.getByPlaceholderText('nyc'), { target: { value: 'nyc' } });
    expect(screen.getByRole('button', { name: 'Apply next batch' })).toBeEnabled();
  });

  test('emergency disable does not submit unsaved constraints', async () => {
    render(<RichLocationMigrationPanel tenant={{ tenantKey: 'nyc', tenantType: 'pivot' }} />);
    fireEvent.change(screen.getByLabelText('Constraints JSON'), { target: { value: '{invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Disable rollout' }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/platform/tenants/nyc',
      expect.objectContaining({
        method: 'PUT',
        data: {
          richLocationControls: {
            rollout: 'off', reads: false, writes: false, autocomplete: false, search: false,
          },
        },
      }),
    ));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Disable rollout' })).toBeEnabled());
  });
});
