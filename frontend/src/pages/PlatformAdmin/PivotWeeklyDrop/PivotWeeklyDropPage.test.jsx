import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PivotWeeklyDropPage from './PivotWeeklyDropPage';

const mockUseFetch = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
  authenticatedRequest: jest.fn(),
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

describe('PivotWeeklyDropPage tenant panel', () => {
  beforeEach(() => {
    mockUseFetch.mockImplementation((url) => {
      if (!url) return { data: null, loading: false, error: null, refetch: jest.fn() };
      if (String(url).includes('/meridian/jobs/runs')) {
        return {
          data: { success: true, data: { runs: [] } },
          loading: false,
          error: null,
          refetch: jest.fn(),
        };
      }
      return {
        data: {
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
                _id: 'run-1',
                batchWeek: '2026-W37',
                accepted: 3,
                failed: 1,
                attempted: 4,
                createdAt: '2026-09-07T21:00:00.000Z',
                recipients: [
                  {
                    userId: 'user-2',
                    name: 'Ben Example',
                    username: 'ben',
                    product: 'justgo',
                    deliveryStatus: 'failed',
                    error: 'DeviceNotRegistered',
                  },
                  {
                    userId: 'user-1',
                    name: 'Ari Example',
                    username: 'ari',
                    product: 'justgo',
                    deliveryStatus: 'accepted',
                    error: null,
                  },
                ],
              },
            ],
          },
        },
        loading: false,
        error: null,
        refetch: jest.fn(),
      };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows audience composition, the eligible batch, and send outcomes', () => {
    render(
      <PivotWeeklyDropPage
        tenantKey="sf"
        tenant={{ tenantKey: 'sf', name: 'San Francisco', pivotPilot: true }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Weekly drop', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Send audience' })).toBeInTheDocument();
    expect(screen.getByText('Just Go standalone: 2')).toBeInTheDocument();
    expect(screen.getByText('Meridian pivot: 1')).toBeInTheDocument();
    expect(screen.getByText('Ari Example')).toBeInTheDocument();
    expect(screen.getByText('@ari')).toBeInTheDocument();
    expect(screen.getByText('3 accepted')).toBeInTheDocument();
    expect(screen.getByText('1 failed')).toBeInTheDocument();
  });

  it('expands a recent send to show specific recipients', () => {
    render(
      <PivotWeeklyDropPage
        tenantKey="sf"
        tenant={{ tenantKey: 'sf', name: 'San Francisco', pivotPilot: true }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Inspect 2 users' }));
    expect(screen.getByText('Ben Example')).toBeInTheDocument();
    expect(screen.getByText('DeviceNotRegistered')).toBeInTheDocument();
    expect(screen.getAllByText('Ari Example').length).toBeGreaterThan(0);
  });
});
