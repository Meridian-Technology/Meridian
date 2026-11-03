process.env.REACT_APP_GOOGLE_MAPS_EMBED_API_KEY = 'browser-key';

jest.mock('@iconify-icon/react', () => ({ Icon: () => null }));
jest.mock('../../../hooks/useFetch', () => ({ authenticatedRequest: jest.fn() }));

const React = require('react');
const { act, fireEvent, render, screen, waitFor } = require('@testing-library/react');
const { authenticatedRequest } = require('../../../hooks/useFetch');
const {
  default: PivotLocationReviewInspector,
  buildRepresentation,
  googleMapsEmbedUrl,
  googleMapsListingUrl,
} = require('./PivotLocationReviewInspector');

const PLACE = {
  mode: 'physical',
  venueName: 'The Bell House',
  formattedAddress: '149 7th St, Brooklyn, NY 11215',
  googlePlaceId: 'ChIJ-example',
  coordinates: { type: 'Point', coordinates: [-73.99, 40.67] },
  resolutionConfidence: 0.76,
};

const SECOND_PLACE = {
  ...PLACE,
  venueName: 'Union Hall',
  formattedAddress: '702 Union St, Brooklyn, NY 11215',
  googlePlaceId: 'ChIJ-second',
  coordinates: { type: 'Point', coordinates: [-73.98, 40.68] },
};

const CANDIDATE = {
  eventId: 'event-1',
  name: 'Comedy Night',
  startTime: '2026-09-04T19:00:00.000Z',
  rawLocationText: 'Bell House, Gowanus',
  source: 'justgo',
  sourceUrl: 'https://example.com/comedy',
  batchWeek: '2026-W36',
  candidateMatches: [PLACE, SECOND_PLACE],
  review: { reason: 'ambiguous_provider_matches' },
  whyReview: {
    reason: 'ambiguous_provider_matches',
    title: 'Google found multiple plausible places',
    detail: 'Compare the source location with the suggested listing before choosing it.',
    confidence: 0.76,
    candidateCount: 3,
  },
};

describe('PivotLocationReviewInspector', () => {
  test('builds an exact Google listing URL and browser-key map URL', () => {
    const listing = new URL(googleMapsListingUrl(PLACE));
    expect(listing.searchParams.get('query')).toBe('The Bell House');
    expect(listing.searchParams.get('query_place_id')).toBe('ChIJ-example');

    const embed = new URL(googleMapsEmbedUrl(PLACE, 'restricted-key'));
    expect(embed.pathname).toBe('/maps/embed/v1/place');
    expect(embed.searchParams.get('key')).toBe('restricted-key');
    expect(embed.searchParams.get('q')).toBe('place_id:ChIJ-example');
  });

  test('shows source and Google evidence, then saves the chosen candidate', () => {
    const onReview = jest.fn();
    render(<PivotLocationReviewInspector candidate={CANDIDATE} onReview={onReview} />);

    expect(screen.getByText('Google found multiple plausible places')).toBeInTheDocument();
    expect(screen.getByText('Bell House, Gowanus')).toBeInTheDocument();
    expect(screen.getByText('3 possible matches')).toBeInTheDocument();
    expect(screen.getByTitle('Map of The Bell House')).toHaveAttribute(
      'src',
      expect.stringContaining('place_id%3AChIJ-example'),
    );

    fireEvent.click(screen.getByRole('button', { name: /2\. Union Hall/ }));
    expect(screen.getAllByText('702 Union St, Brooklyn, NY 11215')).toHaveLength(2);
    expect(screen.getByLabelText('Public location label')).toHaveValue('Union Hall');
    fireEvent.click(screen.getByRole('button', { name: 'Save location' }));
    expect(onReview).toHaveBeenCalledWith('event-1', 'select_match', {
      ...SECOND_PLACE,
      originalInput: 'Bell House, Gowanus',
      publicDisplayLabel: 'Union Hall',
      revealPolicy: 'public',
    }, { remember: true, applyToMatching: true, candidateSource: 'provider_candidate' });
  });

  test('keeps the address private when the place is registration-only', () => {
    const onReview = jest.fn();
    render(<PivotLocationReviewInspector
      candidate={{ ...CANDIDATE, candidateMatches: [{ ...PLACE, neighborhood: 'Gowanus' }] }}
      onReview={onReview}
    />);
    fireEvent.click(screen.getByRole('radio', { name: 'Address after RSVP' }));
    expect(screen.getByLabelText('Public location label')).toHaveValue('Gowanus');
    fireEvent.click(screen.getByRole('button', { name: 'Save location' }));
    expect(onReview).toHaveBeenCalledWith('event-1', 'select_match', expect.objectContaining({
      mode: 'registration_gated',
      googlePlaceId: 'ChIJ-example',
      publicDisplayLabel: 'Gowanus',
      revealPolicy: 'registered_only',
    }), expect.anything());
  });

  test('describes a general area with an editable label and no precise fields', () => {
    const onReview = jest.fn();
    render(<PivotLocationReviewInspector
      candidate={{ ...CANDIDATE, candidateMatches: [], matchingCount: 0 }}
      onReview={onReview}
    />);
    expect(screen.getByRole('radio', { name: 'Exact place' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'General area' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Save location' })).toBeDisabled();
    expect(screen.queryByText(/Also apply/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Public location label'), {
      target: { value: 'Gowanus, near the canal' },
    });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Brooklyn' } });
    fireEvent.click(screen.getByLabelText(/Remember this for future events/));
    fireEvent.click(screen.getByRole('button', { name: 'Save location' }));
    expect(onReview).toHaveBeenCalledWith('event-1', 'approve_representation', {
      mode: 'approximate',
      originalInput: 'Bell House, Gowanus',
      city: 'Brooklyn',
      approximateLabel: 'Gowanus, near the canal',
      publicDisplayLabel: 'Gowanus, near the canal',
      resolutionStatus: 'not_applicable',
      revealPolicy: 'public',
    }, { remember: false, applyToMatching: false, candidateSource: 'manual' });
  });

  test('offers a remembered match and applies it to matching events', () => {
    const onReview = jest.fn();
    render(<PivotLocationReviewInspector
      candidate={{
        ...CANDIDATE,
        matchingCount: 4,
        rememberedLocation: {
          id: 'memory-1',
          sourceText: 'Bell House, Gowanus',
          action: 'select_match',
          useCount: 3,
          richLocation: { ...PLACE, publicDisplayLabel: 'The Bell House', revealPolicy: 'public' },
        },
      }}
      onReview={onReview}
    />);
    expect(screen.getByText('4 more waiting with this text')).toBeInTheDocument();
    expect(screen.getByText(/Also apply to the 4 other waiting events/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use previous match' }));
    expect(onReview).toHaveBeenCalledWith('event-1', 'select_match', expect.objectContaining({
      googlePlaceId: 'ChIJ-example', originalInput: 'Bell House, Gowanus',
    }), { remember: false, applyToMatching: true, candidateSource: 'memory' });
  });

  test('searches Google and saves the typed-in place', async () => {
    jest.useFakeTimers();
    const typed = {
      ...PLACE,
      venueName: 'Littlefield',
      formattedAddress: '635 Sackett St, Brooklyn, NY 11217',
      googlePlaceId: 'ChIJ-typed',
      resolutionConfidence: 1,
    };
    authenticatedRequest.mockImplementation(async (url) => (url.endsWith('/places/search')
      ? { data: { success: true, data: { suggestions: [
        { placeId: 'ChIJ-typed', primaryText: 'Littlefield', secondaryText: 'Sackett St' },
      ] } } }
      : { data: { success: true, data: { place: typed, inScope: false, scopeReason: 'bounds' } } }));
    const onReview = jest.fn();
    render(<PivotLocationReviewInspector candidate={CANDIDATE} onReview={onReview} tenantKey="nyc" />);

    fireEvent.change(screen.getByLabelText('Search Google for a place'), {
      target: { value: 'littlefield' },
    });
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(authenticatedRequest).toHaveBeenCalledWith(
      '/admin/platform/tenants/nyc/rich-location-migration/places/search',
      { params: { q: 'littlefield' } },
    );
    jest.useRealTimers();
    fireEvent.click(await screen.findByRole('option', { name: /Littlefield/ }));
    await waitFor(() => expect(screen.getByText('You picked')).toBeInTheDocument());
    expect(authenticatedRequest).toHaveBeenLastCalledWith(
      '/admin/platform/tenants/nyc/rich-location-migration/places/ChIJ-typed',
      { params: { originalInput: 'Bell House, Gowanus' } },
    );
    expect(screen.getByText("Outside this city's boundary")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Your search: Littlefield/ })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Save location' }));
    expect(onReview).toHaveBeenCalledWith('event-1', 'select_match', expect.objectContaining({
      googlePlaceId: 'ChIJ-typed', publicDisplayLabel: 'Littlefield',
    }), expect.objectContaining({ candidateSource: 'manual_search' }));
  });

  test('keeps advanced JSON edits while the form re-renders', () => {
    render(<PivotLocationReviewInspector candidate={CANDIDATE} onReview={jest.fn()} />);
    const editor = screen.getByLabelText('Rich location representation');
    fireEvent.change(editor, { target: { value: '{"mode":"tbd"}' } });
    expect(editor).toHaveValue('{"mode":"tbd"}');
  });

  test('builds online and TBD representations without precise fields', () => {
    const candidate = { rawLocationText: 'Zoom' };
    expect(buildRepresentation({ mode: 'online', place: PLACE, label: '', area: {}, candidate }))
      .toEqual({ mode: 'online', originalInput: 'Zoom', publicDisplayLabel: 'Online',
        resolutionStatus: 'not_applicable', revealPolicy: 'public' });
    expect(buildRepresentation({ mode: 'physical', place: null, label: 'x', area: {}, candidate }))
      .toBeNull();
  });
});
