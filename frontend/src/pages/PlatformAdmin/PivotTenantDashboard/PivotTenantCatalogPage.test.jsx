import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PivotTenantCatalogPage, {
  PIVOT_TENANT_CATALOG_PAGE,
  catalogCurationHref,
} from './PivotTenantCatalogPage';
import postRequest from '../../../utils/postRequest';

const mockUseFetch = jest.fn();
const mockAddNotification = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
}));

jest.mock('../../../NotificationContext', () => ({
  useNotification: () => ({ addNotification: mockAddNotification }),
}));

jest.mock('../../../utils/postRequest', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('./PivotTenantPage', () => ({
  __esModule: true,
  default: ({ title, tenantKey, cityDisplayName, children, className }) => (
    <div data-testid="pivot-tenant-page" className={className}>
      <h1>{title}</h1>
      <p data-testid="catalog-city">{cityDisplayName}</p>
      <p data-testid="catalog-tenant">{tenantKey}</p>
      {children}
    </div>
  ),
}));

function renderCatalog(fetchValue, { path = '/platform-admin/pivot/nyc?page=4' } = {}) {
  mockUseFetch.mockReturnValue({
    data: null,
    loading: false,
    error: null,
    refetch: jest.fn(),
    ...fetchValue,
  });

  return render(
    <MemoryRouter initialEntries={[path]}>
      <PivotTenantCatalogPage tenantKey="nyc" cityDisplayName="New York" />
    </MemoryRouter>,
  );
}

describe('PivotTenantCatalogPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
    postRequest.mockReset();
  });

  it('is locked to tenant-shell page 4', () => {
    expect(PIVOT_TENANT_CATALOG_PAGE).toBe(4);
  });

  it('shows a weekless empty state for an empty city', () => {
    const { container } = renderCatalog({
      data: {
        success: true,
        data: {
          organizers: [],
          total: 0,
          limit: 100,
          offset: 0,
          sort: 'events',
          audience: 'detail-only',
        },
      },
    });

    expect(screen.getByRole('heading', { name: 'Catalog' })).toBeInTheDocument();
    expect(screen.getByTestId('catalog-city')).toHaveTextContent('New York');
    expect(screen.getByText(/not filtered by batch week/i)).toBeInTheDocument();
    expect(container.querySelector('.pivot-batch-week-picker')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('lists organizers across weeks and is not a Curation queue', () => {
    renderCatalog({
      data: {
        success: true,
        data: {
          organizers: [
            {
              id: 'org-1',
              canonicalName: 'Alice Chen',
              aliases: ['Alice'],
              providers: ['partiful'],
              eventCount: 4,
              weeksActive: ['2026-W33', '2026-W28'],
              claimStatus: 'unclaimed',
              imageUrl: null,
            },
          ],
          total: 1,
          limit: 100,
          offset: 0,
          sort: 'events',
          audience: 'detail-only',
        },
      },
    });

    expect(screen.getByRole('button', { name: 'Alice Chen' })).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('Partiful');
    expect(screen.getByRole('table')).toHaveTextContent('4');
    expect(screen.getByRole('table')).toHaveTextContent('2');
    expect(screen.getByText('unclaimed')).toBeInTheDocument();
    expect(screen.queryByText(/review queue/i)).toBeNull();
    expect(mockUseFetch).toHaveBeenCalledWith(
      '/admin/pivot/tenants/nyc/organizers',
      expect.objectContaining({
        params: expect.objectContaining({
          sort: 'events',
          limit: 100,
          offset: 0,
        }),
      }),
    );
    const fetchOptions = mockUseFetch.mock.calls[0][1];
    expect(fetchOptions.params.batchWeek).toBeUndefined();
  });

  it('renders search, claim, and source filters', () => {
    renderCatalog({
      data: { success: true, data: { organizers: [], total: 0 } },
    });

    expect(screen.getByPlaceholderText('Name or alias')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unclaimed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Partiful' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sort')).toHaveValue('events');
    expect(screen.getByRole('button', { name: 'Backfill' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Organizers' })).toBeInTheDocument();
  });

  it('builds a Curation deep-link with week and event id', () => {
    expect(
      catalogCurationHref('nyc', {
        id: 'evt-1',
        batchWeek: '2026-W33',
      }),
    ).toBe('/platform-admin/pivot/nyc?page=1&batchWeek=2026-W33&eventId=evt-1');
  });

  it('shows multi-week events and audience on the dossier', () => {
    mockUseFetch.mockImplementation((url) => {
      const isDetail = typeof url === 'string' && /\/organizers\/org-1$/.test(url);
      return {
        data: isDetail
          ? {
              success: true,
              data: {
                organizer: {
                  id: 'org-1',
                  canonicalName: 'Alice Chen',
                  claimStatus: 'unclaimed',
                  providers: ['partiful'],
                  identities: [
                    {
                      provider: 'partiful',
                      name: 'Alice Chen',
                      profileUrl: 'https://partiful.com/u/alice',
                    },
                  ],
                },
                events: [
                  {
                    id: 'evt-aug',
                    name: 'August set',
                    batchWeek: '2026-W33',
                    ingestStatus: 'published',
                    source: 'partiful',
                    start: '2026-08-12T20:00:00.000Z',
                    intentStats: { interested: 1, registered: 1, passed: 0 },
                  },
                  {
                    id: 'evt-jun',
                    name: 'June set',
                    batchWeek: '2026-W28',
                    ingestStatus: 'published',
                    source: 'partiful',
                    start: '2026-07-08T20:00:00.000Z',
                    intentStats: { interested: 1, registered: 0, passed: 1 },
                  },
                ],
                audience: {
                  interested: 2,
                  registered: 1,
                  passed: 1,
                  externalOpens: 3,
                  repeatUsers: 1,
                },
              },
            }
          : null,
        loading: false,
        error: null,
        refetch: jest.fn(),
      };
    });

    render(
      <MemoryRouter initialEntries={['/platform-admin/pivot/nyc?page=4&organizerId=org-1']}>
        <PivotTenantCatalogPage tenantKey="nyc" cityDisplayName="New York" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Alice Chen' })).toBeInTheDocument();
    expect(screen.getByText('2026-W33')).toBeInTheDocument();
    expect(screen.getByText('2026-W28')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'August set' })).toHaveAttribute(
      'href',
      '/platform-admin/pivot/nyc?page=1&batchWeek=2026-W33&eventId=evt-aug',
    );
    expect(screen.getByRole('link', { name: 'June set' })).toHaveAttribute(
      'href',
      '/platform-admin/pivot/nyc?page=1&batchWeek=2026-W28&eventId=evt-jun',
    );
    expect(screen.getByText('Interested').closest('.pivot-ops-metric')).toHaveTextContent('2');
    expect(screen.getByText('Repeat users').closest('.pivot-ops-metric')).toHaveTextContent('1');
    expect(screen.queryByPlaceholderText('Name or alias')).toBeNull();
    expect(mockUseFetch).toHaveBeenCalledWith(
      '/admin/pivot/tenants/nyc/organizers/org-1',
      expect.anything(),
    );
  });

  it('shows unlinked leftovers and last-run ambiguous names', () => {
    mockUseFetch.mockImplementation((url) => {
      const isUnlinked = typeof url === 'string' && /\/organizers\/unlinked$/.test(url);
      return {
        data: {
          success: true,
          data: isUnlinked
            ? {
                events: [
                  {
                    id: 'evt-soup',
                    name: 'Soup night',
                    hostName: 'Alice & Bob',
                    batchWeek: '2026-W30',
                    source: 'partiful',
                    kind: 'leftover',
                  },
                ],
                total: 1,
                leftover: 1,
                ambiguous: 1,
                proposals: [
                  {
                    a: { organizerId: 'org-a', canonicalName: 'Alice Chen' },
                    b: { organizerId: 'org-b', canonicalName: 'Alice C' },
                    reasons: ['name-similarity', 'shared-venue'],
                    score: 0.81,
                  },
                ],
                lastBackfill: {
                  ranAt: '2026-08-15T12:00:00.000Z',
                  linked: 6,
                  ambiguous: 1,
                  unlinked: 2,
                  ambiguousNames: ['The Chapel'],
                },
              }
            : { organizers: [], total: 0 },
        },
        loading: false,
        error: null,
        refetch: jest.fn(),
      };
    });

    render(
      <MemoryRouter initialEntries={['/platform-admin/pivot/nyc?page=4&filter=unlinked']}>
        <PivotTenantCatalogPage tenantKey="nyc" cityDisplayName="New York" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Unlinked events' })).toBeInTheDocument();
    expect(screen.getByText('Alice & Bob')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Soup night' })).toHaveAttribute(
      'href',
      '/platform-admin/pivot/nyc?page=1&batchWeek=2026-W30&eventId=evt-soup',
    );
    expect(screen.getByText('leftover')).toBeInTheDocument();
    expect(screen.getByText(/6 linked · 1 ambiguous · 2 unlinked/)).toBeInTheDocument();
    expect(screen.getByText(/Ambiguous names: The Chapel/)).toBeInTheDocument();
    expect(screen.getByText(/Alice Chen → Alice C/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlinked (2)' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Name or alias')).toBeNull();
    expect(screen.queryByText(/firecrawl/i)).toBeNull();
    expect(screen.queryByText(/recrawl/i)).toBeNull();
    expect(mockUseFetch).toHaveBeenCalledWith(
      '/admin/pivot/tenants/nyc/organizers/unlinked',
      expect.objectContaining({
        params: expect.objectContaining({ limit: 100, offset: 0 }),
      }),
    );
    const unlinkedCall = mockUseFetch.mock.calls.find(
      ([path]) => path === '/admin/pivot/tenants/nyc/organizers/unlinked',
    );
    expect(unlinkedCall[1].params.kind).toBeUndefined();
  });

  it('requests kind=ambiguous for the ambiguous catalog view', () => {
    mockUseFetch.mockImplementation((url) => ({
      data: {
        success: true,
        data:
          typeof url === 'string' && /\/unlinked$/.test(url)
            ? { events: [], total: 0, leftover: 0, ambiguous: 2 }
            : { organizers: [], total: 0 },
      },
      loading: false,
      error: null,
      refetch: jest.fn(),
    }));

    render(
      <MemoryRouter initialEntries={['/platform-admin/pivot/nyc?page=4&filter=ambiguous']}>
        <PivotTenantCatalogPage tenantKey="nyc" cityDisplayName="New York" />
      </MemoryRouter>,
    );

    expect(mockUseFetch).toHaveBeenCalledWith(
      '/admin/pivot/tenants/nyc/organizers/unlinked',
      expect.objectContaining({
        params: expect.objectContaining({ kind: 'ambiguous' }),
      }),
    );
    expect(screen.getByRole('heading', { name: 'Ambiguous hosts' })).toBeInTheDocument();
  });

  it('posts backfill and surfaces the error when the run fails', async () => {
    const refetchList = jest.fn();
    const refetchUnlinked = jest.fn();
    mockUseFetch.mockImplementation((url) => ({
      data: { success: true, data: { organizers: [], total: 0, events: [] } },
      loading: false,
      error: null,
      refetch: typeof url === 'string' && /\/unlinked$/.test(url) ? refetchUnlinked : refetchList,
    }));
    postRequest.mockResolvedValue({ error: 'Backfill exploded' });

    render(
      <MemoryRouter initialEntries={['/platform-admin/pivot/nyc?page=4']}>
        <PivotTenantCatalogPage tenantKey="nyc" cityDisplayName="New York" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Backfill' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Backfill exploded');
    });
    expect(postRequest).toHaveBeenCalledWith(
      '/admin/pivot/tenants/nyc/organizers/backfill',
      { force: false },
    );
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Backfill failed', type: 'error' }),
    );
    expect(refetchList).not.toHaveBeenCalled();
  });

  it('merges the selected source into the target and refetches', async () => {
    const refetchList = jest.fn();
    mockUseFetch.mockImplementation((url) => ({
      data: {
        success: true,
        data:
          typeof url === 'string' && /\/unlinked$/.test(url)
            ? { events: [], total: 0, leftover: 0, ambiguous: 0, proposals: [] }
            : {
                organizers: [
                  { id: 'org-a', canonicalName: 'Alice Chen', aliases: [], providers: [], eventCount: 1, weeksActive: [], claimStatus: 'unclaimed' },
                  { id: 'org-b', canonicalName: 'Alice C', aliases: [], providers: [], eventCount: 2, weeksActive: [], claimStatus: 'unclaimed' },
                ],
                total: 2,
              },
      },
      loading: false,
      error: null,
      refetch: refetchList,
    }));
    postRequest.mockResolvedValue({ success: true, data: { eventsRewritten: 3 } });
    window.confirm = jest.fn(() => true);

    render(
      <MemoryRouter initialEntries={['/platform-admin/pivot/nyc?page=4']}>
        <PivotTenantCatalogPage tenantKey="nyc" cityDisplayName="New York" />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Source (retired)'), { target: { value: 'org-a' } });
    fireEvent.change(screen.getByLabelText('Target (kept)'), { target: { value: 'org-b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));

    await waitFor(() => {
      expect(postRequest).toHaveBeenCalledWith(
        '/admin/pivot/tenants/nyc/organizers/org-b/merge',
        { sourceOrganizerId: 'org-a' },
      );
      expect(refetchList).toHaveBeenCalled();
    });
    expect(window.confirm).toHaveBeenCalled();
  });

  it('collapses same-name nights into showtimes from the dossier', async () => {
    const refetchDetail = jest.fn();
    mockUseFetch.mockImplementation((url) => {
      const isDetail = typeof url === 'string' && /\/organizers\/org-1$/.test(url);
      return {
        data: isDetail
          ? {
              success: true,
              data: {
                organizer: {
                  id: 'org-1',
                  canonicalName: "Cobb's Comedy Club",
                  claimStatus: 'unclaimed',
                  providers: ['generic-site'],
                  identities: [],
                },
                events: [
                  {
                    id: 'evt-1',
                    name: 'Derrick Stroup',
                    batchWeek: '2026-W35',
                    ingestStatus: 'staged',
                    source: 'generic-site',
                    start: '2026-08-29T02:00:00.000Z',
                    intentStats: { interested: 0 },
                  },
                  {
                    id: 'evt-2',
                    name: 'Derrick Stroup',
                    batchWeek: '2026-W35',
                    ingestStatus: 'staged',
                    source: 'generic-site',
                    start: '2026-08-28T02:30:00.000Z',
                    intentStats: { interested: 0 },
                  },
                  {
                    id: 'evt-3',
                    name: 'Molly Kearney',
                    batchWeek: '2026-W35',
                    ingestStatus: 'staged',
                    source: 'generic-site',
                    start: '2026-08-24T02:30:00.000Z',
                    intentStats: { interested: 0 },
                  },
                ],
                audience: { interested: 0, registered: 0, passed: 0, externalOpens: 0, repeatUsers: 0 },
              },
            }
          : null,
        loading: false,
        error: null,
        refetch: refetchDetail,
      };
    });
    postRequest.mockResolvedValue({
      success: true,
      data: { event: { name: 'Derrick Stroup' }, showtimeCount: 2, collapsedCount: 1 },
    });
    window.confirm = jest.fn(() => true);

    render(
      <MemoryRouter initialEntries={['/platform-admin/pivot/nyc?page=4&organizerId=org-1']}>
        <PivotTenantCatalogPage tenantKey="nyc" cityDisplayName="New York" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Collapse 2 nights' }));

    await waitFor(() => {
      expect(postRequest).toHaveBeenCalledWith('/admin/pivot/ingest/collapse-showtimes', {
        tenantKey: 'nyc',
        eventIds: ['evt-1', 'evt-2'],
      });
      expect(refetchDetail).toHaveBeenCalled();
    });
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Collapsed into showtimes', type: 'success' }),
    );
  });
});
