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
      copyTitleKey: 'notifications.ritual.title',
      copyBodyKey: 'notifications.ritual.body',
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

  it('lists failed runs with city Open run links, definitions, and enqueue controls', () => {
    view = renderPage();

    expect(screen.getByRole('heading', { name: 'Notifications', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Failed runs' })).toBeInTheDocument();
    expect(screen.getAllByText('San Francisco · sf').length).toBeGreaterThan(0);
    expect(screen.getByText('Expo unavailable after retries')).toBeInTheDocument();
    expect(screen.getAllByText('ritual_crew_scan').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Open run' })).toHaveAttribute(
      'href',
      '/platform-admin/pivot/sf?page=9&jobRunId=run-fail',
    );

    expect(screen.getByRole('heading', { name: 'Compute jobs' })).toBeInTheDocument();
    expect(screen.getByText('city-curation-refresh')).toBeInTheDocument();
    expect(screen.getByText('EXECUTION_FAILED: worker boom')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open inspect' })).toHaveAttribute(
      'href',
      '/platform-admin/pivot/sf?page=10&computeJobId=job%3Arefresh-sf-1',
    );

    expect(screen.getByRole('heading', { name: 'Definitions' })).toBeInTheDocument();
    expect(screen.getByText('Fleet template')).toBeInTheDocument();
    expect(screen.getByText('0,30 * * * *')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Enqueue' })).toBeInTheDocument();
    expect(screen.getByLabelText('Notification handler')).toHaveValue('weekly_drop');
    expect(screen.getByLabelText('Notification tenant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enqueue' })).toBeDisabled();
  });

  it('enqueues a supported handler for the selected city', async () => {
    view = renderPage();

    fireEvent.change(screen.getByLabelText('Notification handler'), {
      target: { value: 'ritual_crew_scan' },
    });
    fireEvent.change(screen.getByLabelText('Notification tenant'), {
      target: { value: 'nyc' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Dry-run/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Enqueue' }));

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
        expect.objectContaining({ title: 'Job enqueued', type: 'success' }),
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
