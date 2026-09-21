import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PivotCurationQueue, { EditorialWeightControl } from './PivotCurationQueue';

jest.mock('../PivotLab/PivotManualImportModal', () => ({
  __esModule: true,
  default: () => null,
  isTypingTarget: () => false,
}));
jest.mock('../PivotLab/PivotImportThumb', () => () => <span>thumb</span>);
jest.mock('../PivotLab/PivotTagMultiSelect', () => () => null);
jest.mock('../../../components/Select/Select', () => () => null);
jest.mock('./useCurationImmersiveScroll', () => ({
  __esModule: true,
  default: () => ({
    frameRef: { current: null },
    slotRef: { current: null },
    slotHeight: 0,
    immersive: false,
    expanded: false,
    collapse: jest.fn(),
    expand: jest.fn(),
  }),
}));

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unpublished', label: 'Unpublished' },
];

function catalogEvents() {
  return [
    {
      _id: '1',
      name: 'Oakland disco',
      organizerName: 'Nicki',
      location: 'Oakland',
      ingestStatus: 'staged',
      locationReview: { status: 'needs_review', reason: 'out_of_scope' },
      tags: ['dance'],
    },
    {
      _id: '2',
      name: 'Mission brunch',
      organizerName: 'Ada',
      location: 'SF',
      ingestStatus: 'published',
      tags: ['food'],
    },
  ];
}

function renderQueue(overrides = {}) {
  return render(
    <PivotCurationQueue
      tenantKey="sf"
      batchWeek="2026-W38"
      events={catalogEvents()}
      selectedIds={new Set()}
      onSelectedIdsChange={jest.fn()}
      filter="all"
      onFilterChange={jest.fn()}
      filterOptions={FILTERS}
      sourceFilter="all"
      onSourceFilterChange={jest.fn()}
      hostCreatedCount={0}
      catalogTags={[]}
      bulkTags={[]}
      onBulkTagsChange={jest.fn()}
      showPerformance={false}
      performanceById={new Map()}
      busyKey={null}
      releaseDisabled={false}
      onEdit={jest.fn()}
      onPublish={jest.fn()}
      onUnpublish={jest.fn()}
      onDelete={jest.fn()}
      onBulkStage={jest.fn()}
      onBulkPublish={jest.fn()}
      onBulkUnpublish={jest.fn()}
      onBulkApplyTags={jest.fn()}
      onBulkSuggestTags={jest.fn()}
      onBulkEnrichRichData={jest.fn()}
      onBulkCollapseShowtimes={jest.fn()}
      onBulkFeature={jest.fn()}
      onBulkUnfeature={jest.fn()}
      onToggleFeatured={jest.fn()}
      onEditorialChange={jest.fn()}
      onBulkEditorial={jest.fn()}
      {...overrides}
    />,
  );
}

describe('EditorialWeightControl', () => {
  const event = { _id: 'event-1', name: 'Night Market', rankingOverride: null };

  it('offers a semantic six-stop slider and clears Standard', () => {
    const onSave = jest.fn();
    const { rerender } = render(
      <EditorialWeightControl event={event} busy={false} onSave={onSave} />,
    );

    const slider = screen.getByRole('slider', { name: 'Editorial weight' });
    expect(slider).toHaveAttribute('aria-valuetext', 'Standard');
    expect(slider).toHaveAttribute('max', '5');
    expect(screen.queryByRole('button', { name: 'Save weight' })).not.toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '4' } });
    expect(slider).toHaveAttribute('aria-valuetext', 'Strong Promote');
    expect(screen.getByText(/one friend-going boost/i)).toBeInTheDocument();
    expect(screen.getByText('People with matching interests')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'matching_interests' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    expect(onSave).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ tier: 'strong_promote', audience: 'matching_interests' }),
    );

    const savedEvent = {
      ...event,
      rankingOverride: { tier: 'strong_promote', audience: 'matching_interests' },
    };
    rerender(<EditorialWeightControl event={savedEvent} busy={false} onSave={onSave} />);
    expect(screen.queryByRole('button', { name: 'Save weight' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset editorial weight to Standard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    expect(onSave).toHaveBeenLastCalledWith(savedEvent, null);
  });

  it('loads an existing override without showing internal notes or a redundant save action', () => {
    render(
      <EditorialWeightControl
        event={{
          ...event,
          rankingOverride: { tier: 'promote', audience: 'everyone', note: 'Launch pick' },
        }}
        busy={false}
        onSave={jest.fn()}
      />,
    );
    expect(screen.getByRole('slider', { name: 'Editorial weight' }))
      .toHaveAttribute('aria-valuetext', 'Promote');
    expect(screen.queryByText(/internal note/i)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Launch pick')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save weight' })).not.toBeInTheDocument();
  });
});

function mockMatchMedia(matches) {
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
  }));
}

describe('PivotCurationQueue catalog', () => {
  beforeAll(() => {
    global.IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };
  });

  afterEach(() => {
    delete window.matchMedia;
  });

  it('searches the catalog, flags location review, and opens a side inspector on desktop', () => {
    mockMatchMedia(false);
    renderQueue();

    expect(screen.getByRole('button', { name: 'Unpublished' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument();
    expect(screen.getByText('Location review')).toBeInTheDocument();
    expect(screen.getByText('Mission brunch').closest('tr')).toHaveClass('is-published');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search catalog' }), {
      target: { value: 'oakland' },
    });
    expect(screen.getByText('Oakland disco')).toBeInTheDocument();
    expect(screen.queryByText('Mission brunch')).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('grid', { name: 'Curation catalog' }), { key: 'Enter' });
    expect(screen.getByText(/outside the city boundary/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open location review' })).toHaveAttribute(
      'href',
      '/platform-admin/pivot/sf?page=7&batchWeek=2026-W38',
    );
    expect(document.querySelector('.popup-overlay')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Oakland disco details' })).toBeInTheDocument();
  });

  it('opens event details in a popup on mobile', () => {
    mockMatchMedia(true);
    renderQueue();

    fireEvent.keyDown(screen.getByRole('grid', { name: 'Curation catalog' }), { key: 'Enter' });
    expect(document.querySelector('.popup-overlay')).toBeInTheDocument();
    expect(document.querySelector('.pivot-curation-inspect-popup')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Oakland disco details' })).toBeInTheDocument();
  });
});
