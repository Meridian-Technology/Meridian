import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import JustGoCreatorEventWorkspace from './JustGoCreatorEventWorkspace';
import justGoCreatorCopy from './justGoCreatorCopy';

const mockUseFetch = jest.fn();

jest.mock('../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
}));

jest.mock('../../hooks/useAuth', () => ({
  __esModule: true,
  default: () => ({ user: { email: 'host@example.com' } }),
}));

// The edit form is covered by its own suite; stub it so this test is about the shell.
jest.mock('./JustGoCreatorListingForm', () => ({
  __esModule: true,
  default: () => <div data-testid="listing-form" />,
}));

// qrcode.react draws to a real canvas, which jsdom does not implement.
jest.mock('qrcode.react', () => ({
  QRCodeCanvas: ({ value }) => <div data-testid="qr" data-value={value} />,
}));

const copy = justGoCreatorCopy.workspace;

const PUBLISHED_FUTURE = {
  _id: 'evt-9',
  name: 'Rooftop listening party',
  description: 'Bring a friend.',
  location: 'Bushwick',
  start_time: '2099-06-20T19:00:00.000Z',
  end_time: '2099-06-20T22:00:00.000Z',
  ingestStatus: 'published',
  batchWeek: '2099-W25',
  host: { name: 'Night Shift' },
  tags: ['live-music'],
  externalLink: 'https://tickets.example.com',
};

const STATS = {
  intents: {
    interested: 12,
    registered: 3,
    passed: 4,
    externalOpens: 7,
    externalOpenUsers: 5,
  },
  analytics: { views: 40, uniqueViews: 31 },
};

function mockDetail(event, stats = STATS, overrides = {}) {
  mockUseFetch.mockReturnValue({
    data: { success: true, data: { tenantKey: 'brooklyn', event, stats } },
    loading: false,
    error: null,
    errorCode: null,
    errorStatus: null,
    refetch: jest.fn(),
    ...overrides,
  });
}

let container = null;

function renderWorkspace() {
  const view = render(
    <MemoryRouter initialEntries={['/justgo/creator/events/evt-9']}>
      <Routes>
        <Route
          path="/justgo/creator/events/:eventId"
          element={<JustGoCreatorEventWorkspace />}
        />
      </Routes>
    </MemoryRouter>,
  );
  container = view.container;
  return view;
}

/**
 * Panels are keep-alive like the ported dashboard, so every tab is in the DOM at once. Scope to the
 * visible one or an assertion will pass on a hidden tab.
 */
function activePanel() {
  return container.querySelector('.jg-workspace__tab-panel.is-active');
}

function nav() {
  return within(screen.getByRole('navigation', { name: copy.navLabel }));
}

function header() {
  return within(screen.getByRole('banner'));
}

beforeEach(() => {
  mockUseFetch.mockReset();
});

describe('JustGoCreatorEventWorkspace — skeleton', () => {
  it('renders the header, phase rail, and section nav', () => {
    mockDetail(PUBLISHED_FUTURE);
    renderWorkspace();

    expect(screen.getByRole('heading', { name: 'Rooftop listening party' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: copy.railLabel })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: copy.navLabel })).toBeInTheDocument();
  });

  it('names the drop week in the masthead', () => {
    mockDetail(PUBLISHED_FUTURE);
    renderWorkspace();

    expect(header().getByText(PUBLISHED_FUTURE.batchWeek)).toBeInTheDocument();
  });

  it('says so when ops have not assigned a drop week', () => {
    mockDetail({ ...PUBLISHED_FUTURE, batchWeek: null });
    renderWorkspace();

    expect(header().getByText(copy.header.weekNone)).toBeInTheDocument();
  });

  it('marks the derived phase as the current rail step', () => {
    mockDetail(PUBLISHED_FUTURE);
    renderWorkspace();

    const current = screen.getByRole('listitem', { current: 'step' });

    expect(current).toHaveTextContent(copy.phases.planning);
  });

  it('shows Drafting as current for a draft, and hides Promo and Communications', () => {
    mockDetail({ ...PUBLISHED_FUTURE, ingestStatus: 'draft' });
    renderWorkspace();

    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent(
      copy.phases.drafting,
    );
    expect(nav().queryByRole('button', { name: copy.tabs.promo })).not.toBeInTheDocument();
    expect(
      nav().queryByRole('button', { name: copy.tabs.communications }),
    ).not.toBeInTheDocument();
    expect(nav().getByRole('button', { name: copy.tabs.overview })).toBeInTheDocument();
  });

  it('shows Post Mortem as current once the event has ended', () => {
    mockDetail({
      ...PUBLISHED_FUTURE,
      start_time: '2020-06-20T19:00:00.000Z',
      end_time: '2020-06-20T22:00:00.000Z',
    });
    renderWorkspace();

    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent(
      copy.phases.postMortem,
    );
  });

  it('opens on Overview with the hero numbers from the detail stats', () => {
    mockDetail(PUBLISHED_FUTURE);
    renderWorkspace();

    expect(nav().getByRole('button', { name: copy.tabs.overview })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const overview = within(activePanel());
    expect(overview.getByText(copy.overview.numbersTitle)).toBeInTheDocument();
    expect(overview.getByText('12')).toBeInTheDocument();
    expect(overview.getByText('40')).toBeInTheDocument();
    expect(header().getByText('12')).toBeInTheDocument();
  });

  it('switches tabs from the sidebar', () => {
    mockDetail(PUBLISHED_FUTURE);
    renderWorkspace();

    fireEvent.click(nav().getByRole('button', { name: copy.tabs.interests }));

    expect(nav().getByRole('button', { name: copy.tabs.interests })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(activePanel()).getByText(copy.interests.perPersonNote)).toBeInTheDocument();
  });

  it('sends the header CTA to the edit form', () => {
    mockDetail(PUBLISHED_FUTURE);
    renderWorkspace();

    fireEvent.click(header().getByRole('button', { name: copy.header.updateListing }));

    expect(nav().getByRole('button', { name: copy.tabs.details })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(activePanel()).getByTestId('listing-form')).toBeInTheDocument();
  });

  it('offers no publish or delete action', () => {
    mockDetail(PUBLISHED_FUTURE);
    renderWorkspace();

    expect(screen.queryByRole('button', { name: /publish/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel event/i })).not.toBeInTheDocument();
  });
});

describe('JustGoCreatorEventWorkspace — tabs', () => {
  it('encodes the public listing page in the promo QR', () => {
    mockDetail(PUBLISHED_FUTURE);
    renderWorkspace();

    fireEvent.click(nav().getByRole('button', { name: copy.tabs.promo }));

    const promo = within(activePanel());
    expect(promo.getByTestId('qr')).toHaveAttribute(
      'data-value',
      `${window.location.origin}/event/evt-9`,
    );
    expect(promo.getByText(copy.promo.liveNote)).toBeInTheDocument();
  });

  it('warns that a staged listing is not in the app yet', () => {
    mockDetail({ ...PUBLISHED_FUTURE, ingestStatus: 'staged' });
    renderWorkspace();

    fireEvent.click(nav().getByRole('button', { name: copy.tabs.promo }));

    expect(within(activePanel()).getByText(copy.promo.notLiveNote)).toBeInTheDocument();
  });

  it('states the parity expectation on the curation explainer', () => {
    mockDetail(PUBLISHED_FUTURE);
    renderWorkspace();

    expect(within(activePanel()).getByText(copy.explainer.parity)).toBeInTheDocument();
  });

  it('renders the insights funnel from the detail stats', () => {
    mockDetail(PUBLISHED_FUTURE, {
      ...STATS,
      daily: [
        { date: '2026-06-14', views: 5, interested: 1, registered: 0 },
        { date: '2026-06-15', views: 9, interested: 2, registered: 1 },
      ],
    });
    renderWorkspace();

    fireEvent.click(nav().getByRole('button', { name: copy.tabs.insights }));

    const insights = within(activePanel());
    expect(insights.getByText(copy.insights.funnelTitle)).toBeInTheDocument();
    expect(insights.getByText(copy.insights.funnelSteps.registered)).toBeInTheDocument();
    expect(insights.getByRole('img', { name: copy.insights.chartAlt })).toBeInTheDocument();
  });

  it('keeps Communications an honest stub', () => {
    mockDetail(PUBLISHED_FUTURE);
    renderWorkspace();

    fireEvent.click(nav().getByRole('button', { name: copy.tabs.communications }));

    expect(within(activePanel()).getByText(copy.comingSoon.communicationsBody)).toBeInTheDocument();
  });

  it('shows an empty interests state before any signal arrives', () => {
    mockDetail(PUBLISHED_FUTURE, {
      intents: { interested: 0, registered: 0, passed: 0, externalOpens: 0, externalOpenUsers: 0 },
      analytics: { views: 0 },
    });
    renderWorkspace();

    fireEvent.click(nav().getByRole('button', { name: copy.tabs.interests }));

    expect(within(activePanel()).getByText(copy.interests.emptyTitle)).toBeInTheDocument();
  });
});

describe('JustGoCreatorEventWorkspace — failure states', () => {
  it('renders the invite gate on a creator-scope 403', () => {
    mockUseFetch.mockReturnValue({
      data: null,
      loading: false,
      error: 'Forbidden',
      errorCode: 'CREATOR_FORBIDDEN',
      errorStatus: 403,
      refetch: jest.fn(),
    });
    renderWorkspace();

    expect(screen.queryByRole('navigation', { name: copy.navLabel })).not.toBeInTheDocument();
    expect(screen.getByText(justGoCreatorCopy.gate.forbiddenBody)).toBeInTheDocument();
  });

  it('treats a not-owner 403 as a missing listing rather than a gate', () => {
    mockUseFetch.mockReturnValue({
      data: null,
      loading: false,
      error: 'You can only manage your own Just Go listings.',
      errorCode: 'CREATOR_NOT_OWNER',
      errorStatus: 403,
      refetch: jest.fn(),
    });
    renderWorkspace();

    expect(screen.getByText(copy.notFoundTitle)).toBeInTheDocument();
  });

  it('offers a retry on an unexpected failure', () => {
    const refetch = jest.fn();
    mockUseFetch.mockReturnValue({
      data: null,
      loading: false,
      error: 'boom',
      errorCode: null,
      errorStatus: 500,
      refetch,
    });
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: copy.errorRetry }));

    expect(refetch).toHaveBeenCalled();
  });
});
