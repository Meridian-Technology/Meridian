import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import PivotTenantAudiencePage from './PivotTenantAudiencePage';

const mockUseFetch = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
  authenticatedRequest: jest.fn(),
}));

jest.mock('../../../NotificationContext', () => ({
  useNotification: () => ({ addNotification: jest.fn() }),
}));

jest.mock('../../../components/Interface/KeybindTooltip/KeybindTooltip', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./PivotTenantPage', () => ({
  __esModule: true,
  default: ({ title, children, actions }) => (
    <div>
      <h1>{title}</h1>
      <div data-testid="page-actions">{actions}</div>
      {children}
    </div>
  ),
}));

jest.mock('./PivotBatchWeekPicker', () => ({
  __esModule: true,
  default: ({ batchWeek }) => <span data-testid="week-picker">{batchWeek}</span>,
}));

jest.mock('../../../components/PivotOps/PivotOpsAreaFunnel', () => ({
  __esModule: true,
  default: () => <div data-testid="area-funnel" />,
}));

jest.mock('./PivotDeckReplay', () => ({
  __esModule: true,
  default: ({ data }) => <div data-testid="deck-replay">{data?.user?.userId || 'no-replay'}</div>,
}));

// Popup imports @iconify-icon as untransformed ESM; the rules form is covered by
// pivotDeckConfigUtils tests.
jest.mock('./PivotDeckRulesPanel', () => ({
  __esModule: true,
  default: ({ tenantKey, storedOverrides }) => (
    <div data-testid="deck-rules">
      {tenantKey}:{JSON.stringify(storedOverrides)}
    </div>
  ),
}));

const WEEK = '2026-W36';

function ok(data) {
  return { data: { success: true, data }, loading: false, error: null, refetch: jest.fn() };
}

const EMPTY = { data: null, loading: false, error: null, refetch: jest.fn() };

function fetchFor(url) {
  if (!url) return EMPTY;
  if (url.endsWith('/ops')) {
    return ok({
      anchors: { liveWeek: WEEK },
      journey: { kpis: { activeUsers: 42 }, conversionRates: {} },
      funnel: { intentFunnel: [], steps: [] },
    });
  }
  if (url.endsWith('/journeys/users')) {
    return ok({ mode: 'active', users: [{ userId: 'u1', name: 'Ada', intentCount: 3 }] });
  }
  if (url.endsWith('/history')) {
    return ok({
      user: { name: 'Ada' },
      intents: [{ eventId: 'event-000001', eventName: 'Jazz night', status: 'interested' }],
      analytics: [],
    });
  }
  if (url.endsWith('/deck-replay')) {
    return ok({ user: { userId: 'u1' }, batchWeek: WEEK, sessions: [] });
  }
  if (url.endsWith('/drop-deck/preview')) {
    return ok({
      batchWeek: '2026-W37',
      frozen: false,
      user: { interestTags: ['jazz'] },
      events: [{ _id: 'e1', name: 'Ranked jazz', dropDeckScore: { total: 1.4 } }],
    });
  }
  return EMPTY;
}

function LocationProbe() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

function renderAudience(query = `page=2&batchWeek=${WEEK}`) {
  return render(
    <MemoryRouter initialEntries={[`/platform-admin/pivot/nyc?${query}`]}>
      <PivotTenantAudiencePage
        tenantKey="nyc"
        cityDisplayName="New York"
        storedDeckOverrides={{ softMax: 12 }}
        onDeckSaved={jest.fn()}
      />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function requestedUrls() {
  return mockUseFetch.mock.calls.map(([url]) => url).filter(Boolean);
}

function lastCallFor(suffix) {
  const calls = mockUseFetch.mock.calls.filter(([url]) => url?.endsWith(suffix));
  return calls[calls.length - 1];
}

describe('PivotTenantAudiencePage', () => {
  beforeEach(() => {
    mockUseFetch.mockReset();
    mockUseFetch.mockImplementation((url) => fetchFor(url));
  });

  it('opens on the week journey and switches to the user inspector', () => {
    renderAudience();

    expect(screen.getByRole('heading', { name: 'Audience' })).toBeInTheDocument();
    expect(screen.getByText('Week snapshot')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.queryByText('User inspector')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Users' }));

    expect(screen.getByText('User inspector')).toBeInTheDocument();
    expect(screen.queryByText('Week snapshot')).toBeNull();
    expect(screen.getByTestId('search')).toHaveTextContent('audience=users');
  });

  it('opens a former User journeys link on that user’s replay', () => {
    renderAudience(`page=2&batchWeek=${WEEK}&userId=u1`);

    expect(screen.getByRole('tab', { name: 'Users' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Replay' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('deck-replay')).toHaveTextContent('u1');
    expect(requestedUrls().some((url) => url.endsWith('/drop-deck/preview'))).toBe(false);
  });

  it('shows the scored deck for the selected user and pins it to the page week', () => {
    renderAudience(`page=2&batchWeek=${WEEK}&audience=users&userId=u1`);

    fireEvent.click(screen.getByRole('tab', { name: 'Ranking' }));

    expect(screen.getByTestId('search')).toHaveTextContent('userPane=ranking');
    expect(screen.getByText('Ranked jazz')).toBeInTheDocument();
    expect(screen.getByText('1.40')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'App week · 2026-W37' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(lastCallFor('/drop-deck/preview')[1].params).toEqual({ userId: 'u1' });

    fireEvent.click(screen.getByRole('button', { name: WEEK }));

    expect(screen.getByTestId('search')).toHaveTextContent('deckWeek=page');
    expect(lastCallFor('/drop-deck/preview')[1].params).toEqual({
      userId: 'u1',
      batchWeek: WEEK,
    });
  });

  it('lists the week’s intents under Activity', () => {
    renderAudience(`page=2&batchWeek=${WEEK}&audience=users&userId=u1&userPane=activity`);

    expect(screen.getByRole('tab', { name: 'Activity · 1' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Jazz night')).toBeInTheDocument();
    expect(screen.queryByTestId('deck-replay')).toBeNull();
  });

  it('selects a user from the active list', () => {
    renderAudience(`page=2&batchWeek=${WEEK}&audience=users`);

    fireEvent.click(screen.getByRole('option', { name: /Ada/ }));

    expect(screen.getByTestId('search')).toHaveTextContent('userId=u1');
    expect(screen.getByTestId('deck-replay')).toBeInTheDocument();
  });

  it('shows deck rules without the week controls or week data', () => {
    renderAudience(`page=2&batchWeek=${WEEK}&audience=rules`);

    expect(screen.getByTestId('deck-rules')).toHaveTextContent('nyc:{"softMax":12}');
    expect(screen.queryByTestId('week-picker')).toBeNull();
    expect(screen.queryByRole('button', { name: /Refresh/ })).toBeNull();
    expect(requestedUrls().some((url) => url.endsWith('/ops'))).toBe(false);
  });
});
