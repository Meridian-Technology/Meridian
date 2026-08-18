import React from 'react';
import { render, screen } from '@testing-library/react';
import PivotDiscoveryConsole from './PivotDiscoveryConsole';

const mockUseFetch = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
}));

jest.mock('../../../hooks/useAdminDashboardTheme', () => ({
  __esModule: true,
  default: () => ({ isDark: false, theme: 'light', isAdmin: true }),
}));

// The orb paints to a canvas jsdom cannot rasterise, and the test only cares
// that it is asked for the brand class.
jest.mock('thinking-orbs', () => ({
  ThinkingOrb: ({ className }) => <span data-testid="orb" className={className} />,
}));

const RUN = {
  status: 'running',
  phase: 'qualifying',
  city: 'Iowa City',
  startedAt: '2026-07-17T10:00:00.000Z',
  counters: { searches: 4, qualified: 1 },
  plan: { maxOutboundCalls: 85 },
  steps: [
    {
      at: '2026-07-17T10:00:12.000Z',
      kind: 'map',
      tone: 'info',
      title: 'Mapping summerofthearts.org',
    },
    {
      at: '2026-07-17T10:01:30.000Z',
      kind: 'qualify',
      tone: 'good',
      title: 'Qualified summerofthearts.org',
      eventCount: 12,
    },
  ],
};

function renderConsole(run = RUN) {
  mockUseFetch.mockReturnValue({
    data: { success: true, data: { run } },
    error: null,
    refetch: jest.fn(),
  });
  return render(<PivotDiscoveryConsole tenantKey="ic" handleClose={() => {}} />);
}

describe('PivotDiscoveryConsole', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders each step without a per-step timestamp', () => {
    const { container } = renderConsole();

    expect(screen.getByText('Mapping summerofthearts.org')).toBeInTheDocument();
    expect(container.querySelectorAll('.pivot-discovery__step')).toHaveLength(2);
    expect(container.querySelector('.pivot-discovery__step-time')).toBeNull();
    // The elapsed clock is the one time readout the console keeps.
    expect(screen.getByText('elapsed')).toBeInTheDocument();
  });

  it('tints every orb with the brand filter', () => {
    const { container } = renderConsole();

    const orbs = screen.getAllByTestId('orb');
    expect(orbs.length).toBeGreaterThan(0);
    for (const orb of orbs) {
      expect(orb).toHaveClass('pivot-orb--brand');
    }
    expect(container.querySelector('#pivot-orb-tint')).not.toBeNull();
  });

  it('keeps tone on the step so a run can still be skimmed for outcomes', () => {
    const { container } = renderConsole();

    expect(container.querySelector('.pivot-discovery__step--good')).not.toBeNull();
  });

  it('explains skipped native hits without implying fewer search queries', () => {
    renderConsole({
      ...RUN,
      phase: 'filtering',
      counters: { ...RUN.counters, skippedNative: 2 },
      steps: [
        {
          at: '2026-07-17T10:00:08.000Z',
          kind: 'filter',
          tone: 'info',
          title: 'Skipped partiful.com',
          detail: 'Native parser — already covered before Firecrawl search',
        },
      ],
    });

    expect(
      screen.getByText(
        '2 Luma/Partiful hit(s) dropped from search results — searches still ran.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Native parser — already covered before Firecrawl search'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Dropping Luma/Partiful and known hosts from search hits — not fewer queries',
      ),
    ).toBeInTheDocument();
  });
});
