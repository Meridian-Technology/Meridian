import React from 'react';
import { render, screen } from '@testing-library/react';
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
        runKey: 'weekly_drop:sf:2026-W38:direct:1',
        status: 'succeeded',
        createdAt: '2026-09-21T21:00:00.000Z',
        pivotDropPushRunId: 'legacy-dual',
        payload: { batchWeek: '2026-W38', pushTitle: 'just go*' },
        summary: { attempted: 4, accepted: 3, failed: 1, recipientOverflowCount: 0 },
      },
    ],
  },
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
    mockUseFetch.mockImplementation((url) => {
      if (!url) return { data: null, loading: false, error: null, refetch: jest.fn() };
      if (String(url).includes('/meridian/jobs/runs')) {
        return { data: jobRuns, loading: false, error: null, refetch: jest.fn() };
      }
      return { data: dropStatus, loading: false, error: null, refetch: jest.fn() };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('absorbs weekly drop send, dry-run, and schedule under Notifications', () => {
    renderNotifications();

    expect(screen.getByRole('heading', { name: 'Notifications', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Preview push/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send at drop window/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Weekly drop schedule' })).toBeInTheDocument();
  });

  it('lists meridian job runs and falls back to unmatched legacy PivotDropPushRun history', () => {
    renderNotifications();

    expect(screen.getByText(/2026-W38 · just go\*/)).toBeInTheDocument();
    expect(screen.getByText(/Job run · succeeded/)).toBeInTheDocument();
    expect(screen.queryByText('Dual-written send')).not.toBeInTheDocument();
    expect(screen.getByText(/2026-W30 · Old send/)).toBeInTheDocument();
    expect(screen.getByText(/Legacy send/)).toBeInTheDocument();
  });

  it('links meridian job runs to detail with batchWeek and run id', () => {
    renderNotifications();

    const openRun = screen.getByRole('link', { name: 'Open run' });
    expect(openRun).toHaveAttribute(
      'href',
      '/platform-admin/pivot/sf?page=9&jobRunId=job-new&batchWeek=2026-W38',
    );
  });

  it('opens run detail when jobRunId is in the query', () => {
    renderNotifications(
      '/platform-admin/pivot/sf?page=9&jobRunId=job-new&batchWeek=2026-W38',
    );

    expect(screen.getByText('run-detail:sf:job-new:2026-W38')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Notifications' })).not.toBeInTheDocument();
  });
});
