import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PivotTenantLaunchPage, { maskWaitlistPhone } from './PivotTenantLaunchPage';

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
          phoneE164: '+14155550100',
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

function renderLaunch() {
  return render(
    <PivotTenantLaunchPage tenantKey="nyc" cityDisplayName="New York City" />,
  );
}

describe('PivotTenantLaunchPage', () => {
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

  it('renders waitlist mode KPIs, public URL, and waitlist phones', () => {
    stubFetch();
    renderLaunch();

    expect(screen.getByRole('heading', { name: 'Launch' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Waitlist' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to launched' })).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('signups / views')).toBeInTheDocument();
    expect(screen.getByText('+14155550100')).toBeInTheDocument();
    expect(screen.getAllByText('poster-night').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('https://justgo.lol/nyc')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Landing views by source' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'QR hops and landing views by code' })).toBeInTheDocument();
    expect(screen.getByText('QR scans')).toBeInTheDocument();
    expect(screen.getByText('QR views')).toBeInTheDocument();
    expect(screen.getByText('6 scans')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open landing' })).toHaveAttribute(
      'href',
      'https://justgo.lol/nyc',
    );
    expect(screen.getByRole('heading', { name: 'Tracking QRs' })).toBeInTheDocument();
    expect(screen.getByText('No tracking QRs yet.')).toBeInTheDocument();
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
    renderLaunch();

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
    const { unmount } = renderLaunch();
    expect(screen.getByText('Loading landing mode…')).toBeInTheDocument();
    expect(screen.getByText('Loading launch stats…')).toBeInTheDocument();
    expect(screen.getByText('Loading waitlist…')).toBeInTheDocument();
    expect(screen.getByText('Loading tracking QRs…')).toBeInTheDocument();
    unmount();

    stubFetch({
      launch: null,
      launchError: 'boom',
      waitlist: waitlistPayload({ items: [], pagination: { page: 1, limit: 50, total: 0 } }),
    });
    renderLaunch();
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
    expect(screen.getByText('No waitlist signups yet.')).toBeInTheDocument();
  });

  it('PATCHes landing mode after confirm and refetches', async () => {
    const { refetchLaunch } = stubFetch();
    window.confirm = jest.fn(() => true);
    mockAuthenticatedRequest.mockResolvedValue({
      data: { success: true, data: { landingMode: 'launched' } },
    });

    renderLaunch();
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

    renderLaunch();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to launched' }));

    expect(mockAuthenticatedRequest).not.toHaveBeenCalled();
  });

  it('downloads waitlist CSV without logging phones', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    stubFetch();
    mockAuthenticatedRequest.mockResolvedValue({
      data: 'createdAt,phoneE164\n2026-08-10T12:00:00.000Z,+14155550100',
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

    renderLaunch();
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));

    await waitFor(() => {
      expect(click).toHaveBeenCalled();
    });
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/pivot/tenants/nyc/waitlist.csv',
    );
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringMatching(/\+14155550100/));
    logSpy.mockRestore();
    createSpy.mockRestore();
  });

  it('maskWaitlistPhone keeps only the last four digits', () => {
    expect(maskWaitlistPhone('+14155550100')).toBe('ending in 0100');
    expect(maskWaitlistPhone('')).toBe('this signup');
  });

  it('removes a waitlist row without logging or toasting the full phone', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { refetchWaitlist, refetchLaunch } = stubFetch();
    window.confirm = jest.fn(() => true);
    mockAuthenticatedRequest.mockResolvedValue({
      data: { success: true, data: { tenantKey: 'nyc', id: '507f1f77bcf86cd799439011', deleted: true } },
    });

    renderLaunch();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('ending in 0100'));
    expect(window.confirm.mock.calls[0][0]).not.toMatch(/\+14155550100/);

    await waitFor(() => {
      expect(refetchWaitlist).toHaveBeenCalled();
    });
    expect(refetchLaunch).toHaveBeenCalled();
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/pivot/tenants/nyc/waitlist/507f1f77bcf86cd799439011',
      { method: 'DELETE' },
    );
    expect(JSON.stringify(mockAddNotification.mock.calls)).not.toMatch(/\+14155550100/);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringMatching(/\+14155550100/));
    logSpy.mockRestore();
  });

  it('does not delete when confirm is cancelled', async () => {
    stubFetch();
    window.confirm = jest.fn(() => false);

    renderLaunch();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(mockAuthenticatedRequest).not.toHaveBeenCalled();
  });

  it('refreshes launch, waitlist, and tracking QRs together', () => {
    const { refetchLaunch, refetchWaitlist, refetchQrs } = stubFetch();
    renderLaunch();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(refetchLaunch).toHaveBeenCalled();
    expect(refetchWaitlist).toHaveBeenCalled();
    expect(refetchQrs).toHaveBeenCalled();
  });
});
