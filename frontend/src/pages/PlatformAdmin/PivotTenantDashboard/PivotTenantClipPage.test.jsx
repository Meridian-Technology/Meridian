import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PivotTenantClipPage from './PivotTenantClipPage';

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

jest.mock('./PivotTenantPage', () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
}));

const CLIP_DATA = {
  tenantKey: 'nyc',
  cityStatus: 'active',
  config: {
    deckSource: 'custom',
    cardLimit: 12,
    hidePastEvents: true,
    fallbackToWeek: true,
    curatedEventIds: ['e1', 'e2'],
  },
  limits: { cardLimitMax: 24, curatedMax: 40 },
  curated: [
    { id: 'e1', name: 'warehouse show', hostName: 'public records', state: 'live', batchWeek: '2026-W33' },
    { id: 'e2', name: 'old film', hostName: 'metrograph', state: 'ended', batchWeek: '2026-W20' },
  ],
  preview: {
    segment: 'custom',
    batchWeek: '2026-W33',
    liveWeek: '2026-W33',
    fallback: false,
    dropAt: '2026-08-13T22:00:00.000Z',
    events: [{ id: 'e1', name: 'warehouse show', hostName: 'public records' }],
  },
};

const CATALOG = {
  success: true,
  data: {
    tokens: [],
    keys: [
      { path: 'clip.packKicker', kind: 'string', params: [], shipped: 'this week' },
      { path: 'clip.retry', kind: 'string', params: [], shipped: 'try again' },
    ],
  },
};

const LAYERS = {
  success: true,
  data: {
    entries: {
      'clip.packKicker': { shipped: 'this week', platform: null, tenant: 'tonight', effective: 'tonight' },
    },
    tokens: {},
  },
};

/** Responses are built once per test so their identity is stable, like useFetch state. */
function stubFetches({ clip = CLIP_DATA, search = [] } = {}) {
  const clipResult = {
    data: { success: true, data: clip },
    loading: false,
    error: null,
    refetch: jest.fn(),
  };
  const searchResult = {
    data: { success: true, data: { events: search } },
    loading: false,
    error: null,
  };
  const catalogResult = { data: CATALOG, loading: false, error: null };
  const layersResult = { data: LAYERS, loading: false, error: null, refetch: jest.fn() };
  mockUseFetch.mockImplementation((url) => {
    if (url === '/admin/pivot/tenants/nyc/clip') return clipResult;
    if (String(url).startsWith('/admin/pivot/tenants/nyc/clip/events')) return searchResult;
    if (url === '/admin/pivot/copy/catalog') return catalogResult;
    if (url === '/admin/pivot/tenants/nyc/copy') return layersResult;
    throw new Error(`unexpected fetch ${url}`);
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PivotTenantClipPage tenantKey="nyc" cityDisplayName="New York" />
    </MemoryRouter>,
  );
}

function deckSection() {
  return screen.getByRole('region', { name: 'Deck' });
}

describe('PivotTenantClipPage', () => {
  beforeEach(() => {
    mockUseFetch.mockReset();
    mockAuthenticatedRequest.mockReset();
    mockAddNotification.mockReset();
  });

  it('shows the live deck, the clip link, and placeholder conversion', () => {
    stubFetches();
    renderPage();

    expect(screen.getByText('Pinned list', { selector: '.pivot-clip-status__title' }))
      .toBeInTheDocument();
    expect(screen.getByText(/\/clip\/nyc$/)).toBeInTheDocument();
    expect(screen.getByText('Not tracked yet')).toBeInTheDocument();
    const conversion = screen.getByRole('region', { name: 'Conversion' });
    expect(within(conversion).getAllByText('—')).toHaveLength(6);
  });

  it('lists pins with their state and saves a reordered deck', async () => {
    stubFetches();
    mockAuthenticatedRequest.mockResolvedValue({
      data: { success: true, data: { ...CLIP_DATA, curated: [...CLIP_DATA.curated].reverse() } },
    });
    renderPage();

    const deck = deckSection();
    expect(within(deck).getByText('Ended')).toBeInTheDocument();
    expect(within(deck).getByText(/1 playable/)).toBeInTheDocument();
    expect(within(deck).getByRole('button', { name: 'Save deck' })).toBeDisabled();

    fireEvent.click(within(deck).getByRole('button', { name: 'Move old film up' }));
    fireEvent.click(within(deck).getByRole('button', { name: 'Save deck' }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalled());
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith('/admin/pivot/tenants/nyc/clip', expect.objectContaining({
      method: 'PUT',
      data: {
        config: {
          deckSource: 'custom',
          cardLimit: 12,
          hidePastEvents: true,
          fallbackToWeek: true,
          curatedEventIds: ['e2', 'e1'],
        },
      },
    }));
    await waitFor(() => expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'App Clip saved' }),
    ));
  });

  it('pins a search result from another week', () => {
    stubFetches({
      search: [{ id: 'e3', name: 'rooftop set', hostName: 'dj', state: 'live', batchWeek: '2026-W41' }],
    });
    renderPage();

    const deck = deckSection();
    expect(within(deck).getByText('rooftop set')).toBeInTheDocument();
    fireEvent.click(within(deck).getByRole('button', { name: 'Pin' }));

    expect(within(deck).getByRole('button', { name: 'Pinned' })).toBeDisabled();
    expect(within(deck).getByText(/2 playable/)).toBeInTheDocument();
    expect(within(deck).getByRole('button', { name: 'Save deck' })).toBeEnabled();
  });

  it('notes kept pins while the clip plays the week', () => {
    stubFetches({ clip: { ...CLIP_DATA, config: { ...CLIP_DATA.config, deckSource: 'week' } } });
    renderPage();

    expect(screen.getByText(/the clip plays this week’s drop until you switch/)).toBeInTheDocument();
    expect(screen.getByLabelText('Skip pinned events that have ended')).toBeDisabled();
  });

  it('edits the city’s clip text through the Voice overlay', async () => {
    stubFetches();
    mockAuthenticatedRequest.mockResolvedValue({ data: { success: true, data: {} } });
    renderPage();

    expect(screen.getByLabelText('packKicker')).toHaveValue('tonight');
    expect(screen.getByText('City override')).toBeInTheDocument();

    const retry = screen.getByLabelText('retry');
    expect(retry).toHaveAttribute('placeholder', 'try again');
    fireEvent.change(retry, { target: { value: 'one more time' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save clip.retry' }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/pivot/tenants/nyc/copy',
      expect.objectContaining({ method: 'PATCH', data: { key: 'clip.retry', value: 'one more time' } }),
    ));
    await waitFor(() => expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Clip text saved' }),
    ));
  });
});
