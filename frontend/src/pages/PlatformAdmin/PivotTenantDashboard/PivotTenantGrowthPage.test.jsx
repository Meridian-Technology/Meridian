import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import PivotTenantGrowthPage, { maskWaitlistEmail } from './PivotTenantGrowthPage';
import { toUtcMonth } from './PivotAnalyticsMonthPicker';

const mockUseFetch = jest.fn();
const mockAuthenticatedRequest = jest.fn();
const mockAddNotification = jest.fn();
const mockRefetchOverview = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
  authenticatedRequest: (...args) => mockAuthenticatedRequest(...args),
}));

jest.mock('../../../NotificationContext', () => ({
  useNotification: () => ({ addNotification: mockAddNotification }),
}));

jest.mock('./PivotTenantPage', () => ({
  __esModule: true,
  default: ({ title, children, actions }) => (
    <div>
      <h1>{title}</h1>
      {actions}
      {children}
    </div>
  ),
}));

jest.mock('../../Admin/General/AdminPlatformAnalytics/AdminPlatformMetricChart', () => ({
  __esModule: true,
  default: ({ emptyMessage }) => <div>launch-chart:{emptyMessage}</div>,
}));

jest.mock('../../../components/Popup/Popup', () => ({
  __esModule: true,
  default: ({ isOpen, children }) => (isOpen ? <div role="dialog">{children}</div> : null),
}));

jest.mock('../../../components/JustGoQr/StyledJustGoQr', () => ({
  __esModule: true,
  default: () => <div data-testid="justgo-qr-canvas" />,
}));

jest.mock('@iconify-icon/react', () => ({
  Icon: () => null,
}));

jest.mock('../../../components/Interface/KeybindTooltip/KeybindTooltip', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./PivotGrowthOverview', () => ({
  __esModule: true,
  default: ({ tenantKey, refetchRef }) => {
    // eslint-disable-next-line no-param-reassign
    if (refetchRef) refetchRef.current = mockRefetchOverview;
    return <div>growth-overview:{tenantKey}</div>;
  },
}));

jest.mock('../../../components/PivotOps/PivotOpsAreaFunnel', () => ({
  __esModule: true,
  default: ({ ariaLabel }) => <div aria-label={ariaLabel} />,
}));

function launchPayload(overrides = {}) {
  return {
    success: true,
    data: {
      tenantKey: 'nyc',
      cityDisplayName: 'New York City',
      landingMode: 'waitlist',
      publicUrl: 'https://justgo.lol/nyc',
      range: { from: '2026-07-22T18:00:00.000Z', to: '2026-08-19T18:00:00.000Z' },
      conversionNote: 'Conversion uses the city\'s current landingMode.',
      totals: {
        views: 10,
        uniqueVisitors: 7,
        waitlistSignups: 2,
        storeClicks: 5,
        conversionRate: 0.2,
      },
      series: [{ date: '2026-08-18', views: 10, waitlistSignups: 2, storeClicks: 0 }],
      sources: {
        direct: { views: 8, waitlistSignups: 2, storeClicks: 4 },
        share: { views: 2, waitlistSignups: 0, storeClicks: 1 },
        qr: { views: 4, waitlistSignups: 1, storeClicks: 0 },
      },
      qr: {
        scans: 6,
        views: 4,
        byName: [
          {
            qrName: 'poster-night',
            scans: 6,
            views: 4,
            uniqueVisitors: 3,
            waitlistSignups: 1,
            storeClicks: 0,
          },
        ],
      },
      ...overrides,
    },
  };
}

function waitlistPayload(overrides = {}) {
  return {
    success: true,
    data: {
      tenantKey: 'nyc',
      items: [
        {
          id: '507f1f77bcf86cd799439011',
          createdAt: '2026-08-10T12:00:00.000Z',
          email: 'alex@example.com',
          source: 'share',
          qrName: 'poster-night',
          refCode: 'abc12',
          friendsJoined: 3,
        },
      ],
      pagination: { page: 1, limit: 50, total: 1 },
      ...overrides,
    },
  };
}

function qrsPayload(overrides = {}) {
  return {
    success: true,
    data: {
      tenantKey: 'nyc',
      items: [],
      ...overrides,
    },
  };
}

function stubFetch({
  launch = launchPayload(),
  waitlist = waitlistPayload(),
  qrs = qrsPayload(),
  launchLoading = false,
  waitlistLoading = false,
  qrsLoading = false,
  launchError = null,
  waitlistError = null,
  qrsError = null,
  refetchLaunch = jest.fn(),
  refetchWaitlist = jest.fn(),
  refetchQrs = jest.fn(),
} = {}) {
  mockUseFetch.mockImplementation((url) => {
    const href = String(url || '');
    if (!href) {
      return { data: null, loading: false, error: null, refetch: jest.fn() };
    }
    if (href.includes('/analytics/acquisition')) {
      return {
        data: {
          success: true,
          data: {
            range: { label: 'September 2026' },
            stages: [{ key: 'landing', label: 'Landing page', unique: 100, events: 140 }],
          },
        },
        loading: false,
        error: null,
        refetch: jest.fn(),
      };
    }
    if (href.includes('/waitlist')) {
      return {
        data: waitlist,
        loading: waitlistLoading,
        error: waitlistError,
        refetch: refetchWaitlist,
      };
    }
    if (href.includes('/landing-qrs')) {
      return {
        data: qrs,
        loading: qrsLoading,
        error: qrsError,
        refetch: refetchQrs,
      };
    }
    return {
      data: launch,
      loading: launchLoading,
      error: launchError,
      refetch: refetchLaunch,
    };
  });
  return { refetchLaunch, refetchWaitlist, refetchQrs };
}

function LocationProbe() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

function renderGrowth(view) {
  const query = view ? `?page=6&growth=${view}` : '?page=6';
  return render(
    <MemoryRouter initialEntries={[`/platform-admin/pivot/nyc${query}`]}>
      <PivotTenantGrowthPage tenantKey="nyc" cityDisplayName="New York City" />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function requestedUrls() {
  return mockUseFetch.mock.calls.map(([url]) => url).filter(Boolean);
}

describe('PivotTenantGrowthPage', () => {
  const originalConfirm = window.confirm;
  const originalClipboard = navigator.clipboard;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    window.confirm = originalConfirm;
    Object.assign(navigator, { clipboard: originalClipboard });
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('opens on Overview without loading landing or waitlist data', () => {
    stubFetch();
    renderGrowth();

    expect(screen.getByRole('heading', { name: 'Growth' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('growth-overview:nyc')).toBeInTheDocument();
    expect(requestedUrls()).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(mockRefetchOverview).toHaveBeenCalled();
  });

  it('shows Landing: mode, public link, and funnel without loading waitlist contacts', () => {
    stubFetch();
    renderGrowth('landing');

    expect(screen.getByRole('tab', { name: 'Landing' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Switch to launched' })).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('signups / views')).toBeInTheDocument();
    expect(screen.getByText('https://justgo.lol/nyc')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Landing views by source' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open landing' })).toHaveAttribute(
      'href',
      'https://justgo.lol/nyc',
    );
    expect(screen.queryByText('alex@example.com')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Tracking QRs' })).toBeNull();
    expect(requestedUrls().some((url) => url.includes('/waitlist'))).toBe(false);
  });

  it('lists waitlist signups on the Waitlist tab', () => {
    stubFetch();
    renderGrowth('waitlist');

    expect(screen.getByRole('heading', { name: 'Waitlist' })).toBeInTheDocument();
    expect(screen.getByText('alex@example.com')).toBeInTheDocument();
    expect(screen.getByText('poster-night')).toBeInTheDocument();
    expect(requestedUrls().some((url) => url.endsWith('/launch'))).toBe(false);
  });

  it('shows QR attribution beside the tracking QR manager', () => {
    stubFetch();
    renderGrowth('qr');

    expect(screen.getByRole('img', { name: 'QR-attributed landing views by code' })).toBeInTheDocument();
    expect(screen.getByText('Legacy QR hops')).toBeInTheDocument();
    expect(screen.getByText('QR views')).toBeInTheDocument();
    expect(screen.getAllByText('4 views').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('heading', { name: 'Tracking QRs' })).toBeInTheDocument();
    expect(screen.getByText('No tracking QRs yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Switch to launched' })).toBeNull();
  });

  it('shows the monthly acquisition funnel on Acquisition', () => {
    stubFetch();
    renderGrowth('acquisition');

    expect(screen.getByLabelText(new RegExp(`Month ${toUtcMonth()}`))).toBeInTheDocument();
    expect(screen.getByText(/September 2026/)).toBeInTheDocument();
    expect(mockUseFetch).toHaveBeenCalledWith(
      '/admin/pivot/tenants/nyc/analytics/acquisition',
      expect.objectContaining({ params: { month: toUtcMonth() } }),
    );
    expect(requestedUrls().some((url) => url.endsWith('/launch'))).toBe(false);
  });

  it('keeps the selected view in the URL', () => {
    stubFetch();
    renderGrowth('landing');

    fireEvent.click(screen.getByRole('tab', { name: 'QR codes' }));
    expect(screen.getByTestId('search')).toHaveTextContent('growth=qr');

    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(screen.getByTestId('search')).not.toHaveTextContent('growth=');
  });

  it('shows launched conversion hint when the city is launched', () => {
    stubFetch({
      launch: launchPayload({ landingMode: 'launched', totals: {
        views: 10,
        uniqueVisitors: 7,
        waitlistSignups: 2,
        storeClicks: 5,
        conversionRate: 0.5,
      } }),
    });
    renderGrowth('landing');

    expect(screen.getByText('Launched')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to waitlist' })).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('store clicks / views')).toBeInTheDocument();
  });

  it('shows loading and error states', () => {
    stubFetch({
      launch: null,
      launchLoading: true,
      waitlist: null,
      waitlistLoading: true,
      qrs: null,
      qrsLoading: true,
    });
    let view = renderGrowth('landing');
    expect(screen.getByText('Loading landing mode…')).toBeInTheDocument();
    expect(screen.getByText('Loading launch stats…')).toBeInTheDocument();
    view.unmount();

    view = renderGrowth('waitlist');
    expect(screen.getByText('Loading waitlist…')).toBeInTheDocument();
    view.unmount();

    view = renderGrowth('qr');
    expect(screen.getByText('Loading QR attribution…')).toBeInTheDocument();
    expect(screen.getByText('Loading tracking QRs…')).toBeInTheDocument();
    view.unmount();

    stubFetch({
      launch: null,
      launchError: 'boom',
      waitlist: waitlistPayload({ items: [], pagination: { page: 1, limit: 50, total: 0 } }),
    });
    view = renderGrowth('landing');
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
    view.unmount();

    renderGrowth('waitlist');
    expect(screen.getByText('No waitlist signups yet.')).toBeInTheDocument();
  });

  it('PATCHes landing mode after confirm and refetches', async () => {
    const { refetchLaunch } = stubFetch();
    window.confirm = jest.fn(() => true);
    mockAuthenticatedRequest.mockResolvedValue({
      data: { success: true, data: { landingMode: 'launched' } },
    });

    renderGrowth('landing');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to launched' }));

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(refetchLaunch).toHaveBeenCalled();
    });
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/pivot/tenants/nyc/landing-mode',
      expect.objectContaining({
        method: 'PATCH',
        data: { landingMode: 'launched' },
      }),
    );
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
  });

  it('does not PATCH when confirm is cancelled', async () => {
    stubFetch();
    window.confirm = jest.fn(() => false);

    renderGrowth('landing');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to launched' }));

    expect(mockAuthenticatedRequest).not.toHaveBeenCalled();
  });

  it('downloads waitlist CSV without logging emails', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    stubFetch();
    mockAuthenticatedRequest.mockResolvedValue({
      data: 'createdAt,email\n2026-08-10T12:00:00.000Z,alex@example.com',
    });
    global.URL.createObjectURL = jest.fn(() => 'blob:waitlist');
    global.URL.revokeObjectURL = jest.fn();
    const click = jest.fn();
    const createElement = document.createElement.bind(document);
    const createSpy = jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = createElement(tag);
      if (tag === 'a') {
        el.click = click;
      }
      return el;
    });

    renderGrowth('waitlist');
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));

    await waitFor(() => {
      expect(click).toHaveBeenCalled();
    });
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/pivot/tenants/nyc/waitlist.csv',
    );
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringMatching(/alex@example\.com/));
    logSpy.mockRestore();
    createSpy.mockRestore();
  });

  it('maskWaitlistEmail keeps only the first character and domain', () => {
    expect(maskWaitlistEmail('alex@example.com')).toBe('a***@example.com');
    expect(maskWaitlistEmail('')).toBe('this signup');
  });

  it('removes a waitlist row without logging or toasting the full email', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { refetchWaitlist } = stubFetch();
    window.confirm = jest.fn(() => true);
    mockAuthenticatedRequest.mockResolvedValue({
      data: { success: true, data: { tenantKey: 'nyc', id: '507f1f77bcf86cd799439011', deleted: true } },
    });

    renderGrowth('waitlist');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('a***@example.com'));
    expect(window.confirm.mock.calls[0][0]).not.toMatch(/alex@example\.com/);

    await waitFor(() => {
      expect(refetchWaitlist).toHaveBeenCalled();
    });
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/pivot/tenants/nyc/waitlist/507f1f77bcf86cd799439011',
      { method: 'DELETE' },
    );
    expect(JSON.stringify(mockAddNotification.mock.calls)).not.toMatch(/alex@example\.com/);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringMatching(/alex@example\.com/));
    logSpy.mockRestore();
  });

  it('does not delete when confirm is cancelled', async () => {
    stubFetch();
    window.confirm = jest.fn(() => false);

    renderGrowth('waitlist');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(mockAuthenticatedRequest).not.toHaveBeenCalled();
  });

  it('refreshes the data behind the open view', () => {
    let fetches = stubFetch();
    let view = renderGrowth('qr');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(fetches.refetchLaunch).toHaveBeenCalled();
    expect(fetches.refetchQrs).toHaveBeenCalled();
    expect(fetches.refetchWaitlist).not.toHaveBeenCalled();
    view.unmount();

    fetches = stubFetch();
    view = renderGrowth('waitlist');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(fetches.refetchWaitlist).toHaveBeenCalled();
    expect(fetches.refetchLaunch).not.toHaveBeenCalled();
  });
});
