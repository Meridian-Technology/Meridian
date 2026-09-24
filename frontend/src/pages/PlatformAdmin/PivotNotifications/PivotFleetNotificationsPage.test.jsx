import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PivotFleetNotificationsPage, {
  FLEET_NOTIFICATIONS_POLL_MS,
} from './PivotFleetNotificationsPage';

const mockUseFetch = jest.fn();
const mockAuthenticatedRequest = jest.fn();
const mockAddNotification = jest.fn();
const mockRefetchFailed = jest.fn();
const mockRefetchDefinitions = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
  authenticatedRequest: (...args) => mockAuthenticatedRequest(...args),
}));

jest.mock('../../../NotificationContext', () => ({
  useNotification: () => ({ addNotification: mockAddNotification }),
}));

jest.mock('@iconify-icon/react', () => ({
  Icon: () => null,
}));

jest.mock('../../Admin/General/AdminPlatformAnalytics/AdminPlatformMetricChart', () => ({
  __esModule: true,
  default: ({ emptyMessage, series }) => (
    <div>
      chart:{emptyMessage}:{series?.[0]?.data?.length || 0}
    </div>
  ),
}));

jest.mock('../PivotTenantDashboard/PivotTenantPage', () => ({ title, subtitle, children, actions }) => (
  <main>
    <h1>{title}</h1>
    {subtitle ? <p>{subtitle}</p> : null}
    {actions}
    {children}
  </main>
));

jest.mock('../../../components/PivotOps', () => ({
  PivotOpsSection: ({ title, description, children, actions }) => (
    <section>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {actions}
      {children}
    </section>
  ),
  PivotOpsStatus: ({ children }) => <span>{children}</span>,
  PivotOpsMetricGrid: ({ children }) => <div>{children}</div>,
  PivotOpsMetric: ({ label, value }) => (
    <span>{label} {value}</span>
  ),
  PivotOpsAnimateNumber: ({ value }) => <span>{value}</span>,
  PivotOpsBarList: ({ items = [] }) => (
    <ul>
      {items.map((item) => (
        <li key={item.key}>{item.label} {item.value}</li>
      ))}
    </ul>
  ),
}));

const failedRuns = {
  success: true,
  data: {
    runs: [
      {
        id: 'run-fail',
        type: 'ritual_crew_scan',
        tenantKey: 'sf',
        status: 'failed',
        lastError: 'Expo unavailable after retries',
        finishedAt: '2026-09-21T21:02:05.000Z',
        payload: {},
        summary: { attempted: 2, accepted: 0, failed: 1 },
      },
    ],
  },
};

const definitions = {
  success: true,
  data: [
    {
      id: 'def-1',
      definitionKey: 'ritual_crew_scan',
      handlerKey: 'ritual_crew_scan',
      tenantKey: null,
      enabled: true,
      scheduleCron: '0,30 * * * *',
      copyTitleKey: 'notifications.ritual.quorumWaiting.title',
      copyBodyKey: 'notifications.ritual.quorumWaiting.body',
      rules: [{
        outcome: 'send',
        conditions: [
          { attribute: 'quorumMet', operator: 'is', value: false },
          { attribute: 'unfinishedSwiperCount', operator: 'gte', value: 1 },
        ],
      }],
    },
  ],
};

const computeRuns = {
  success: true,
  data: {
    runs: [
      {
        id: 'compute:job:refresh-sf-1',
        type: 'city-curation-refresh',
        tenantKey: 'sf',
        status: 'failed',
        computeStatus: 'failed',
        lastError: 'EXECUTION_FAILED: worker boom',
        finishedAt: '2026-09-21T21:10:00.000Z',
        externalJobId: 'job:refresh-sf-1',
        inspectorHref: '/platform-admin/pivot/sf?page=10&computeJobId=job%3Arefresh-sf-1',
        source: 'compute',
        readOnly: true,
      },
    ],
  },
};

const tenants = [
  { tenantKey: 'sf', location: 'San Francisco', pivotPilot: true },
  { tenantKey: 'nyc', location: 'New York', pivotPilot: true },
];

function stubFetches() {
  mockUseFetch.mockImplementation((url) => {
    if (String(url).includes('/admin/meridian/jobs/compute-runs')) {
      return {
        data: computeRuns,
        loading: false,
        error: null,
        refetch: jest.fn(),
      };
    }
    if (/\/admin\/meridian\/jobs\/runs\/[^/?]+/.test(String(url))) {
      return {
        data: {
          success: true,
          data: {
            run: failedRuns.data.runs[0],
            deliveries: [
              {
                id: 'delivery-1',
                name: 'Ari Example',
                username: 'ari',
                deliveryStatus: 'failed',
              },
            ],
          },
        },
        loading: false,
        error: null,
        refetch: jest.fn(),
      };
    }
    if (String(url).includes('/admin/pivot/copy/catalog')) {
      return {
        data: {
          success: true,
          data: {
            keys: [
              { path: 'notifications.ritual.quorumWaiting.title', shipped: 'Your crew is waiting' },
              { path: 'notifications.ritual.quorumWaiting.body', shipped: 'Swipe the rest of your cards.' },
            ],
            tokens: [],
          },
        },
        loading: false,
        error: null,
        refetch: jest.fn(),
      };
    }
    if (String(url).includes('/admin/pivot/copy')) {
      return {
        data: { success: true, data: { entries: {}, tokens: {} } },
        loading: false,
        error: null,
        refetch: jest.fn(),
      };
    }
    if (String(url).includes('/admin/meridian/jobs/notification-rule-catalog')) {
      return {
        data: {
          success: true,
          data: {
            handlerKey: 'ritual_crew_scan',
            attributes: [
              { key: 'quorumMet', label: 'Quorum met', type: 'boolean' },
              { key: 'unfinishedSwiperCount', label: 'Unfinished swipers', type: 'number' },
            ],
            operators: {
              boolean: [{ key: 'is', label: 'is' }],
              number: [
                { key: 'is', label: 'is' },
                { key: 'gte', label: 'is at least' },
              ],
              enum: [],
            },
            outcomes: ['send'],
            defaultRules: [],
          },
        },
        loading: false,
        error: null,
        refetch: jest.fn(),
      };
    }
    if (String(url).includes('/admin/meridian/jobs/runs')) {
      return {
        data: failedRuns,
        loading: false,
        error: null,
        refetch: mockRefetchFailed,
      };
    }
    return {
      data: definitions,
      loading: false,
      error: null,
      refetch: mockRefetchDefinitions,
    };
  });
}

function renderPage() {
  stubFetches();
  return render(
    <MemoryRouter>
      <PivotFleetNotificationsPage tenants={tenants} />
    </MemoryRouter>,
  );
}

describe('PivotFleetNotificationsPage', () => {
  let view;

  beforeEach(() => {
    mockAuthenticatedRequest.mockResolvedValue({
      data: { success: true, data: { created: true, run: { id: 'run-new' } } },
    });
  });

  afterEach(() => {
    view?.unmount();
    view = undefined;
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('lists schedules in plain language and failed runs without compute jobs', async () => {
    view = renderPage();

    expect(screen.getByRole('heading', { name: 'Notifications', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByText('chart:No sends in this range:14')).toBeInTheDocument();
    expect(screen.getByText('Sent by schedule')).toBeInTheDocument();
    expect(screen.getByText(/history of each schedule/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Needs a look' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Crew swipe nudge').length).toBeGreaterThan(0);
    expect(screen.getByText('Nudges crew members who still have cards to swipe.')).toBeInTheDocument();
    expect(screen.getByText('Sends when Quorum met is no and Unfinished swipers is at least 1.')).toBeInTheDocument();
    expect(screen.getByText('Checks at :00 and :30 · all cities')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Who it reached' })).not.toBeInTheDocument();

    expect(screen.queryByRole('heading', { name: 'Compute jobs' })).not.toBeInTheDocument();
    expect(screen.queryByText('city-curation-refresh')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Enqueue' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New schedule' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run now' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Crew swipe nudge' }));
    expect(screen.getByRole('heading', { name: 'Crew swipe nudge' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toHaveValue('Your crew is waiting');
      expect(screen.getByLabelText('Body')).toHaveValue('Swipe the rest of your cards.');
    });
    expect(screen.getByRole('button', { name: 'Who attribute 1 1' })).toHaveTextContent('Quorum met');
    expect(screen.getByRole('button', { name: 'Who value 1 1' })).toHaveTextContent('no');
    fireEvent.click(screen.getByRole('button', { name: 'Checks' }));
    expect(screen.getByRole('heading', { name: 'Checks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Found 2/ })).toHaveTextContent('Sent 0');
    expect(screen.getByText('Expo unavailable after retries')).toBeInTheDocument();
    expect(screen.getByText('Ari Example')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New schedule' }));
    expect(screen.getByRole('heading', { name: 'New schedule' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create schedule' })).toBeInTheDocument();
  });

  it('pauses a schedule from the row without opening the check history', async () => {
    view = renderPage();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    expect(screen.getByRole('button', { name: /Batch week/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Paused' }));
    expect(confirmSpy).toHaveBeenCalledWith('Pause Crew swipe nudge?');
    confirmSpy.mockRestore();

    await waitFor(() => {
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        '/admin/meridian/jobs/definitions/def-1',
        expect.objectContaining({
          method: 'PATCH',
          data: { enabled: false },
        }),
      );
      expect(mockRefetchDefinitions).toHaveBeenCalled();
    });
    expect(screen.queryByRole('heading', { name: 'Checks' })).not.toBeInTheDocument();
  });

  it('restores every built-in schedule from the list', async () => {
    view = renderPage();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    fireEvent.click(screen.getByRole('button', { name: 'Restore default schedules' }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Restore all default schedules?'));
    await waitFor(() => {
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        '/admin/meridian/jobs/definitions/restore-defaults',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(mockRefetchDefinitions).toHaveBeenCalled();
    });
    confirmSpy.mockRestore();
  });

  it('leaves a schedule unchanged when the state change is declined', () => {
    view = renderPage();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

    fireEvent.click(screen.getByRole('button', { name: 'Paused' }));

    expect(confirmSpy).toHaveBeenCalledWith('Pause Crew swipe nudge?');
    expect(mockAuthenticatedRequest).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('queues a run from the schedule row', async () => {
    view = renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Crew swipe nudge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Checks' }));
    fireEvent.change(screen.getByLabelText('City for Crew swipe nudge'), {
      target: { value: 'nyc' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dry run' }));
    fireEvent.click(screen.getByRole('button', { name: 'Queue run' }));

    await waitFor(() => {
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        '/admin/meridian/jobs/runs/enqueue',
        expect.objectContaining({
          method: 'POST',
          data: {
            handlerKey: 'ritual_crew_scan',
            tenantKey: 'nyc',
            payload: { dryRun: false },
          },
        }),
      );
    });
    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Run queued', type: 'success' }),
      );
    });
  });

  it('polls the failed-run queue', () => {
    jest.useFakeTimers();
    view = renderPage();

    expect(mockRefetchFailed).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(FLEET_NOTIFICATIONS_POLL_MS);
    });
    expect(mockRefetchFailed).toHaveBeenCalledWith({ silent: true });
  });
});
