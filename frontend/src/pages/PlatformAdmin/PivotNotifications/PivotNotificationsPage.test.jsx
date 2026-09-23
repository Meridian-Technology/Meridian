import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PivotNotificationsPage from './PivotNotificationsPage';

const mockUseFetch = jest.fn();
const mockAuthenticatedRequest = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
  authenticatedRequest: (...args) => mockAuthenticatedRequest(...args),
}));

jest.mock('../../../NotificationContext', () => ({
  useNotification: () => ({ addNotification: jest.fn() }),
}));

jest.mock('@iconify-icon/react', () => ({
  Icon: () => null,
}));

jest.mock('../PivotTenantDashboard/PivotTenantPage', () => ({ title, subtitle, children }) => (
  <main>
    <h1>{title}</h1>
    <p>{subtitle}</p>
    {children}
  </main>
));

jest.mock('../../../components/PivotOps', () => ({
  PivotOpsSection: ({ title, description, children }) => (
    <section>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </section>
  ),
  PivotOpsStack: ({ title, segments }) => (
    <div>
      <p>{title}</p>
      {segments.map((segment) => (
        <span key={segment.key}>{segment.label}: {segment.value}</span>
      ))}
    </div>
  ),
  PivotOpsStatus: ({ children }) => <span>{children}</span>,
  PivotOpsMetricGrid: ({ children }) => <div>{children}</div>,
  PivotOpsMetric: ({ label, value }) => <span>{label} {value}</span>,
  PivotOpsAnimateNumber: ({ value }) => <span>{value}</span>,
  PivotOpsBarList: () => <div>sent-by-schedule</div>,
}));

jest.mock('../../Admin/General/AdminPlatformAnalytics/AdminPlatformMetricChart', () => ({
  __esModule: true,
  default: () => <div>sent-chart</div>,
}));

jest.mock('./PivotJobRunDetail', () => ({ tenantKey, runId, batchWeek }) => (
  <div>run-detail:{tenantKey}:{runId}:{batchWeek}</div>
));

const dropStatus = {
  success: true,
  data: {
    publishedEventCount: 12,
    pivotPushRecipientCount: 3,
    dropSchedule: {
      nextDropFormatted: 'Thu Sep 10, 6:00 PM EDT',
      localSchedule: 'Thursday at 18:00',
      source: 'default',
      withinDropWindow: true,
      minutesFromDropAt: 0,
      usingPilotDefaults: false,
      pushCopy: { title: 'just go*', body: 'The drop is live.', source: 'tenant' },
    },
    audience: {
      totalUsers: 6,
      eligible: 3,
      noToken: 2,
      otherEdition: 1,
      products: { justgo: 2, campus: 1, legacy: 0 },
      users: [
        {
          id: 'user-1',
          name: 'Ari Example',
          username: 'ari',
          product: 'justgo',
          tokenRegisteredAt: '2026-09-07T20:00:00.000Z',
          joinedAt: '2026-08-01T20:00:00.000Z',
        },
      ],
    },
    recentRuns: [
      {
        _id: 'legacy-dual',
        batchWeek: '2026-W38',
        title: 'Dual-written send',
        accepted: 3,
        failed: 1,
        attempted: 4,
        createdAt: '2026-09-21T21:00:00.000Z',
        recipients: [],
      },
      {
        _id: 'legacy-old',
        batchWeek: '2026-W30',
        title: 'Old send',
        accepted: 2,
        failed: 0,
        attempted: 2,
        createdAt: '2026-07-23T21:00:00.000Z',
        audience: { justgo: 2, campus: 0, legacy: 0 },
        recipients: [
          {
            userId: 'user-old',
            name: 'Old Recipient',
            username: 'old',
            product: 'justgo',
            deliveryStatus: 'accepted',
            error: null,
          },
        ],
      },
    ],
  },
};

const jobRuns = {
  success: true,
  data: {
    runs: [
      {
        id: 'job-new',
        type: 'weekly_drop',
        tenantKey: 'sf',
        runKey: 'weekly_drop:sf:2026-W38:direct:1',
        status: 'succeeded',
        createdAt: '2026-09-21T21:00:00.000Z',
        finishedAt: '2026-09-21T21:00:00.000Z',
        pivotDropPushRunId: 'legacy-dual',
        payload: { batchWeek: '2026-W38', pushTitle: 'just go*' },
        summary: { attempted: 4, accepted: 3, failed: 1, recipientOverflowCount: 0 },
      },
    ],
  },
};

const definitions = {
  success: true,
  data: [
    {
      id: 'def-weekly',
      definitionKey: 'weekly_drop',
      handlerKey: 'weekly_drop',
      tenantKey: null,
      enabled: true,
      scheduleCron: '0 18 * * 5',
    },
  ],
};

function renderNotifications(path = '/platform-admin/pivot/sf?page=9') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/platform-admin/pivot/:tenantKey"
          element={(
            <PivotNotificationsPage
              tenantKey="sf"
              tenant={{ tenantKey: 'sf', name: 'San Francisco', pivotPilot: true }}
            />
          )}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PivotNotificationsPage tenant panel', () => {
  beforeEach(() => {
    mockAuthenticatedRequest.mockResolvedValue({ data: { success: true, data: {} } });
    mockUseFetch.mockImplementation((url, options) => {
      if (!url) return { data: null, loading: false, error: null, refetch: jest.fn() };
      if (String(url).includes('/jobs/definitions')) {
        return { data: definitions, loading: false, error: null, refetch: jest.fn() };
      }
      if (/\/meridian\/jobs\/runs\/[^/?]+/.test(String(url))) {
        return {
          data: {
            success: true,
            data: {
              run: jobRuns.data.runs[0],
              deliveries: [
                {
                  id: 'delivery-1',
                  userId: 'user-1',
                  name: 'Ari Example',
                  username: 'ari',
                  deliveryStatus: 'accepted',
                },
              ],
            },
          },
          loading: false,
          error: null,
          refetch: jest.fn(),
        };
      }
      if (String(url).includes('/meridian/jobs/runs')) {
        if (options?.params?.status === 'failed') {
          return {
            data: { success: true, data: { runs: [] } },
            loading: false,
            error: null,
            refetch: jest.fn(),
          };
        }
        return { data: jobRuns, loading: false, error: null, refetch: jest.fn() };
      }
      return { data: dropStatus, loading: false, error: null, refetch: jest.fn() };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the page to activity and the schedule list', () => {
    renderNotifications();

    expect(screen.getByRole('heading', { name: 'Notifications', level: 1 })).toBeInTheDocument();
    const activity = screen.getByRole('heading', { name: 'Activity' });
    const schedules = screen.getByRole('heading', { name: 'Schedules' });
    expect(activity.compareDocumentPosition(schedules) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('sent-chart')).toBeInTheDocument();
    expect(screen.getByText('Sent by schedule')).toBeInTheDocument();
    const audience = screen.getByRole('heading', { name: 'Send audience' });
    const recent = screen.getByRole('heading', { name: 'Recent sends' });
    expect(activity.compareDocumentPosition(audience) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(recent.compareDocumentPosition(schedules) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Eligible user batch' })).toBeInTheDocument();
    expect(screen.getByText('Ari Example')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Weekly drop schedule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Preview push/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Who it reached' })).not.toBeInTheDocument();
  });

  it('opens a schedule’s check history in a popup', () => {
    renderNotifications();

    fireEvent.click(screen.getByRole('button', { name: 'Weekly drop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Checks' }));

    expect(screen.getByRole('heading', { name: 'Checks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Found 4/ })).toHaveTextContent('Sent 3');
    expect(screen.getByRole('heading', { name: 'Who it sent to' })).toBeInTheDocument();
    expect(screen.getAllByText('Ari Example').length).toBeGreaterThan(1);
    expect(screen.getByRole('heading', { name: 'Send audience' })).toBeInTheDocument();
  });

  it('does not unfold a run under the list when jobRunId is set', () => {
    renderNotifications(
      '/platform-admin/pivot/sf?page=9&jobRunId=job-new&batchWeek=2026-W38',
    );

    expect(screen.queryByText(/run-detail:/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Notifications', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Preview push/i })).not.toBeInTheDocument();
  });
});
