import React from 'react';
import { render, screen, within } from '@testing-library/react';
import WorkspaceInsightsTab from './WorkspaceInsightsTab';
import justGoCreatorCopy from '../justGoCreatorCopy';

const copy = justGoCreatorCopy.workspace.insights;
const PARITY = justGoCreatorCopy.workspace.explainer.parity;

function daily(values) {
  return values.map(([views, interested, registered = 0], index) => ({
    date: `2026-06-${String(index + 2).padStart(2, '0')}`,
    views,
    interested,
    registered,
  }));
}

const LIVE_STATS = {
  intents: {
    interested: 30,
    registered: 10,
    passed: 5,
    externalOpens: 44,
    externalOpenUsers: 20,
  },
  analytics: { views: 80, anonymousViews: 20 },
  daily: daily([
    [5, 1],
    [12, 3],
    [40, 6, 2],
  ]),
};

const EMPTY_STATS = {
  intents: { interested: 0, registered: 0, passed: 0, externalOpens: 0, externalOpenUsers: 0 },
  analytics: { views: 0, anonymousViews: 0 },
  daily: daily([
    [0, 0],
    [0, 0],
  ]),
};

function renderTab(ingestStatus, stats) {
  return render(<WorkspaceInsightsTab event={{ ingestStatus }} stats={stats} />);
}

describe('WorkspaceInsightsTab — zero states', () => {
  it('explains to a draft that there is nothing to count yet', () => {
    renderTab('draft', EMPTY_STATS);

    expect(screen.getByText(copy.draftZeroBody)).toBeInTheDocument();
    expect(screen.queryByText(copy.funnelTitle)).not.toBeInTheDocument();
  });

  it('gives a staged listing the same pre-publish explanation', () => {
    renderTab('staged', EMPTY_STATS);

    expect(screen.getByText(copy.draftZeroBody)).toBeInTheDocument();
  });

  it('keeps the draft zero state even when stray numbers exist', () => {
    renderTab('draft', LIVE_STATS);

    expect(screen.getByText(copy.draftZeroBody)).toBeInTheDocument();
    expect(screen.queryByText(copy.funnelTitle)).not.toBeInTheDocument();
  });

  it('tells a published listing with no signal that it is waiting, not broken', () => {
    renderTab('published', EMPTY_STATS);

    expect(screen.getByText(copy.liveZeroBody)).toBeInTheDocument();
    expect(screen.queryByText(copy.draftZeroBody)).not.toBeInTheDocument();
  });

  it('carries the parity label on the zero states too', () => {
    renderTab('draft', EMPTY_STATS);

    expect(screen.getByText(PARITY)).toBeInTheDocument();
  });
});

describe('WorkspaceInsightsTab — funnel', () => {
  it('lists every step with its count', () => {
    renderTab('published', LIVE_STATS);

    const rows = screen.getAllByText(
      (_content, element) => element?.className === 'jg-funnel__row',
    );
    expect(rows).toHaveLength(4);

    expect(within(rows[0]).getByText(copy.funnelSteps.views)).toBeInTheDocument();
    expect(within(rows[0]).getByText('100')).toBeInTheDocument();
    expect(within(rows[1]).getByText('40')).toBeInTheDocument();
    expect(within(rows[2]).getByText('20')).toBeInTheDocument();
    expect(within(rows[3]).getByText('10')).toBeInTheDocument();
  });

  it('labels conversions off the previous step and not the first one', () => {
    renderTab('published', LIVE_STATS);

    const rows = screen.getAllByText(
      (_content, element) => element?.className === 'jg-funnel__row',
    );

    // 100 views → 40 interested → 20 tapped → 10 got a ticket.
    expect(within(rows[0]).queryByText(new RegExp(copy.ofPrevious))).not.toBeInTheDocument();
    expect(within(rows[1]).getByText(`40% ${copy.ofPrevious}`)).toBeInTheDocument();
    expect(within(rows[2]).getByText(`50% ${copy.ofPrevious}`)).toBeInTheDocument();
    expect(within(rows[3]).getByText(`50% ${copy.ofPrevious}`)).toBeInTheDocument();
  });

  it('says plainly that views and interest are not the same crowd', () => {
    renderTab('published', LIVE_STATS);

    expect(screen.getByText(copy.funnelNote)).toBeInTheDocument();
  });

  it('invents no ticket-sales or revenue metric', () => {
    renderTab('published', LIVE_STATS);

    expect(screen.queryByText(/revenue|sold|payout|earnings/i)).not.toBeInTheDocument();
  });
});

describe('WorkspaceInsightsTab — trend chart', () => {
  // Path geometry itself is asserted in insightsUtils.test.js; this covers the rendered wiring.
  it('draws both series as one described image', () => {
    renderTab('published', LIVE_STATS);

    expect(screen.getByRole('img', { name: copy.chartAlt })).toBeInTheDocument();
    expect(screen.getByText(copy.chartViews)).toBeInTheDocument();
    expect(screen.getByText(copy.chartInterest)).toBeInTheDocument();
  });

  it('labels each series with its own total and peak', () => {
    renderTab('published', LIVE_STATS);

    expect(screen.getByText(copy.chartViews)).toBeInTheDocument();
    expect(
      screen.getByText(`${copy.chartTotal(57)} · ${copy.chartPeak(40)}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`${copy.chartTotal(12)} · ${copy.chartPeak(8)}`),
    ).toBeInTheDocument();
  });

  it('warns that the two series use independent scales', () => {
    renderTab('published', LIVE_STATS);

    expect(screen.getByText(copy.chartScaleNote)).toBeInTheDocument();
  });

  it('says the trend is empty rather than drawing a flat lie', () => {
    renderTab('published', {
      ...LIVE_STATS,
      daily: daily([
        [0, 0],
        [0, 0],
      ]),
    });

    expect(screen.getByText(copy.chartEmpty)).toBeInTheDocument();
  });

  it('survives a detail response with no daily series at all', () => {
    renderTab('published', { ...LIVE_STATS, daily: undefined });

    expect(screen.getByText(copy.chartEmpty)).toBeInTheDocument();
    expect(screen.getByText(copy.funnelTitle)).toBeInTheDocument();
  });
});
