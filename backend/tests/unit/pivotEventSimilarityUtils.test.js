const {
  mergeDuplicateThresholds,
  normalizeVenueName,
  stripVenueFromTitle,
  titleSimilarity,
  venueSimilarity,
  scoreEventSimilarity,
  showtimeGroupKey,
} = require('../../utilities/pivotEventSimilarityUtils');

describe('pivotEventSimilarityUtils', () => {
  const night = '2026-07-12T00:00:00.000Z';

  it('strips filler words from venue names', () => {
    expect(normalizeVenueName("The Chapel, SF")).toBe('chapel sf');
    expect(normalizeVenueName("Gabe's Bar")).toBe('gabe s');
  });

  it('strips a venue suffix from the title', () => {
    expect(stripVenueFromTitle('Comedy Night at The Chapel', 'The Chapel')).toBe('comedy night');
  });

  it('scores Comedy Night at Bar X against Comedy Night at the same bar', () => {
    expect(
      titleSimilarity('Comedy Night at Bar X', 'Comedy Night', 'Bar X', 'Bar X'),
    ).toBeGreaterThan(0.9);
  });

  it('treats same-title same-venue different times as a showtime match', () => {
    const scored = scoreEventSimilarity(
      {
        name: 'Comedy Night',
        location: "Gabe's, Iowa City",
        start_time: '2026-08-14T01:00:00.000Z',
      },
      {
        name: 'Comedy Night',
        location: "Gabe's",
        start_time: '2026-08-14T03:30:00.000Z',
      },
    );

    expect(scored.match).toBe(true);
    expect(scored.showtime).toBe(true);
    expect(scored.sameDay).toBe(true);
  });

  it('does not merge the same generic title at different venues', () => {
    const scored = scoreEventSimilarity(
      {
        name: 'Comedy Night',
        location: 'The Chapel',
        start_time: night,
      },
      {
        name: 'Comedy Night',
        location: 'Neck of the Woods',
        start_time: night,
      },
    );

    expect(scored.match).toBe(false);
    expect(scored.showtime).toBe(false);
  });

  it('does not match when either venue is missing', () => {
    const scored = scoreEventSimilarity(
      { name: 'Comedy Night', location: '', start_time: night },
      { name: 'Comedy Night', location: 'The Chapel', start_time: night },
    );
    expect(scored.match).toBe(false);
    expect(scored.reasons).toContain('missing-venue');
  });

  it('builds a showtime group key from title, venue, and UTC day', () => {
    expect(
      showtimeGroupKey({
        name: 'Comedy Night at Gabe\'s',
        location: "Gabe's",
        start_time: '2026-08-14T01:00:00.000Z',
      }),
    ).toBe('comedy night|gabe s|2026-08-14');
  });

  it('clamps tenant threshold overrides', () => {
    const merged = mergeDuplicateThresholds({ titleMin: 1.4, timeWindowHours: 99 });
    expect(merged.titleMin).toBe(1);
    expect(merged.timeWindowHours).toBe(24);
  });

  it('scores a slightly renamed listing at the same venue as similar', () => {
    const scored = scoreEventSimilarity(
      {
        name: 'Sunset Listening Party',
        location: 'Brooklyn Bridge Park',
        start_time: '2026-07-12T22:00:00.000Z',
      },
      {
        name: 'Sunset Listening Party at Brooklyn Bridge Park',
        location: 'Brooklyn Bridge Park',
        start_time: '2026-07-12T22:00:00.000Z',
      },
    );
    expect(scored.match).toBe(true);
    expect(scored.showtime).toBe(false);
    expect(venueSimilarity('Brooklyn Bridge Park', 'Brooklyn Bridge Park')).toBe(1);
  });
});
