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
