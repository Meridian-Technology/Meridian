import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PivotTenantDashboard from './PivotTenantDashboard';

const mockUseFetch = jest.fn();
let mockLocationMigrationEnabled = true;
let mockDesignReviewEnabled = false;

jest.mock('./creativeStudioAccess', () => ({
  get DESIGN_REVIEW_ENABLED() {
    return mockDesignReviewEnabled;
  },
}));

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
}));

jest.mock('../../../hooks/useAdminDashboardTheme', () => ({
  __esModule: true,
  default: () => ({ isDark: false }),
}));

jest.mock('../../../components/Dashboard/Dashboard', () => {
  const { useSearchParams } = require('react-router-dom');
  const MockDashboard = ({ menuItems, defaultPage = 0 }) => {
    const [searchParams] = useSearchParams();
    const parsed = parseInt(searchParams.get('page') || String(defaultPage), 10);
    const page = Number.isFinite(parsed) ? parsed : defaultPage;
    const active = menuItems[page] || menuItems[defaultPage];
    return (
      <nav data-testid="tenant-dash-shell">
        {menuItems
          .map((item, index) => ({ item, index }))
          .sort((a, b) => (a.item.navOrder ?? a.index) - (b.item.navOrder ?? b.index))
          .map(({ item, index }) => item.hideFromNav ? null : (
          <div
            key={item.label}
            data-testid={`menu-${index}`}
            data-icon={item.icon}
            data-selected={page === index || active?.navParentIndex === index ? 'true' : 'false'}
          >
            <span>{item.label}</span>
          </div>
        ))}
        <span data-testid="current-page">{searchParams.get('page') || '0'}</span>
        <span data-testid="current-batch-week">{searchParams.get('batchWeek') || ''}</span>
        {active?.element}
      </nav>
    );
  };
  return {
    __esModule: true,
    default: MockDashboard,
  };
});

jest.mock('./PivotTenantOverviewPage', () => () => <div>overview-page</div>);
jest.mock('./PivotTenantCurationPage', () => ({ view, title }) => (
  <div>curation-page:{view}:{title}</div>
));
jest.mock('./PivotTenantAudiencePage', () => {
  const { useLocation } = require('react-router-dom');
  return ({ tenantKey }) => {
    const { search } = useLocation();
    return <div>audience-page:{tenantKey}:{search}</div>;
  };
});
jest.mock('./PivotTenantCatalogPage', () => ({ title }) => <div>catalog-page:{title}</div>);
// Mocked like every other tab: its real graph reaches Popup, which imports
// @iconify-icon as untransformed ESM and cannot be loaded under jest.
jest.mock('./carousel/PivotCarouselPage', () => ({ tenantKey }) => (
  <div>carousel-page:{tenantKey}</div>
));
jest.mock('./PivotVoicePage', () => ({ scope, tenantKey }) => (
  <div>city-voice-page:{scope}:{tenantKey}</div>
));
jest.mock('./carousel/PivotCoverLab', () => ({ tenantKey }) => (
  <div>cover-lab-page:{tenantKey}</div>
));
jest.mock('./PivotTenantGrowthPage', () => {
  const { useLocation } = require('react-router-dom');
  return ({ tenantKey }) => {
    const { search } = useLocation();
    return <div>city-growth-page:{tenantKey}:{search}</div>;
  };
});
jest.mock('../PivotNotifications/PivotNotificationsPage', () => ({ tenantKey }) => (
  <div>city-notifications-page:{tenantKey}</div>
));
jest.mock('./PivotComputeJobs', () => ({ tenantKey }) => (
  <div>city-compute-jobs-page:{tenantKey}</div>
));
jest.mock('./PivotTenantLocationMigrationPage', () => ({
  __esModule: true,
  default: ({ tenantKey }) => <div>city-location-migration-page:{tenantKey}</div>,
  get RICH_LOCATION_MIGRATION_UI_ENABLED() {
    return mockLocationMigrationEnabled;
  },
}));
jest.mock('./PivotTenantDropdown', () => () => <div>city-switcher</div>);
jest.mock('./PivotJustGoLogo', () => () => <div>logo</div>);

function renderDashboard(path = '/platform-admin/pivot/nyc?page=4') {
  mockUseFetch.mockReturnValue({
    data: {
      success: true,
      data: {
        tenants: [
          {
            tenantKey: 'nyc',
            name: 'NYC',
            location: 'New York',
            pivotPilot: true,
          },
        ],
      },
    },
    loading: false,
    error: null,
    refetch: jest.fn(),
  });

  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/platform-admin/pivot/:tenantKey"
          element={<PivotTenantDashboard />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PivotTenantDashboard city operations shell', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockLocationMigrationEnabled = true;
    mockDesignReviewEnabled = false;
  });

  it('keeps existing bookmarks stable with Content at page 1', () => {
    renderDashboard('/platform-admin/pivot/nyc');

    expect(screen.getByTestId('tenant-dash-shell')).toBeInTheDocument();
    expect(screen.getByTestId('menu-0')).toHaveTextContent('Overview');
    expect(screen.getByTestId('menu-1')).toHaveTextContent('Content');
    // Catalog (4) and Location migration (7) are Content tabs now.
    expect(screen.queryByTestId('menu-4')).toBeNull();
    expect(screen.queryByTestId('menu-7')).toBeNull();
    expect(screen.getByTestId('menu-5')).toHaveTextContent('Voice');
    expect(screen.getByTestId('menu-8')).toHaveTextContent('Carousels');
    expect(screen.getByTestId('menu-6')).toHaveTextContent('Growth');
    expect(screen.getByTestId('menu-6')).toHaveAttribute(
      'data-icon',
      'mdi:rocket-launch-outline',
    );
  });

  it('opens Content → Events at ?page=1', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=1&batchWeek=2026-W36');

    expect(screen.getByText('curation-page:events:Content')).toBeInTheDocument();
    expect(screen.getByTestId('menu-1')).toHaveAttribute('data-selected', 'true');
  });

  it('redirects a Catalog bookmark (?page=4) to Content → Organizers', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=4&organizerId=org-1');

    expect(screen.getByTestId('current-page')).toHaveTextContent('1');
    expect(screen.getByText('catalog-page:Content')).toBeInTheDocument();
    expect(screen.getByTestId('menu-1')).toHaveAttribute('data-selected', 'true');
    expect(screen.queryByText(/curation-page/)).toBeNull();
  });

  it('shows city Voice at ?page=5', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=5');

    expect(screen.getByText('city-voice-page:tenant:nyc')).toBeInTheDocument();
    expect(screen.getByTestId('menu-5')).toHaveAttribute('data-selected', 'true');
    expect(screen.queryByText(/catalog-page/)).toBeNull();
    expect(screen.queryByText(/city-growth-page/)).toBeNull();
  });

  it('shows city Growth at ?page=6 and keeps Overview off that page', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=6');

    expect(screen.getByText('city-growth-page:nyc:?page=6')).toBeInTheDocument();
    expect(screen.getByTestId('menu-6')).toHaveTextContent('Growth');
    expect(screen.queryByText('overview-page')).toBeNull();
    expect(screen.queryByText(/city-voice-page/)).toBeNull();
  });

  it('redirects a Location migration bookmark (?page=7) to Content → Locations', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=7');

    expect(screen.getByTestId('current-page')).toHaveTextContent('1');
    expect(screen.getByText('city-location-migration-page:nyc')).toBeInTheDocument();
    expect(screen.queryByText('overview-page')).toBeNull();
    expect(screen.queryByText(/curation-page/)).toBeNull();
  });

  it('does not show Growth (or waitlist emails) on Overview', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=0');

    expect(screen.getByText('overview-page')).toBeInTheDocument();
    expect(screen.queryByText(/city-growth-page/)).toBeNull();
    expect(screen.queryByText(/\+1/)).toBeNull();
  });

  it('appends the tenant Notifications panel (former Weekly drop) without renumbering existing pages', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=9');

    expect(screen.getByText('city-notifications-page:nyc')).toBeInTheDocument();
    expect(screen.getByTestId('menu-9')).toHaveTextContent('Notifications');
    expect(screen.getByTestId('menu-9')).toHaveAttribute(
      'data-icon',
      'mdi:bell-ring-outline',
    );
  });

  it('appends Compute jobs as page 10 without renumbering existing pages', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=10');

    expect(screen.getByText('city-compute-jobs-page:nyc')).toBeInTheDocument();
    expect(screen.getByTestId('menu-10')).toHaveTextContent('Compute jobs');
    expect(screen.getByTestId('menu-10')).toHaveAttribute(
      'data-icon',
      'mdi:server-network-outline',
    );
  });

  it('lists Growth second in the sidebar while it keeps ?page=6', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=6');

    const items = screen.getAllByTestId(/^menu-/);
    expect(items.map((item) => item.textContent).slice(0, 3)).toEqual([
      'Overview',
      'Growth',
      'Content',
    ]);
    expect(items[1]).toHaveAttribute('data-testid', 'menu-6');
    expect(items[1]).toHaveAttribute('data-selected', 'true');
  });

  it('redirects an Analytics bookmark to Growth → Acquisition', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=11');

    expect(screen.getByTestId('current-page')).toHaveTextContent('6');
    expect(screen.getByText('city-growth-page:nyc:?page=6&growth=acquisition'))
      .toBeInTheDocument();
    expect(screen.getByTestId('menu-6')).toHaveAttribute('data-selected', 'true');
    expect(screen.queryByTestId('menu-11')).toBeNull();
  });

  it('keeps all later bookmarks stable when Location migration is disabled', () => {
    mockLocationMigrationEnabled = false;
    renderDashboard('/platform-admin/pivot/nyc?page=9');

    expect(screen.queryByTestId('menu-7')).toBeNull();
    expect(screen.getByTestId('menu-8')).toHaveTextContent('Carousels');
    expect(screen.getByTestId('menu-9')).toHaveTextContent('Notifications');
    expect(screen.getByTestId('menu-10')).toHaveTextContent('Compute jobs');
    expect(screen.queryByTestId('menu-11')).toBeNull();
    expect(screen.queryByTestId('menu-12')).toBeNull();
    expect(screen.getByText('city-notifications-page:nyc')).toBeInTheDocument();
  });

  it('redirects a legacy Cover Lab bookmark to Carousels outside development', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=12&deckId=issue-1');

    expect(screen.getByText('carousel-page:nyc')).toBeInTheDocument();
    expect(screen.getByTestId('current-page')).toHaveTextContent('8');
    expect(screen.queryByText('cover-lab-page:nyc')).toBeNull();
    expect(screen.queryByTestId('menu-12')).toBeNull();
  });

  it('keeps the legacy Cover Lab bookmark in development', async () => {
    mockDesignReviewEnabled = true;
    renderDashboard('/platform-admin/pivot/nyc?page=12');

    expect(await screen.findByText('cover-lab-page:nyc')).toBeInTheDocument();
    expect(screen.getByTestId('menu-12')).toHaveTextContent('Cover lab (temp)');
    expect(screen.getByTestId('menu-12')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('menu-8')).toHaveAttribute('data-selected', 'false');
  });

  it('shows Cover lab in the city nav when design review is enabled', () => {
    mockDesignReviewEnabled = true;
    renderDashboard('/platform-admin/pivot/nyc?page=8');

    expect(screen.getByTestId('menu-12')).toHaveTextContent('Cover lab (temp)');
  });

  it('opens Carousels at the existing bookmark', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=8&deckId=issue-1');

    expect(screen.getByText('carousel-page:nyc')).toBeInTheDocument();
    expect(screen.getByTestId('menu-8')).toHaveAttribute('data-selected', 'true');
  });

  it('redirects a combined-view Copy bookmark to Voice', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=8&creative=copy');

    expect(screen.getByText('city-voice-page:tenant:nyc')).toBeInTheDocument();
    expect(screen.queryByText('carousel-page:nyc')).toBeNull();
    expect(screen.getByTestId('menu-5')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('current-page')).toHaveTextContent('5');
  });

  it('shows Audience at ?page=2 and hides the merged Drop deck entry', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=2&batchWeek=2026-W36&userId=u1');

    expect(screen.getByText('audience-page:nyc:?page=2&batchWeek=2026-W36&userId=u1'))
      .toBeInTheDocument();
    expect(screen.getByTestId('menu-2')).toHaveTextContent('Audience');
    expect(screen.getByTestId('menu-2')).toHaveAttribute('data-selected', 'true');
    expect(screen.queryByTestId('menu-3')).toBeNull();
    expect(screen.queryByTestId('menu-4')).toBeNull();
  });

  it('redirects a Drop deck bookmark without a user to Audience deck rules', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=3');

    expect(screen.getByTestId('current-page')).toHaveTextContent('2');
    expect(screen.getByText('audience-page:nyc:?page=2&audience=rules')).toBeInTheDocument();
    expect(screen.getByTestId('menu-2')).toHaveAttribute('data-selected', 'true');
  });

  it('redirects a Drop deck user bookmark to that user\'s ranked deck', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=3&userId=u1');

    expect(screen.getByText(
      'audience-page:nyc:?page=2&userId=u1&audience=users&userPane=ranking',
    )).toBeInTheDocument();
  });

  it('keeps a pinned Drop deck week on the ranked deck', () => {
    renderDashboard('/platform-admin/pivot/nyc?page=3&batchWeek=2026-W36&userId=u1');

    expect(screen.getByTestId('current-batch-week')).toHaveTextContent('2026-W36');
    expect(screen.getByText(
      'audience-page:nyc:?page=2&batchWeek=2026-W36&userId=u1&audience=users&userPane=ranking&deckWeek=page',
    )).toBeInTheDocument();
  });

  it('redirects a disabled Location migration bookmark to Content → Events', () => {
    mockLocationMigrationEnabled = false;
    renderDashboard('/platform-admin/pivot/nyc?page=7&batchWeek=2026-W36');

    expect(screen.getByTestId('current-page')).toHaveTextContent('1');
    expect(screen.getByTestId('current-batch-week')).toHaveTextContent('2026-W36');
    expect(screen.getByText('curation-page:events:Content')).toBeInTheDocument();
    expect(screen.queryByTestId('menu-7')).toBeNull();
  });
});
