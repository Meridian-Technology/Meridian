import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PivotCurationQueue, { EditorialWeightControl } from './PivotCurationQueue';

jest.mock('../PivotLab/PivotManualImportModal', () => ({
  __esModule: true,
  default: () => null,
  isTypingTarget: () => false,
}));
jest.mock('../PivotLab/PivotImportThumb', () => () => <span>thumb</span>);
jest.mock('../../../hooks/useFetch', () => ({ authenticatedRequest: jest.fn() }));
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

function eventRow(name) {
  return screen.getByText(name, { selector: '.pivot-curation-sheet__name' }).closest('tr');
}

function queueProps(overrides = {}) {
  return {
    tenantKey: 'sf',
    batchWeek: '2026-W38',
    events: catalogEvents(),
    selectedIds: new Set(),
    onSelectedIdsChange: jest.fn(),
    filter: 'all',
    onFilterChange: jest.fn(),
    filterOptions: FILTERS,
    sourceFilter: 'all',
    onSourceFilterChange: jest.fn(),
    hostCreatedCount: 0,
    catalogTags: [],
    bulkTags: [],
    onBulkTagsChange: jest.fn(),
    showPerformance: false,
    performanceById: new Map(),
    busyKey: null,
    releaseDisabled: false,
    onEdit: jest.fn(),
    onPublish: jest.fn(),
    onUnpublish: jest.fn(),
    onStage: jest.fn(),
    onDraft: jest.fn(),
    onDelete: jest.fn(),
    onBulkStage: jest.fn(),
    onBulkDraft: jest.fn(),
    onBulkPublish: jest.fn(),
    onBulkUnpublish: jest.fn(),
    onBulkApplyTags: jest.fn(),
    onBulkSuggestTags: jest.fn(),
    onBulkEnrichRichData: jest.fn(),
    onBulkCollapseShowtimes: jest.fn(),
    onBulkFeature: jest.fn(),
    onBulkUnfeature: jest.fn(),
    onToggleFeatured: jest.fn(),
    onEditorialChange: jest.fn(),
    onLocationReview: jest.fn(),
    onBulkEditorial: jest.fn(),
    ...overrides,
  };
}

function renderQueue(overrides = {}) {
  return render(<PivotCurationQueue {...queueProps(overrides)} />);
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
    document.documentElement.classList.remove('is-curation-chrome-fullscreen');
  });

  it('follows the focused row in the side pane and opens a details popup on Enter', () => {
    mockMatchMedia(false);
    renderQueue();

    expect(screen.getByRole('button', { name: 'Unpublished' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument();
    expect(screen.getByText('Location review')).toBeInTheDocument();
    expect(screen.getByText('Mission brunch').closest('tr')).toHaveClass('is-published');
    expect(screen.getByRole('complementary', { name: 'Oakland disco details' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search catalog' }), {
      target: { value: 'oakland' },
    });
    expect(screen.getAllByText('Oakland disco').length).toBeGreaterThan(0);
    expect(screen.queryByText('Mission brunch')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Oakland disco details' })).toBeInTheDocument();
    expect(screen.getByText(/outside the city boundary/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resolve location' })).toBeInTheDocument();
    // The Locations tab is flag-gated; without it there is nowhere to link to.
    expect(screen.queryByRole('link', { name: 'All location reviews' })).not.toBeInTheDocument();
    expect(document.querySelector('.popup-overlay')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(screen.getByText('No cover image')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('grid', { name: 'Curation catalog' }), { key: 'Enter' });
    expect(document.querySelector('.popup-overlay')).toBeInTheDocument();
    expect(document.querySelector('.pivot-curation-inspect-popup')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Oakland disco dossier' })).toBeInTheDocument();
  });

  it('shows match confidence on the location review tag', () => {
    mockMatchMedia(false);
    const events = catalogEvents();
    events[0].locationReview = {
      status: 'needs_review',
      reason: 'confidence_below_auto_apply',
      confidence: 0.76,
      candidateMatches: [{ venueName: 'Fox Oakland', formattedAddress: '1807 Telegraph Ave',
        googlePlaceId: 'ChIJ-fox', coordinates: { type: 'Point', coordinates: [-122.27, 37.81] } }],
    };
    renderQueue({ events });
    const flag = within(eventRow('Oakland disco')).getByText('Location review · 76%');
    expect(flag).toHaveAttribute('title', expect.stringContaining("Google's top match: Fox Oakland (76% confidence)"));
  });

  it('offers a bulk Google location action for selected events with a match', () => {
    mockMatchMedia(false);
    const onBulkResolveLocation = jest.fn();
    const events = catalogEvents();
    events[0].locationReview = {
      status: 'needs_review',
      reason: 'ambiguous_provider_matches',
      candidateMatches: [{ venueName: 'Fox Oakland', formattedAddress: '1807 Telegraph Ave',
        googlePlaceId: 'ChIJ-fox', coordinates: { type: 'Point', coordinates: [-122.27, 37.81] } }],
    };
    renderQueue({ events, onBulkResolveLocation, selectedIds: new Set(['1', '2']) });
    fireEvent.click(screen.getByRole('button', { name: 'Use Google location (1)' }));
    expect(onBulkResolveLocation).toHaveBeenCalled();
  });

  it('hides the bulk Google action when no selected event has a usable match', () => {
    mockMatchMedia(false);
    renderQueue({ onBulkResolveLocation: jest.fn(), selectedIds: new Set(['1', '2']) });
    expect(screen.queryByRole('button', { name: /Use Google location/ })).not.toBeInTheDocument();
  });

  it('resolves a location review in place without leaving curation', () => {
    mockMatchMedia(false);
    const onLocationReview = jest.fn();
    const onStage = jest.fn();
    const events = catalogEvents();
    events[0].locationReview = {
      status: 'needs_review',
      reason: 'ambiguous_provider_matches',
      candidateCount: 2,
      candidateMatches: [
        { mode: 'physical', venueName: 'Oakland Arena', formattedAddress: '7000 Coliseum Way' },
        { mode: 'physical', venueName: 'Fox Oakland', formattedAddress: '1807 Telegraph Ave' },
      ],
    };
    const { rerender } = renderQueue({ events, onLocationReview, onStage });

    fireEvent.click(screen.getByRole('button', { name: 'Resolve location' }));
    const popup = document.querySelector('.pivot-curation-location-popup');
    expect(popup).toBeInTheDocument();
    expect(within(popup).getByText('Google found multiple plausible places')).toBeInTheDocument();

    // Queue shortcuts stay quiet while the resolver is open.
    fireEvent.keyDown(window, { key: 's' });
    expect(onStage).not.toHaveBeenCalled();

    fireEvent.click(within(popup).getByRole('button', { name: /Fox Oakland/ }));
    fireEvent.click(within(popup).getByRole('button', { name: 'Save location' }));
    expect(onLocationReview).toHaveBeenCalledWith(
      '1',
      'select_match',
      expect.objectContaining({ venueName: 'Fox Oakland' }),
      expect.objectContaining({ candidateSource: 'provider_candidate' }),
    );

    // Once the refreshed event no longer needs review, the resolver closes.
    const resolved = catalogEvents();
    resolved[0].locationReview = { status: 'approved' };
    rerender(<PivotCurationQueue {...queueProps({ events: resolved, onLocationReview })} />);
    expect(document.querySelector('.pivot-curation-location-popup')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve location' })).not.toBeInTheDocument();
  });

  it('opens the location resolver from a blocked publish review and closes it with Escape', async () => {
    mockMatchMedia(false);
    const onLocationReview = jest.fn();
    renderQueue({ onLocationReview });

    fireEvent.keyDown(window, { key: 'p' });
    expect(await screen.findByRole('heading', { name: 'This event is not ready' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(screen.queryByRole('heading', { name: 'This event is not ready' })).not.toBeInTheDocument();
    expect(document.querySelector('.pivot-curation-location-popup')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'TBD' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save location' }));
    expect(onLocationReview).toHaveBeenCalledWith(
      '1',
      'correct_representation',
      expect.objectContaining({ mode: 'tbd' }),
      expect.objectContaining({ remember: true }),
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('.pivot-curation-location-popup')).not.toBeInTheDocument();
  });

  it('opens true fullscreen over the dashboard and exits with Escape', () => {
    mockMatchMedia(false);
    renderQueue();

    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(document.documentElement).toHaveClass('is-curation-chrome-fullscreen');
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.documentElement).not.toHaveClass('is-curation-chrome-fullscreen');
    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument();
  });

  it('opens event details in a popup on mobile', () => {
    mockMatchMedia(true);
    renderQueue();

    fireEvent.keyDown(screen.getByRole('grid', { name: 'Curation catalog' }), { key: 'Enter' });
    expect(document.querySelector('.popup-overlay')).toBeInTheDocument();
    expect(document.querySelector('.pivot-curation-inspect-popup')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Oakland disco dossier' })).toBeInTheDocument();
  });

  it('flags cover URLs that failed to load', () => {
    mockMatchMedia(false);
    renderQueue({
      filterOptions: [...FILTERS, { value: 'broken-image', label: 'Broken image' }],
      brokenImageIds: new Set(['1']),
    });

    expect(screen.getByRole('button', { name: /Broken image/ })).toHaveTextContent('1');
    expect(eventRow('Oakland disco')).toHaveTextContent('Broken image');
    expect(eventRow('Mission brunch')).not.toHaveTextContent('Broken image');
  });

  it('keeps the row selected after a status change, and moves to the next child if it leaves the filter', () => {
    mockMatchMedia(false);
    const onSelectedIdsChange = jest.fn();
    const events = catalogEvents();
    const { rerender } = renderQueue({
      events,
      selectedIds: new Set(['1']),
      onSelectedIdsChange,
    });

    expect(eventRow('Oakland disco')).toHaveClass('is-focused');
    expect(eventRow('Oakland disco')).toHaveClass('is-selected');

    rerender(<PivotCurationQueue {...queueProps({
      events,
      selectedIds: new Set(['1']),
      onSelectedIdsChange,
    })} />);
    expect(onSelectedIdsChange).not.toHaveBeenCalled();

    rerender(<PivotCurationQueue {...queueProps({
      events: [events[1]],
      selectedIds: new Set(['1']),
      onSelectedIdsChange,
    })} />);
    expect(onSelectedIdsChange).toHaveBeenCalledWith(new Set(['2']));
    expect(eventRow('Mission brunch')).toHaveClass('is-focused');
  });

  it('opens a publish confirm with event details, and publishes immediately with ⌘P', async () => {
    mockMatchMedia(false);
    const onPublish = jest.fn().mockResolvedValue(true);
    renderQueue({
      onPublish,
      events: [{
        _id: '10',
        name: 'Ready disco',
        organizerName: 'Nico',
        location: 'Oakland',
        startDate: '2026-09-26T21:00:00.000Z',
        ingestStatus: 'staged',
        image: 'https://cdn.example/cover.jpg',
        description: 'Records until late',
        tags: ['dance'],
      }],
    });

    fireEvent.keyDown(window, { key: 'p' });
    expect(onPublish).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Publish this event?' })).toBeInTheDocument();
    const confirm = document.querySelector('.pivot-curation-publish-confirm');
    expect(within(confirm).getByText('Ready disco')).toBeInTheDocument();
    expect(within(confirm).getByText(/Nico/)).toBeInTheDocument();
    expect(within(confirm).getByText(/Oakland/)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ _id: '10', ingestStatus: 'staged' }),
      { skipConfirm: true },
    );
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Publish this event?' })).not.toBeInTheDocument();
    });

    onPublish.mockClear();
    fireEvent.keyDown(window, { key: 'p', metaKey: true });
    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ _id: '10' }),
      { skipConfirm: true },
    );
    expect(screen.queryByRole('heading', { name: 'Publish this event?' })).not.toBeInTheDocument();
  });

  it('selects catalog rows with ⌘A instead of page text', () => {
    mockMatchMedia(false);
    const onSelectedIdsChange = jest.fn();
    renderQueue({ onSelectedIdsChange });

    const event = new KeyboardEvent('keydown', {
      key: 'a',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    const preventDefault = jest.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(onSelectedIdsChange).toHaveBeenCalledWith(new Set(['1', '2']));
  });

  it('opens a weight popup with W and saves with arrows, I, and Enter', async () => {
    mockMatchMedia(false);
    const onEditorialChange = jest.fn();
    renderQueue({ onEditorialChange });

    fireEvent.keyDown(window, { key: 'w' });
    const weightPopup = await waitFor(() => document.querySelector('.pivot-curation-weight-popup'));
    expect(within(weightPopup).getByRole('heading', { name: 'Oakland disco' })).toBeInTheDocument();
    const slider = screen.getByRole('slider', { name: 'Editorial weight' });
    expect(slider).toHaveAttribute('aria-valuetext', 'Standard');

    fireEvent.keyDown(window, { key: 'k' });
    expect(slider).toHaveAttribute('aria-valuetext', 'Promote');

    fireEvent.keyDown(window, { key: 'i' });
    expect(screen.getByRole('button', { name: 'Matching interests' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onEditorialChange).toHaveBeenCalledWith(
      expect.objectContaining({ _id: '1', name: 'Oakland disco' }),
      { tier: 'promote', audience: 'matching_interests' },
    );
  });

  it('blocks the P review when tags or rich data are missing', async () => {
    mockMatchMedia(false);
    const onPublish = jest.fn().mockResolvedValue(true);
    const { rerender } = renderQueue({
      onPublish,
      events: [{
        _id: '11',
        name: 'Untagged disco',
        organizerName: 'Nico',
        location: 'Oakland',
        ingestStatus: 'staged',
        image: 'https://cdn.example/cover.jpg',
        description: 'Records until late',
        tags: [],
      }],
    });

    fireEvent.keyDown(window, { key: 'p' });
    expect(await screen.findByRole('heading', { name: 'This event is not ready' })).toBeInTheDocument();
    const confirm = document.querySelector('.pivot-curation-publish-confirm');
    expect(within(confirm).getByText('Missing tags')).toBeInTheDocument();
    expect(within(confirm).getByRole('button', { name: 'Publish' })).toBeDisabled();

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onPublish).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    rerender(<PivotCurationQueue {...queueProps({
      onPublish,
      events: [{
        _id: '12',
        name: 'Bare disco',
        organizerName: 'Nico',
        location: 'Oakland',
        ingestStatus: 'staged',
        image: 'https://cdn.example/cover.jpg',
        description: '',
        needsRichData: true,
        missingRichData: ['description'],
        tags: ['dance'],
      }],
    })} />);

    fireEvent.keyDown(window, { key: 'p' });
    expect(await screen.findByRole('heading', { name: 'This event is not ready' })).toBeInTheDocument();
    expect(within(document.querySelector('.pivot-curation-publish-confirm')).getByText('Missing rich data'))
      .toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('opens a P review instead of publishing a blocked staged event', async () => {
    mockMatchMedia(false);
    const onPublish = jest.fn().mockResolvedValue(true);
    const onUnpublish = jest.fn().mockResolvedValue(true);
    const onStage = jest.fn().mockResolvedValue(true);
    renderQueue({ onPublish, onUnpublish, onStage });

    expect(screen.getByText('I')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'p' });
    expect(onPublish).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'This event is not ready' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });

    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'u' });
    expect(onUnpublish).toHaveBeenCalledWith(
      expect.objectContaining({ _id: '2', ingestStatus: 'published' }),
      { skipConfirm: true },
    );
    await waitFor(() => expect(onUnpublish).toHaveBeenCalledTimes(1));
  });

  it('stages a focused draft with S', async () => {
    mockMatchMedia(false);
    const onStage = jest.fn().mockResolvedValue(true);
    renderQueue({
      onStage,
      events: [{
        _id: '3',
        name: 'Draft disco',
        organizerName: 'Nico',
        ingestStatus: 'draft',
      }],
    });

    fireEvent.keyDown(window, { key: 's' });
    expect(onStage).toHaveBeenCalledWith(expect.objectContaining({ _id: '3' }));
    await waitFor(() => expect(onStage).toHaveBeenCalled());
  });

  it('moves a staged event to draft with D', async () => {
    mockMatchMedia(false);
    const onDraft = jest.fn().mockResolvedValue(true);
    renderQueue({ onDraft });

    fireEvent.keyDown(window, { key: 'd' });
    expect(onDraft).toHaveBeenCalledWith(expect.objectContaining({ _id: '1', ingestStatus: 'staged' }));
    await waitFor(() => expect(onDraft).toHaveBeenCalled());
  });
});

describe('pick mode', () => {
  it('borrows the catalog without its status, feature, weight or edit controls', () => {
    mockMatchMedia(false);
    renderQueue({ mode: 'pick', selectedIds: new Set(['2']), title: 'Catalog · pick' });

    expect(screen.getByText('Catalog · pick')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search catalog' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unpublished' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Oakland disco details' })).toBeInTheDocument();
    for (const name of ['Publish', 'Edit', 'Feature', 'Delete', 'Draft', 'Fullscreen', 'Resolve location']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByText('Use selection as exact set')).not.toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Unpublish \(/ })).not.toBeInTheDocument();
  });

  it('adds a clicked row to the picks instead of replacing them', () => {
    mockMatchMedia(false);
    const onSelectedIdsChange = jest.fn();
    renderQueue({ mode: 'pick', selectedIds: new Set(['elsewhere']), onSelectedIdsChange });

    fireEvent.pointerDown(eventRow('Mission brunch'), { button: 0, pointerId: 1 });

    expect(onSelectedIdsChange).toHaveBeenLastCalledWith(new Set(['elsewhere', '2']));
  });

  it('ignores status hotkeys and keeps picks when moving focus', () => {
    mockMatchMedia(false);
    const onStage = jest.fn();
    const onSelectedIdsChange = jest.fn();
    renderQueue({
      mode: 'pick',
      onStage,
      onSelectedIdsChange,
      selectedIds: new Set(['elsewhere']),
      events: [
        { _id: '3', name: 'Draft disco', organizerName: 'Nico', ingestStatus: 'draft' },
        { _id: '4', name: 'Draft brunch', organizerName: 'Ada', ingestStatus: 'draft' },
      ],
    });

    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(screen.getByRole('grid', { name: 'Curation catalog' }), { key: 'ArrowDown' });

    expect(onStage).not.toHaveBeenCalled();
    expect(onSelectedIdsChange).not.toHaveBeenCalled();
  });
});
