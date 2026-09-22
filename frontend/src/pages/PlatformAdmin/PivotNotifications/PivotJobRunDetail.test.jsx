import React from 'react';
import { act, render, screen } from '@testing-library/react';
import PivotJobRunDetail, { JOB_RUN_DETAIL_POLL_MS } from './PivotJobRunDetail';

const mockUseFetch = jest.fn();
const mockRefetch = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
}));

jest.mock('@iconify-icon/react', () => ({
  Icon: () => null,
}));

jest.mock('../PivotTenantDashboard/PivotTenantPage', () => ({ title, subtitle, children, actions }) => (
  <main>
    <h1>{title}</h1>
    <p>{subtitle}</p>
    {actions}
    {children}
  </main>
));

jest.mock('../../../components/PivotOps', () => ({
  PivotOpsSection: ({ title, children }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  PivotOpsStatus: ({ children }) => <span>{children}</span>,
}));

const detailPayload = {
  success: true,
  data: {
    run: {
      id: '507f191e810c19729de860ea',
      runKey: 'weekly_drop:sf:2026-W38:direct:1',
      type: 'weekly_drop',
      status: 'failed',
      lastError: 'Expo unavailable after retries',
      payload: { batchWeek: '2026-W38' },
      summary: { attempted: 2, accepted: 1, failed: 1, recipientOverflowCount: 0 },
    },
    attempts: [
      {
        id: 'att-1',
        attemptNumber: 1,
        status: 'failed',
        error: 'timeout',
        startedAt: '2026-09-21T21:00:00.000Z',
        finishedAt: '2026-09-21T21:00:04.000Z',
      },
      {
        id: 'att-2',
        attemptNumber: 2,
        status: 'failed',
        error: 'Expo unavailable after retries',
        startedAt: '2026-09-21T21:02:00.000Z',
        finishedAt: '2026-09-21T21:02:05.000Z',
      },
    ],
    deliveries: [
      {
        id: 'del-1',
        userId: 'u1',
        name: 'Ari Example',
        username: 'ari',
        product: 'justgo',
        deliveryStatus: 'accepted',
        sentAt: '2026-09-21T21:02:03.000Z',
        error: null,
      },
      {
        id: 'del-2',
        userId: 'u2',
        name: 'Ben Example',
        username: 'ben',
        product: 'campus',
        deliveryStatus: 'failed',
        sentAt: '2026-09-21T21:02:04.000Z',
        error: 'DeviceNotRegistered',
      },
    ],
  },
};

describe('PivotJobRunDetail', () => {
  beforeEach(() => {
    mockRefetch.mockReset();
    mockUseFetch.mockReturnValue({
      data: detailPayload,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('renders attempt timeline, terminal error, and accepted/failed deliveries', () => {
    render(
      <PivotJobRunDetail
        tenantKey="sf"
        runId="507f191e810c19729de860ea"
        batchWeek="2026-W38"
        onBack={jest.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Run detail' })).toBeInTheDocument();
    expect(screen.getByText('2026-W38 · weekly_drop')).toBeInTheDocument();
    expect(screen.getByText('507f191e810c19729de860ea')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Expo unavailable after retries');
    expect(screen.getByText('Attempt 1')).toBeInTheDocument();
    expect(screen.getByText('Attempt 2')).toBeInTheDocument();
    expect(screen.getByText('timeout')).toBeInTheDocument();

    expect(screen.getByRole('columnheader', { name: 'User' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'App' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Time' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Error' })).toBeInTheDocument();
    expect(screen.getByText('Ari Example')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('Ben Example')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('DeviceNotRegistered')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Permalink' })).toHaveAttribute(
      'href',
      '/platform-admin/pivot/sf?page=9&jobRunId=507f191e810c19729de860ea&batchWeek=2026-W38',
    );
  });

  it('polls the run detail every 45 seconds', () => {
    jest.useFakeTimers();
    render(
      <PivotJobRunDetail
        tenantKey="sf"
        runId="507f191e810c19729de860ea"
      />,
    );

    expect(mockRefetch).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(JOB_RUN_DETAIL_POLL_MS);
    });
    expect(mockRefetch).toHaveBeenCalledWith({ silent: true });
  });
});
