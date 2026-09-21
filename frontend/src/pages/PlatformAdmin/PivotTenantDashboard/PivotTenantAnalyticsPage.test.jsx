import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PivotTenantAnalyticsPage, {
  FUNNEL_COUNTING_NOTES,
  shiftUtcMonth,
  toUtcMonth,
} from './PivotTenantAnalyticsPage';

const mockUseFetch = jest.fn();

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
        { key: 'install', label: 'App open', unique: 25, events: 80, conversionFromPrev: 0.625 },
        { key: 'onboarding', label: 'Onboarding', unique: 18, events: 18, conversionFromPrev: 0.72 },
        { key: 'deck', label: 'Swiping deck', unique: 12, events: 12, conversionFromPrev: 0.667 },
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

describe('PivotTenantAnalyticsPage', () => {
  beforeEach(() => {
    mockUseFetch.mockReset();
    mockUseFetch.mockReturnValue({
      data: funnelPayload(),
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('loads the monthly city acquisition funnel', () => {
    render(<PivotTenantAnalyticsPage tenantKey="nyc" cityDisplayName="New York" />);

    expect(screen.getByRole('heading', { name: 'Analytics' })).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(`Month ${toUtcMonth()}`))).toBeInTheDocument();
    expect(screen.getByText(/September 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/volume funnel/i)).not.toBeInTheDocument();
    expect(screen.queryByText(FUNNEL_COUNTING_NOTES)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('How counts are defined'));
    expect(screen.getByRole('note')).toHaveTextContent(/session_start is not written/i);
    expect(screen.getByText(/first swipe only/i)).toBeInTheDocument();
    expect(mockUseFetch).toHaveBeenCalledWith(
      '/admin/pivot/tenants/nyc/analytics/acquisition',
      expect.objectContaining({
        params: { month: toUtcMonth() },
      }),
    );
  });

  it('steps the month and loads the fleet route', () => {
    mockUseFetch.mockReturnValue({
      data: funnelPayload({ tenantKey: null, scope: 'fleet' }),
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<PivotTenantAnalyticsPage scope="fleet" cityDisplayName="All cities" />);
    fireEvent.click(screen.getByLabelText('Previous month'));

    expect(mockUseFetch).toHaveBeenCalledWith(
      '/admin/pivot/analytics/acquisition',
      expect.objectContaining({
        params: { month: shiftUtcMonth(toUtcMonth(), -1) },
      }),
    );
  });
});
