import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PivotGrowthOverview from './PivotGrowthOverview';
import {
  describeDelta,
  formatPercent,
  formatWeekRange,
  retentionCellColors,
} from './pivotGrowthOverviewFormat';

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

function cohort(week, startDate, size, rates) {
  return {
    week,
    startDate,
    size,
    cells: rates.map(([rate, complete], offset) => ({
      offset,
      rate,
      active: Math.round(rate * size),
      complete,
    })),
  };
}

function table(scale = 1) {
  return {
    cohorts: [
      cohort('2026-W37', '2026-09-10', 20, [[0.8 * scale, true], [0.5 * scale, true], [0.4 * scale, true], [0.3, false]]),
      cohort('2026-W38', '2026-09-17', 10, [[0.9 * scale, true], [0.6 * scale, true], [0.2, false]]),
      cohort('2026-W39', '2026-09-24', 0, [[null, true], [null, false]]),
      cohort('2026-W40', '2026-10-01', 4, [[0.5, false]]),
    ],
    average: [
      { offset: 0, rate: 0.833 * scale, cohorts: 2, users: 30 },
      { offset: 1, rate: 0.533 * scale, cohorts: 2, users: 30 },
      { offset: 2, rate: 0.4 * scale, cohorts: 1, users: 20 },
    ],
  };
}

function week(weekKey, startDate, extra = {}) {
  return {
    week: weekKey,
    startDate,
    complete: true,
    weeklyActive: 10,
    newMembers: 3,
    referredMembers: 1,
    planners: 4,
    plansSaved: 9,
    ticketOpeners: 2,
    ...extra,
  };
}

function payload(overrides = {}) {
  return {
    success: true,
    data: {
      tenantKey: 'nyc',
      currentWeek: '2026-W40',
      lastCompleteWeek: '2026-W39',
      cohortWeeks: 4,
      totalMembers: 34,
      headline: {
        weeklyActive: { value: 12, previous: 10 },
        newMembers: { value: 4, previous: 5, referredShare: 0.25 },
        activation: { value: 0.83, previous: 0.8, cohorts: 4 },
        week1Retention: { value: null, previous: null, cohorts: 4 },
        quickRatio: { value: 1.5, previous: 0.75 },
        planRate: { value: 0.42, previous: 0.5 },
      },
      series: [
        week('2026-W37', '2026-09-10'),
        week('2026-W38', '2026-09-17'),
        week('2026-W39', '2026-09-24', { plansSaved: 17, ticketOpeners: 6 }),
        week('2026-W40', '2026-10-01', { complete: false }),
      ],
      retention: { opened: table(), swiped: table(0.5), planned: table(0.25) },
      growthAccounting: [
        { week: '2026-W37', complete: true, active: 18, new: 18, retained: 0, resurrected: 0, churned: 0, quickRatio: null },
        { week: '2026-W38', complete: true, active: 16, new: 8, retained: 7, resurrected: 1, churned: 11, quickRatio: 0.82 },
        { week: '2026-W39', complete: true, active: 12, new: 3, retained: 8, resurrected: 1, churned: 8, quickRatio: 0.5 },
        { week: '2026-W40', complete: false, active: 5, new: 4, retained: 1, resurrected: 0, churned: null, quickRatio: null },
      ],
      engagement: {
        weeks: ['2026-W36', '2026-W37', '2026-W38', '2026-W39'],
        activeUsers: 20,
        buckets: [
          { weeksActive: 1, users: 10 },
          { weeksActive: 2, users: 5 },
          { weeksActive: 3, users: 3 },
          { weeksActive: 4, users: 2 },
        ],
      },
      ...overrides,
    },
  };
}

function stub(response = payload(), extra = {}) {
  const refetch = jest.fn();
  mockUseFetch.mockReturnValue({ data: response, loading: false, error: null, refetch, ...extra });
  return refetch;
}

describe('pivotGrowthOverviewFormat', () => {
  it('formats drop-week ranges and percentages', () => {
    expect(formatWeekRange('2026-09-24')).toBe('Sep 24 – Sep 30');
    expect(formatPercent(0.4321)).toBe('43%');
    expect(formatPercent(0.042)).toBe('4.2%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(null)).toBe('—');
  });

  it('describes week-over-week deltas without color', () => {
    expect(describeDelta(12, 10)).toEqual({ direction: 'up', text: '20%', label: 'up 20%' });
    expect(describeDelta(0.42, 0.5, 'rate')).toEqual({ direction: 'down', text: '8 pts', label: 'down 8 pts' });
    expect(describeDelta(1.5, 0.75, 'ratio').text).toBe('0.75');
    expect(describeDelta(3, 0)).toMatchObject({ direction: 'up', text: 'new' });
    expect(describeDelta(5, 5)).toMatchObject({ direction: 'flat' });
    expect(describeDelta(5, null)).toBeNull();
  });

  it('shades retention as Just Go orange at an opacity that follows the rate', () => {
    expect(retentionCellColors(0)).toEqual({ background: 'rgba(255, 79, 31, 0.08)', color: '#1a1714' });
    expect(retentionCellColors(0.5)).toEqual({ background: 'rgba(255, 79, 31, 0.54)', color: '#1a1714' });
    expect(retentionCellColors(0.99)).toEqual({ background: 'rgba(255, 79, 31, 0.99)', color: '#1a1714' });
    expect(retentionCellColors(1)).toEqual({ background: 'rgba(255, 79, 31, 1)', color: '#ffffff' });
    expect(retentionCellColors(1.4)).toEqual(retentionCellColors(1));
    expect(retentionCellColors(null)).toBeNull();
  });
});

describe('PivotGrowthOverview', () => {
  beforeEach(() => {
    mockUseFetch.mockReset();
    mockAuthenticatedRequest.mockReset();
    mockAddNotification.mockReset();
  });

  it('sets a launch date on the city and reloads the overview', async () => {
    const refetch = stub();
    mockAuthenticatedRequest.mockResolvedValue({ data: { success: true } });
    render(<PivotGrowthOverview tenantKey="nyc" />);

    expect(screen.getByText(/Counting all history/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set launch date' }));
    fireEvent.change(screen.getByLabelText('Launch date'), { target: { value: '2026-09-24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/platform/tenants/nyc',
      expect.objectContaining({ method: 'PUT', data: { pivotLaunchDate: '2026-09-24' } }),
    );
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Launch date saved', type: 'success' }),
    );
  });

  it('shows the launch date and clears it to count all history', async () => {
    const refetch = stub(payload({
      launchDate: '2026-09-24',
      launch: { week: '2026-W39', startDate: '2026-09-24', started: true },
      preLaunchMembers: 3,
    }));
    mockAuthenticatedRequest.mockResolvedValue({ data: { success: true } });
    render(<PivotGrowthOverview tenantKey="nyc" />);

    expect(screen.getByText('Sep 24, 2026')).toBeInTheDocument();
    expect(screen.getByText(/3 people who joined earlier are not in cohorts/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByLabelText('Launch date')).toHaveValue('2026-09-24');
    fireEvent.click(screen.getByRole('button', { name: 'Count all history' }));

    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/platform/tenants/nyc',
      expect.objectContaining({ data: { pivotLaunchDate: null } }),
    );
  });

  it('keeps the editor open with the error when saving fails', async () => {
    const refetch = stub();
    mockAuthenticatedRequest.mockResolvedValue({
      data: { success: false, message: 'pivotLaunchDate must be YYYY-MM-DD.' },
    });
    render(<PivotGrowthOverview tenantKey="nyc" />);

    fireEvent.click(screen.getByRole('button', { name: 'Set launch date' }));
    fireEvent.change(screen.getByLabelText('Launch date'), { target: { value: '2026-09-24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('pivotLaunchDate must be YYYY-MM-DD.');
    expect(screen.getByLabelText('Launch date')).toBeInTheDocument();
    expect(refetch).not.toHaveBeenCalled();
  });

  it('shows when counting will start for a future launch, and no metrics', () => {
    stub(payload({
      launchDate: '2026-10-15',
      launch: { week: '2026-W42', startDate: '2026-10-15', started: false },
      cohortWeeks: 0,
      series: [],
      growthAccounting: [],
    }));
    render(<PivotGrowthOverview tenantKey="nyc" />);

    expect(screen.getByText('Counting hasn’t started yet')).toBeInTheDocument();
    expect(screen.getByText(/drop week of Oct 15 – Oct 21/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Weekly actives' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Cohort retention' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  });

  it('loads the city overview and shows headline tiles for the last complete week', () => {
    stub();
    render(<PivotGrowthOverview tenantKey="nyc" />);

    expect(mockUseFetch).toHaveBeenCalledWith(
      '/admin/pivot/tenants/nyc/analytics/overview',
      expect.any(Object),
    );
    expect(screen.getByText('Sep 24 – Sep 30', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Weekly actives' })).toHaveTextContent('12');
    expect(screen.getByLabelText('up 20% vs prior week')).toBeInTheDocument();
    expect(screen.getByText('25% via referral')).toBeInTheDocument();
    expect(screen.getByText('Needs 4 cohorts with a finished week 1')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Quick ratio' })).toHaveTextContent('1.50');
    expect(screen.getByLabelText('down 8 pts vs prior week')).toBeInTheDocument();
  });

  it('renders the cohort triangle with a weighted average row and unknown future weeks', () => {
    stub();
    render(<PivotGrowthOverview tenantKey="nyc" />);

    const grid = screen.getByRole('table', { name: 'Cohort retention by join week' });
    const rows = within(grid).getAllByRole('row');
    // Header, average, then newest cohort first.
    expect(rows[1]).toHaveTextContent('All cohorts');
    expect(rows[1]).toHaveTextContent('83%');
    expect(rows[2]).toHaveTextContent('Oct 1 – Oct 7');
    expect(rows[5]).toHaveTextContent('Sep 10 – Sep 16');
    expect(rows[5]).toHaveTextContent('80%');

    const partial = within(rows[5]).getByLabelText(/week 3: 30% .*week in progress/);
    expect(partial).toHaveClass('pivot-growth-overview__cell--partial');
    // W40 cohort has one cell; later weeks are blank, not 0%.
    expect(within(rows[2]).getAllByRole('cell').filter((cell) => cell.textContent === '')).toHaveLength(3);
  });

  it('labels the curve by week and shows a tooltip for the hovered week', () => {
    stub();
    render(<PivotGrowthOverview tenantKey="nyc" />);
    const grid = screen.getByRole('table', { name: 'Cohort retention by join week' });

    ['W0', 'W1', 'W2', 'W3'].forEach((label) => {
      expect(within(grid).getByText(label)).toBeInTheDocument();
    });
    expect(within(grid).queryByRole('tooltip')).toBeNull();

    fireEvent.mouseEnter(within(grid).getByLabelText('Week 1: 53% of 30 people across 2 cohorts'));

    const tip = within(grid).getByRole('tooltip');
    expect(tip).toHaveTextContent('Week 1');
    expect(tip).toHaveTextContent('All cohorts 53%');
    expect(tip).toHaveTextContent('Joined Sep 10 50%');
    expect(tip).toHaveTextContent('Joined Sep 17 60%');

    fireEvent.mouseLeave(
      within(grid).getByRole('img', { name: 'Weighted average retention by week since joining' }),
    );
    expect(within(grid).queryByRole('tooltip')).toBeNull();

    fireEvent.focus(within(grid).getByLabelText('Week 0: 83% of 30 people across 2 cohorts'));
    expect(within(grid).getByRole('tooltip')).toHaveTextContent('Week 0');
  });

  it('switches the activity definition behind the cohort table', () => {
    stub();
    render(<PivotGrowthOverview tenantKey="nyc" />);

    fireEvent.click(screen.getByRole('button', { name: 'Saved a plan' }));

    expect(screen.getByRole('button', { name: 'Saved a plan' })).toHaveAttribute('aria-pressed', 'true');
    const rows = within(screen.getByRole('table', { name: 'Cohort retention by join week' })).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('21%');
  });

  it('charts growth accounting with a table view and weeks-active distribution', () => {
    stub();
    render(<PivotGrowthOverview tenantKey="nyc" />);

    expect(screen.getByRole('img', { name: 'Weekly growth accounting' })).toBeInTheDocument();
    ['Retained', 'Resurrected', 'New', 'Churned'].forEach((label) => {
      expect(within(screen.getByRole('list', { name: 'Legend' })).getByText(label)).toBeInTheDocument();
    });
    expect(screen.getByText('Show as table')).toBeInTheDocument();
    const accountingTable = screen.getByRole('table', { name: 'Growth accounting by week' });
    expect(within(accountingTable).getByText('Sep 24 – Sep 30')).toBeInTheDocument();
    expect(screen.getByText('4 of 4 weeks')).toBeInTheDocument();
    expect(screen.getByText('Of 20 people active in the last 4 drop weeks.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Plans saved' })).toHaveTextContent('17');
    expect(screen.getByText('How these are calculated')).toBeInTheDocument();
  });

  it('loads all cities without a tenant and names the cities included', () => {
    stub(payload({
      scope: 'fleet',
      tenantKey: null,
      cities: [
        { tenantKey: 'nyc', cityDisplayName: 'New York City', members: 20, launchDate: '2026-09-10' },
        { tenantKey: 'sf', cityDisplayName: 'San Francisco', members: 14, launchDate: null },
      ],
      failedCities: [{ tenantKey: 'la', cityDisplayName: 'Los Angeles' }],
    }));
    render(<PivotGrowthOverview />);

    expect(mockUseFetch).toHaveBeenCalledWith('/admin/pivot/analytics/overview', expect.any(Object));
    expect(
      screen.getByText(/across 2 cities \(New York City from Sep 10, San Francisco\)/),
    ).toBeInTheDocument();
    // The launch date is set per city, not on the all-cities view.
    expect(screen.queryByRole('button', { name: 'Set launch date' })).toBeNull();
    expect(screen.getByText(/People in more than one city count once/)).toBeInTheDocument();
    expect(screen.getByText('Some cities are missing from these numbers')).toBeInTheDocument();
    expect(screen.getByText(/Could not load Los Angeles/)).toBeInTheDocument();
  });

  it('exposes refetch to the page header', () => {
    const refetch = stub();
    const refetchRef = { current: null };
    render(<PivotGrowthOverview tenantKey="nyc" refetchRef={refetchRef} />);
    expect(refetchRef.current).toBe(refetch);
  });

  it('shows loading, error, and empty states', () => {
    stub(null, { loading: true });
    const { unmount } = render(<PivotGrowthOverview tenantKey="nyc" />);
    expect(screen.getByText('Loading overview…')).toBeInTheDocument();
    unmount();

    stub(null, { error: 'boom' });
    const view = render(<PivotGrowthOverview tenantKey="nyc" />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
    view.unmount();

    stub(payload({ totalMembers: 0 }));
    render(<PivotGrowthOverview tenantKey="nyc" />);
    expect(screen.getByText('No members have joined this city yet.')).toBeInTheDocument();
  });
});
