import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PivotDeckReplay, {
  formatDeckWhen,
  resolveDetailReplayTiming,
  ReplayEventDetail,
} from './PivotDeckReplay';
import { resolvePivotDeckReplayLayout } from './pivotDeckReplayLayout';

const EVENT_A = {
  eventId: 'a',
  action: 'pass',
  dwellMs: 800,
  focusedAt: '2026-09-18T01:00:00.000Z',
  actedAt: '2026-09-18T01:00:00.800Z',
  event: {
    eventId: 'a',
    name: 'Night Market',
    location: 'Chinatown',
    startTime: '2026-09-18T02:00:00.000Z',
    description: 'Food stalls',
  },
};

const EVENT_B = {
  eventId: 'b',
  action: 'interested',
  dwellMs: 1200,
  focusedAt: '2026-09-18T01:00:02.000Z',
  actedAt: '2026-09-18T01:00:03.200Z',
  event: {
    eventId: 'b',
    name: 'Jazz Night',
    location: 'Mission',
    startTime: '2026-09-19T03:00:00.000Z',
  },
};

describe('formatDeckWhen', () => {
  it('formats a compact weekday clock', () => {
    const label = formatDeckWhen('2026-09-18T19:00:00-07:00');
    expect(label).toMatch(/ · /);
    expect(label).toMatch(/[ap]m$/);
  });
});

describe('resolveDetailReplayTiming', () => {
  it('holds the sheet between open and inferred close', () => {
    const timing = resolveDetailReplayTiming({
      openedDetail: true,
      openedDetailAt: 2_000,
      focusedAt: 1_000,
      actedAt: 5_000,
      dwellMs: 4000,
    });
    expect(timing.beforeOpen).toBe(1000);
    expect(timing.hold).toBeGreaterThanOrEqual(700);
    expect(timing.closeMs).toBeGreaterThan(0);
  });

  it('skips the sheet when the card never opened detail', () => {
    expect(resolveDetailReplayTiming({ openedDetail: false, dwellMs: 1200 })).toBeNull();
  });
});

describe('resolvePivotDeckReplayLayout', () => {
  it('sizes an iPhone 17 deck like PivotCardStack', () => {
    const layout = resolvePivotDeckReplayLayout();
    expect(layout.windowHeight).toBe(874);
    expect(layout.width).toBe(402);
    expect(layout.height).toBe(
      layout.progressHeight + layout.stageInsetV * 2 + layout.cardHeight,
    );
    expect(layout.cardWidth).toBe(362);
    expect(layout.cardLeft).toBe(20);
    expect(layout.heroHeight).toBe(Math.round(layout.cardHeight * 0.6));
    expect(layout.bodyHeight).toBe(layout.cardHeight - layout.heroHeight);
    expect(layout.heroHeight).toBeGreaterThan(layout.bodyHeight);
    expect(layout.cardHeight / layout.cardWidth).toBeGreaterThan(1.5);
  });
});

describe('PivotDeckReplay', () => {
  it('plays through cards in order', async () => {
    render(
      <PivotDeckReplay
        data={{
          sessions: [
            {
              index: 0,
              startedAt: EVENT_A.focusedAt,
              endedAt: EVENT_B.actedAt,
              cards: [EVENT_A, EVENT_B],
            },
          ],
        }}
      />,
    );

    expect(screen.queryByLabelText('Night Market')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
    expect(screen.getByLabelText('Night Market')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Deck replay progress' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/done/i)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Night Market')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no sessions', () => {
    render(<PivotDeckReplay data={{ sessions: [] }} />);
    expect(screen.getByText(/no deck swipe rows/i)).toBeInTheDocument();
  });

  it('renders the event details sheet', () => {
    render(
      <ReplayEventDetail
        open
        event={{ name: 'Jazz Night', location: 'Mission', description: 'Live set' }}
      />,
    );
    expect(screen.getByLabelText('Jazz Night details')).toBeInTheDocument();
  });
});
