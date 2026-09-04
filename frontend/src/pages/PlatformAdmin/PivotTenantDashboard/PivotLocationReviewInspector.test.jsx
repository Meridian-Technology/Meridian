process.env.REACT_APP_GOOGLE_MAPS_EMBED_API_KEY = 'browser-key';

jest.mock('@iconify-icon/react', () => ({ Icon: () => null }));

const React = require('react');
const { fireEvent, render, screen } = require('@testing-library/react');
const {
  default: PivotLocationReviewInspector,
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

  test('shows source and Google evidence before approval', () => {
    const onReview = jest.fn();
    render(<PivotLocationReviewInspector candidate={CANDIDATE} onReview={onReview} />);

    expect(screen.getByText('Google found multiple plausible places')).toBeInTheDocument();
    expect(screen.getByText('Bell House, Gowanus')).toBeInTheDocument();
    expect(screen.getByText('The Bell House')).toBeInTheDocument();
    expect(screen.getByText('3 possible matches')).toBeInTheDocument();
    expect(screen.getByTitle('Map of The Bell House')).toHaveAttribute(
      'src',
      expect.stringContaining('place_id%3AChIJ-example'),
    );

    fireEvent.click(screen.getByRole('button', { name: /2\. Union Hall/ }));
    expect(screen.getAllByText('702 Union St, Brooklyn, NY 11215')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Use Google' }));
    expect(onReview).toHaveBeenCalledWith('event-1', 'select_match', SECOND_PLACE);

    fireEvent.click(screen.getByRole('button', { name: 'Mark location TBD' }));
    expect(onReview).toHaveBeenCalledWith('event-1', 'correct_representation', {
      mode: 'tbd',
      originalInput: 'Bell House, Gowanus',
      publicDisplayLabel: 'Location TBD',
      resolutionStatus: 'not_applicable',
      revealPolicy: 'public',
    });
  });
});
