import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import PivotFleetGrowthPage from './PivotFleetGrowthPage';
import { FUNNEL_COUNTING_NOTES } from './PivotAcquisitionFunnel';
import { shiftUtcMonth, toUtcMonth } from './PivotAnalyticsMonthPicker';

const mockUseFetch = jest.fn();
const mockRefetchOverview = jest.fn();
const mockRefetchLanding = jest.fn();

/* eslint-disable no-param-reassign */
jest.mock('./PivotGrowthOverview', () => ({
  __esModule: true,
  default: ({ tenantKey, refetchRef }) => {
    if (refetchRef) refetchRef.current = mockRefetchOverview;
    return <div>growth-overview:{tenantKey || 'all-cities'}</div>;
  },
}));

jest.mock('./PivotFleetLaunchPanel', () => ({
  __esModule: true,
  default: ({ refetchRef }) => {
    if (refetchRef) refetchRef.current = mockRefetchLanding;
    return <div>fleet-landing-panel</div>;
  },
}));
/* eslint-enable no-param-reassign */

jest.mock('./PivotWeeklyReportButton', () => ({
  __esModule: true,
  default: () => <button type="button">Weekly report</button>,
}));

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
}));

jest.mock('@iconify-icon/react', () => ({ Icon: () => null }));

jest.mock('../../../components/Interface/KeybindTooltip/KeybindTooltip', () => ({
  __esModule: true,
  default: () => null,
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

jest.mock('../../../components/PivotOps/PivotOpsAreaFunnel', () => ({
  __esModule: true,
  default: ({ stages, ariaLabel }) => (
    <div data-testid="area-funnel" aria-label={ariaLabel}>
      {(stages || []).map((stage) => stage.label).join(',')}
    </div>
  ),
}));

function funnelPayload(overrides = {}) {
  return {
    success: true,
    data: {
      tenantKey: 'nyc',
      scope: 'city',
      kind: 'volume',
      month: '2026-09',
      range: { label: 'September 2026' },
      overall: { from: 'landing', to: 'deck', rate: 0.12 },
      stages: [
        { key: 'landing', label: 'Landing page', unique: 100, events: 140 },
        { key: 'store_click', label: 'Store click', unique: 40, events: 55, conversionFromPrev: 0.4 },
        { key: 'install', label: 'App activity', unique: 25, events: 80, conversionFromPrev: 0.625 },
        { key: 'onboarding', label: 'Onboarding', unique: 18, events: 18, conversionFromPrev: 0.72 },
        { key: 'deck', label: 'First deck decision', unique: 12, events: 12, conversionFromPrev: 0.667 },
      ],
      ...overrides,
    },
  };
}

describe('shiftUtcMonth', () => {
  it('steps across year boundaries', () => {
    expect(shiftUtcMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftUtcMonth('2026-12', 1)).toBe('2027-01');
  });
});

function LocationProbe() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

function renderFleetGrowth(view) {
  const query = view ? `?page=2&growth=${view}` : '?page=2';
  return render(
    <MemoryRouter initialEntries={[`/platform-admin/pivot${query}`]}>
      <PivotFleetGrowthPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('PivotFleetGrowthPage', () => {
  beforeEach(() => {
    mockUseFetch.mockReset();
    mockRefetchOverview.mockReset();
    mockRefetchLanding.mockReset();
    mockUseFetch.mockImplementation((url) => ({
      data: url ? funnelPayload({ tenantKey: null, scope: 'fleet' }) : null,
      loading: false,
      error: null,
      refetch: jest.fn(),
    }));
  });

  it('opens on the all-cities overview and refreshes it from the header', () => {
    renderFleetGrowth();

    expect(screen.getByRole('heading', { name: 'Growth' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('growth-overview:all-cities')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Weekly report' })).toBeInTheDocument();
    // Fleet Growth has no per-city waitlist or QR views.
    expect(screen.queryByRole('tab', { name: 'Waitlist' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'QR codes' })).toBeNull();
    expect(mockUseFetch.mock.calls.filter(([url]) => url)).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(mockRefetchOverview).toHaveBeenCalled();
  });

  it('switches to the fleet landing funnel and refreshes it', () => {
    renderFleetGrowth();

    fireEvent.click(screen.getByRole('tab', { name: 'Landing' }));

    expect(screen.getByTestId('search')).toHaveTextContent('growth=landing');
    expect(screen.getByText('fleet-landing-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(mockRefetchLanding).toHaveBeenCalled();
    expect(mockRefetchOverview).not.toHaveBeenCalled();
  });

  it('shows the monthly acquisition funnel with counting notes', () => {
    renderFleetGrowth('acquisition');

    expect(screen.getByLabelText(new RegExp(`Month ${toUtcMonth()}`))).toBeInTheDocument();
    expect(screen.getByText(/September 2026/)).toBeInTheDocument();
    expect(screen.queryByText(FUNNEL_COUNTING_NOTES)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('How counts are defined'));
    expect(screen.getByRole('note')).toHaveTextContent(/not a verified install count/i);
    expect(screen.getByText(/first decision only/i)).toBeInTheDocument();
  });

  it('steps the month and loads the fleet acquisition route', () => {
    renderFleetGrowth('acquisition');
    fireEvent.click(screen.getByLabelText('Previous month'));

    expect(mockUseFetch).toHaveBeenCalledWith(
      '/admin/pivot/analytics/acquisition',
      expect.objectContaining({
        params: { month: shiftUtcMonth(toUtcMonth(), -1) },
      }),
    );
  });
});
