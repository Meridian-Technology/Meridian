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
const { MemoryRouter } = require('react-router-dom');
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
    batchWeek: '2026-W36',
    availableWeeks: ['2026-W35', '2026-W36'],
    coverage: { total: 10, processed: 7, resolved: 5, needsReview: 2, remaining: 3, percent: 70 },
    weekRun: { batchWeek: '2026-W36', status: 'batch_complete' },
    needsReview: 2,
    runs: { live: null, historical: null },
    leases: { live: null, historical: null },
  },
};

const HEATMAP = {
  success: true,
  data: {
    cols: 40,
    rows: 32,
    bounds: { north: 41, south: 40, east: -73, west: -75 },
    cityBounds: { north: 41, south: 40, east: -73, west: -75 },
    cells: [{ x: 20, y: 16, count: 4 }],
    maxCount: 4,
    pointCount: 4,
    outsideCount: 0,
    unresolvedCount: 2,
    truncated: false,
  },
};

function fetchResult(data) {
  return { data, loading: false, error: null, refetch: jest.fn() };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/platform-admin/pivot/nyc?page=7&batchWeek=2026-W36']}>
      <PivotTenantLocationMigrationPage tenantKey="nyc" cityDisplayName="New York" />
    </MemoryRouter>,
  );
}

describe('PivotTenantLocationMigrationPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFetch.mockImplementation((url) => {
      if (String(url || '').endsWith('/reviews')) {
        return fetchResult({ success: true, data: { candidates: [] } });
      }
      if (String(url || '').endsWith('/heatmap')) {
        return fetchResult(HEATMAP);
      }
      return fetchResult(STATUS);
    });
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
    renderPage();

    expect(screen.getByText('7 of 10 events evaluated')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Process next 25' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Preview next 25' }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/platform/tenants/nyc/rich-location-migration/run',
      expect.objectContaining({
        method: 'POST',
        data: expect.objectContaining({ apply: false, scope: 'live', batchWeek: '2026-W36' }),
      }),
    ));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview next 25' })).toBeEnabled());

    fireEvent.change(screen.getByLabelText('Type nyc to process'), { target: { value: 'nyc' } });
    expect(screen.getByRole('button', { name: 'Process next 25' })).toBeEnabled();
  });

  test('loads a batch-blind historic heatmap without the selected week', async () => {
    renderPage();

    expect(mockUseFetch).toHaveBeenCalledWith(
      '/admin/platform/tenants/nyc/rich-location-migration/heatmap',
      expect.objectContaining({ cache: { enabled: false } }),
    );
    expect(screen.getByRole('application', {
      name: /historic event location heatmap across every batch week/i,
    })).toBeInTheDocument();
    expect(screen.getByText(/resolved locations across every batch week/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    mockUseFetch.mock.calls
      .filter(([url]) => String(url).endsWith('/heatmap'))
      .forEach(([, options]) => {
        expect(options?.params?.batchWeek).toBeUndefined();
      });
  });

  test('loads status and reviews for the selected batch week', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));

    await waitFor(() => expect(mockUseFetch).toHaveBeenCalledWith(
      '/admin/platform/tenants/nyc/rich-location-migration',
      expect.objectContaining({ params: { batchWeek: '2026-W35' } }),
    ));
    expect(mockUseFetch).toHaveBeenCalledWith(
      '/admin/platform/tenants/nyc/rich-location-migration/reviews',
      expect.objectContaining({
        params: expect.objectContaining({ batchWeek: '2026-W35', status: 'needs_review' }),
      }),
    );
  });

  test('saves the structured boundary form and rollout controls', async () => {
    renderPage();

    fireEvent.click(screen.getByLabelText('Show rich locations'));
    fireEvent.click(screen.getByRole('button', { name: 'Save location settings' }));

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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save location settings' })).toBeEnabled());
  });

  test('looks up a city boundary and fills the form without saving', async () => {
    mockAuthenticatedRequest.mockResolvedValue({
      data: {
        success: true,
        data: {
          query: 'New York',
          formattedAddress: 'New York, NY, USA',
          countryCode: 'US',
          bounds: { north: 40.92, south: 40.48, east: -73.7, west: -74.26 },
          center: { latitude: 40.71, longitude: -74.01 },
          radiusKm: 28.4,
          matchCount: 1,
          ambiguous: false,
        },
      },
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Look up boundary' }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/platform/tenants/nyc/rich-location-migration/city-boundary',
      expect.objectContaining({
        params: { q: 'New York', country: 'US' },
      }),
    ));
    await waitFor(() => expect(screen.getByLabelText('North')).toHaveValue(40.92));
    expect(screen.getByText('New York, NY, USA')).toBeInTheDocument();
    expect(mockAuthenticatedRequest).not.toHaveBeenCalledWith(
      '/admin/platform/tenants/nyc',
      expect.anything(),
    );
  });

  test('emergency disable only sends disabled rollout controls', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('Country code'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn off rich locations' }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/platform/tenants/nyc',
      expect.objectContaining({
        method: 'PUT',
        data: { richLocationControls: {
          rollout: 'off', reads: false, writes: false, autocomplete: false, search: false,
        } },
      }),
    ));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Turn off rich locations' })).toBeEnabled());
  });
});
