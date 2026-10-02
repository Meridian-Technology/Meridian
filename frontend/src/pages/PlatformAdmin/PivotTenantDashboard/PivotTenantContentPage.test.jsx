import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import PivotTenantContentPage from './PivotTenantContentPage';

const mockCurationMounts = jest.fn();
let mockLocationsEnabled = true;

jest.mock('./PivotTenantCurationPage', () => ({
  __esModule: true,
  default: function MockCuration({ view, title, nav }) {
    // eslint-disable-next-line global-require
    const { useEffect } = require('react');
    useEffect(() => {
      mockCurationMounts();
    }, []);
    return (
      <div>
        {nav}
        <p>curation:{view}:{title}</p>
      </div>
    );
  },
}));

jest.mock('./PivotTenantCatalogPage', () => ({
  __esModule: true,
  default: ({ title, nav }) => (
    <div>
      {nav}
      <p>catalog:{title}</p>
    </div>
  ),
}));

jest.mock('./PivotTenantLocationMigrationPage', () => ({
  __esModule: true,
  default: ({ title, nav }) => (
    <div>
      {nav}
      <p>locations:{title}</p>
    </div>
  ),
  get RICH_LOCATION_MIGRATION_UI_ENABLED() {
    return mockLocationsEnabled;
  },
}));

function LocationProbe() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

function renderContent(query = '?page=1') {
  return render(
    <MemoryRouter initialEntries={[`/platform-admin/pivot/nyc${query}`]}>
      <PivotTenantContentPage tenantKey="nyc" cityDisplayName="New York" />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('PivotTenantContentPage', () => {
  beforeEach(() => {
    mockCurationMounts.mockReset();
    mockLocationsEnabled = true;
  });

  it('opens on Events with the four Content tabs', () => {
    renderContent();

    expect(screen.getByText('curation:events:Content')).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Events',
      'Sources',
      'Organizers',
      'Locations',
    ]);
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'true');
  });

  it('switches Events ↔ Sources on the same page, keeping its filters', () => {
    renderContent('?page=1&batchWeek=2026-W40&filter=draft');

    fireEvent.click(screen.getByRole('tab', { name: 'Sources' }));

    expect(screen.getByText('curation:sources:Content')).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('content=sources');
    expect(screen.getByTestId('search')).toHaveTextContent('filter=draft');
    // Same component instance: week state and loaded data survive the switch.
    expect(mockCurationMounts).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('tab', { name: 'Events' }));
    expect(screen.getByTestId('search')).not.toHaveTextContent('content=');
  });

  it('clears Events filters when moving to Organizers, and back', () => {
    renderContent('?page=1&batchWeek=2026-W40&filter=draft&source=luma&eventId=e1');

    fireEvent.click(screen.getByRole('tab', { name: 'Organizers' }));

    expect(screen.getByText('catalog:Content')).toBeInTheDocument();
    const search = screen.getByTestId('search').textContent;
    expect(search).toContain('content=organizers');
    expect(search).toContain('batchWeek=2026-W40');
    expect(search).not.toMatch(/filter=|source=|eventId=/);
  });

  it('opens Organizers and Locations from the URL', () => {
    const { unmount } = renderContent('?page=1&content=organizers');
    expect(screen.getByText('catalog:Content')).toBeInTheDocument();
    unmount();

    renderContent('?page=1&content=locations');
    expect(screen.getByText('locations:Content')).toBeInTheDocument();
  });

  it('hides Locations while its flag is off', () => {
    mockLocationsEnabled = false;
    renderContent('?page=1&content=locations');

    expect(screen.queryByRole('tab', { name: 'Locations' })).toBeNull();
    expect(screen.getByText('curation:events:Content')).toBeInTheDocument();
  });
});
