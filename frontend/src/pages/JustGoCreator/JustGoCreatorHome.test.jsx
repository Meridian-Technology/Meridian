import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import JustGoCreatorHome from './JustGoCreatorHome';
import justGoCreatorCopy from './justGoCreatorCopy';

const mockUseFetch = jest.fn();

jest.mock('../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
}));

jest.mock('../../hooks/useAuth', () => ({
  __esModule: true,
  default: () => ({ user: { email: 'host@example.com' } }),
}));

jest.mock('../../config/tenantRedirect', () => ({
  getCurrentTenantKey: () => 'brooklyn',
  getCurrentTenantDisplayName: () => 'Brooklyn',
}));

function fetchState(overrides = {}) {
  return {
    data: null,
    loading: false,
    error: null,
    errorCode: null,
    errorStatus: null,
    refetch: jest.fn(),
    ...overrides,
  };
}

function listingsResponse(events) {
  return { success: true, data: { tenantKey: 'brooklyn', events, total: events.length } };
}

function renderHome() {
  return render(
    <MemoryRouter>
      <JustGoCreatorHome />
    </MemoryRouter>,
  );
}

const DRAFT_LISTING = {
  _id: 'evt-draft',
  name: 'Rooftop listening party',
  start_time: '2026-08-15T20:00:00.000Z',
  location: 'Bushwick',
  ingestStatus: 'draft',
  batchWeek: '2026-W33',
  intentStats: { interested: 4 },
};

const PUBLISHED_LISTING = {
  _id: 'evt-live',
  name: 'Sunday flea',
  start_time: '2026-08-16T15:00:00.000Z',
  location: 'Greenpoint',
  ingestStatus: 'published',
  batchWeek: '2026-W33',
  intentStats: { interested: 21 },
};

beforeEach(() => {
  mockUseFetch.mockReset();
});

describe('JustGoCreatorHome', () => {
  it('reads the creator listings endpoint', () => {
    mockUseFetch.mockReturnValue(fetchState({ data: listingsResponse([DRAFT_LISTING]) }));

    renderHome();

    expect(mockUseFetch).toHaveBeenCalledWith('/pivot/creator/events');
  });

  it('lists the creator’s own listings with status pills and interest counts', () => {
    mockUseFetch.mockReturnValue(
      fetchState({ data: listingsResponse([DRAFT_LISTING, PUBLISHED_LISTING]) }),
    );

    renderHome();

    // Scoped to the row list: the filter chips carry the same status words.
    const rows = within(screen.getByRole('list'));
    expect(rows.getByText('Rooftop listening party')).toBeInTheDocument();
    expect(rows.getByText('Sunday flea')).toBeInTheDocument();
    expect(rows.getByText(justGoCreatorCopy.status.draft)).toBeInTheDocument();
    expect(rows.getByText(justGoCreatorCopy.status.published)).toBeInTheDocument();
    expect(rows.getByText('4')).toBeInTheDocument();
    expect(rows.getByText('21')).toBeInTheDocument();
  });

  it('deep-links each row to the event workspace', () => {
    mockUseFetch.mockReturnValue(fetchState({ data: listingsResponse([DRAFT_LISTING]) }));

    renderHome();

    expect(
      screen.getByRole('link', {
        name: `${justGoCreatorCopy.home.openListing}: Rooftop listening party`,
      }),
    ).toHaveAttribute('href', '/justgo/creator/events/evt-draft');
  });

  it('names the drop week a listing is competing for', () => {
    mockUseFetch.mockReturnValue(fetchState({ data: listingsResponse([DRAFT_LISTING]) }));

    renderHome();

    expect(
      screen.getByText(`${justGoCreatorCopy.home.weekLabel} 2026-W33`),
    ).toBeInTheDocument();
  });

  it('sends a revoked creator to the invite-only gate instead of an error panel', () => {
    mockUseFetch.mockReturnValue(
      fetchState({
        error: 'Request failed with status code 403',
        errorCode: 'CREATOR_FORBIDDEN',
        errorStatus: 403,
      }),
    );

    renderHome();

    expect(screen.getByText(justGoCreatorCopy.gate.eyebrow)).toBeInTheDocument();
    expect(
      screen.getByText(justGoCreatorCopy.gate.forbiddenBodyWithCity('Brooklyn')),
    ).toBeInTheDocument();
    expect(screen.queryByText(justGoCreatorCopy.home.errorTitle)).not.toBeInTheDocument();
  });

  it('explains the wrong-host case distinctly from a missing grant', () => {
    mockUseFetch.mockReturnValue(
      fetchState({
        error: 'Request failed with status code 403',
        errorCode: 'NOT_PIVOT_TENANT',
        errorStatus: 403,
      }),
    );

    renderHome();

    expect(screen.getByText(justGoCreatorCopy.gate.wrongTenantBody)).toBeInTheDocument();
  });

  it('shows the flare empty state when the creator has no listings', () => {
    mockUseFetch.mockReturnValue(fetchState({ data: listingsResponse([]) }));

    renderHome();

    expect(screen.getByText(justGoCreatorCopy.home.emptyBody)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: new RegExp(justGoCreatorCopy.home.emptyCta, 'i') }),
    ).toHaveAttribute('href', '/justgo/creator/new');
  });

  it('shows a retryable error panel for a non-gate failure', () => {
    mockUseFetch.mockReturnValue(
      fetchState({ error: 'Network Error', errorStatus: 500 }),
    );

    renderHome();

    expect(screen.getByText(justGoCreatorCopy.home.errorTitle)).toBeInTheDocument();
    expect(screen.queryByText(justGoCreatorCopy.gate.eyebrow)).not.toBeInTheDocument();
  });

  it('renders filter chips with per-status counts', () => {
    mockUseFetch.mockReturnValue(
      fetchState({ data: listingsResponse([DRAFT_LISTING, PUBLISHED_LISTING]) }),
    );

    renderHome();

    const filters = screen.getByRole('group', { name: justGoCreatorCopy.filters.label });
    expect(filters).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `${justGoCreatorCopy.filters.all} 2` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `${justGoCreatorCopy.status.draft} 1` }),
    ).toBeInTheDocument();
  });
});
