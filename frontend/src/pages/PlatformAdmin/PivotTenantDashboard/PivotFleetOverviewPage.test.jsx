import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PivotFleetOverviewPage from './PivotFleetOverviewPage';

const mockUseFetch = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
}));

jest.mock('./usePivotBatchWeekState', () => ({
  __esModule: true,
  default: () => ({
    batchWeek: '2026-W28',
    committedWeek: '2026-W28',
    setBatchWeek: jest.fn(),
    batchWeekValid: true,
    committedWeekValid: true,
  }),
}));

jest.mock('./usePivotTenantWeekKeybinds', () => ({
  __esModule: true,
  default: () => ({ keyboardNavActive: false }),
}));

jest.mock('./useOverviewMetricsSoften', () => ({
  __esModule: true,
  default: () => false,
}));

jest.mock('./PivotTenantPage', () => ({
  __esModule: true,
  default: ({ title, cityDisplayName, children }) => (
    <div>
      <h1>{title}</h1>
      <p data-testid="fleet-city">{cityDisplayName}</p>
      {children}
    </div>
  ),
}));

jest.mock('./PivotBatchWeekPicker', () => () => <div>week-picker</div>);
jest.mock('../../../components/Interface/KeybindTooltip/KeybindTooltip', () => () => null);
jest.mock('./PivotOverviewPanels', () => ({
  __esModule: true,
  default: ({ topEvents, insights, kpis }) => (
    <div>
      <div>{kpis?.activeUsers} active</div>
      {topEvents.map((event) => (
        <div key={event.eventId}>{event.name}</div>
      ))}
      {insights.map((insight) => (
        <div key={insight.id}>{insight.title}</div>
      ))}
    </div>
  ),
  formatRate: (rate) => (rate == null || Number.isNaN(rate) ? '—' : `${Math.round(rate * 100)}%`),
}));

describe('PivotFleetOverviewPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders rolled-up KPIs and city links', () => {
    mockUseFetch.mockReturnValue({
      data: {
        success: true,
        data: {
          batchWeek: '2026-W28',
          cityDisplayName: 'All cities',
          failedTenants: [],
          tenants: [
            {
              tenantKey: 'nyc',
              cityDisplayName: 'New York',
              activeUsers: 10,
              score: 80,
              insightCount: 1,
            },
            {
              tenantKey: 'brooklyn',
              cityDisplayName: 'Brooklyn',
              activeUsers: 6,
              score: 40,
              insightCount: 0,
            },
          ],
          anchors: { liveWeek: '2026-W28' },
          weekRange: { label: 'Jul 6 – Jul 12, 2026', dropDayOfWeek: 1, timeZone: 'UTC' },
          dropSchedule: {
            batchWeek: '2026-W28',
            nextDropFormatted: 'Wed Jul 15',
            cityDisplayName: 'Brooklyn',
          },
          overview: {
            batchWeek: '2026-W28',
            kpis: {
              activeUsers: 16,
              eventCount: 30,
              registeredCount: 4,
              externalOpenUsers: 5,
              externalOpenCount: 8,
              swipeCount: 28,
              interestedCount: 7,
              feedbackCount: 4,
              feedbackAvg: 4.5,
              calendarAdds: 4,
              inviteShares: 3,
              interestsSaved: 2,
              eventCountsByStatus: { published: 30, staged: 4, draft: 3, other: 1, total: 38 },
              hostCreatedCounts: { hostPublished: 2, hostStaged: 1, hostDraft: 3 },
            },
            vsPrevWeek: { activeUsers: { current: 16, previous: 12, delta: 4 } },
            funnel: [
              { key: 'swipes', label: 'Swipes', value: 28 },
              { key: 'interested', label: 'Interested', value: 11 },
            ],
            cityContribution: [
              { tenantKey: 'nyc', cityDisplayName: 'New York', activeUsers: 10 },
              { tenantKey: 'brooklyn', cityDisplayName: 'Brooklyn', activeUsers: 6 },
            ],
            hostLiveWeekAlerts: [],
          },
          performance: {
            events: [
              {
                eventId: 'e-bk',
                name: 'BK Brunch',
                interestedTotal: 20,
                cityDisplayName: 'Brooklyn',
                tenantKey: 'brooklyn',
              },
            ],
          },
          insights: {
            insights: [
              {
                id: 'brooklyn:thin-catalog',
                severity: 'critical',
                title: 'Brooklyn: Catalog below drop target',
                body: 'Add more.',
                href: '/platform-admin/pivot/brooklyn?page=1',
              },
            ],
          },
          readiness: {
            cityCount: 2,
            belowTarget: 1,
            worstScore: 40,
            soonestHoursUntilDrop: 4,
            cities: [
              { tenantKey: 'nyc', cityDisplayName: 'New York', score: 80 },
              { tenantKey: 'brooklyn', cityDisplayName: 'Brooklyn', score: 40 },
            ],
          },
          retention: {
            tenant: {
              weeks: [{ batchWeek: '2026-W28', activeUsers: 16, retentionRate: 40 }],
            },
          },
          crewMetrics: {
            totalCrews: 3,
            kpis: {
              crewCreationRate: { rate: 0.375, usersWithCrew: 3, wau: 8 },
              quorumHitRate: { rate: 0.5, quorumMet: 1, activeCrews: 2 },
              judgementConfirmRate: { rate: 0.5, confirmed: 1, proposed: 2 },
              invitedJoinRate: { rate: 0.75, resolved: 3, sent: 4 },
              crossCrewSurfaces: { views: 6, clicks: 2 },
            },
          },
        },
      },
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(
      <MemoryRouter>
        <PivotFleetOverviewPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('fleet-city')).toHaveTextContent('All cities');
    expect(
      screen.getAllByRole('link', { name: /New York/i })[0],
    ).toHaveAttribute('href', '/platform-admin/pivot/nyc');
    expect(
      screen.getAllByRole('link', { name: /Brooklyn/i })[0],
    ).toHaveAttribute('href', '/platform-admin/pivot/brooklyn');
    expect(screen.getByText('BK Brunch')).toBeInTheDocument();
    expect(screen.getByText('Brooklyn: Catalog below drop target')).toBeInTheDocument();
    expect(mockUseFetch).toHaveBeenCalledWith(
      '/admin/pivot/ops',
      expect.objectContaining({
        params: expect.objectContaining({ include: 'overview' }),
      }),
    );
  });
});
