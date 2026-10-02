const { summarizeBatchQuality } = require('../../services/pivotWeeklyBatchQualityService');

function card(name, right, reached, extra = {}) {
  return { eventId: `id-${name}`, name, right, reached, dealt: true, missingDetails: false, ...extra };
}

describe('summarizeBatchQuality', () => {
  it('totals the batch across cities and picks the cards that carried and fell flat', () => {
    const summary = summarizeBatchQuality([
      {
        name: 'San Francisco',
        events: [
          card('Rooftop Cinema', 9, 12),
          card('Night Market', 4, 10),
          card('Pitch Breakfast', 0, 8, { missingDetails: true }),
          card('Unseen Gallery', 0, 0, { dealt: false }),
        ],
        current: { swipes: 40, right: 13, going: 3 },
        previous: { swipes: 30, right: 6, going: 1 },
        feedback: { feedbackCount: 2, feedbackAvg: 5 },
      },
      {
        name: 'New York City',
        events: [card('Basement Show', 6, 6), card('Headshot Pop-up', 1, 9), card('Tiny Reach', 0, 2)],
        current: { swipes: 20, right: 7, going: 2 },
        previous: { swipes: 10, right: 4, going: 0 },
        feedback: { feedbackCount: 2, feedbackAvg: 4 },
      },
    ]);

    expect(summary).toMatchObject({
      cityCount: 2,
      events: 7,
      dealt: 6,
      landed: 4,
      // Only cards with enough swipes count as passed by everyone.
      passedByAll: 1,
      missingDetails: 1,
      swipes: 60,
      right: 20,
      going: 5,
      swipesPrevious: 40,
      rightPrevious: 10,
      rating: { average: 4.5, count: 4 },
    });
    expect(summary.top.map((row) => row.name)).toEqual(['Rooftop Cinema', 'Basement Show', 'Night Market']);
    expect(summary.top[1]).toEqual({ eventId: 'id-Basement Show', name: 'Basement Show', city: 'New York City', right: 6, reached: 6 });
    expect(summary.misses.map((row) => row.name)).toEqual(['Pitch Breakfast', 'Headshot Pop-up']);
  });

  it('handles an empty week', () => {
    expect(summarizeBatchQuality([])).toMatchObject({
      events: 0,
      swipes: 0,
      rating: null,
      top: [],
      misses: [],
    });
  });
});
