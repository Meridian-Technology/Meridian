const {
  buildRulesExploreSections,
  materializeCuratedSections,
  resolveExploreSections,
  shouldBuildExploreSections,
  EXPLORE_CATEGORY_MIN_EVENTS,
  EXPLORE_SECTION_COPY,
} = require('../../services/pivotExploreSectionsService');

const RAILS = [
  { id: 'friends', title: 'friends going', retrieval: 'friends_rail' },
  { id: 'tonight', title: 'tonight', retrieval: 'filter' },
  { id: 'tag:live-music', title: 'live music', retrieval: 'tag_rail' },
  { id: 'tag:board-games', title: 'board games', retrieval: 'tag_rail' },
];

function mockEvent(id, overrides = {}) {
  return {
    _id: id,
    name: `Event ${id}`,
    start_time: '2026-07-10T23:00:00.000Z',
    displayHost: { name: 'Host' },
    userIntent: null,
    friendsInterested: [],
    friendsGoing: [],
    friendsInterestedCount: 0,
    friendsGoingCount: 0,
    ...overrides,
  };
}

function countAppearances(sections) {
  const counts = new Map();
  for (const section of sections) {
    for (const event of section.events) {
      counts.set(event._id, (counts.get(event._id) ?? 0) + 1);
    }
  }
  return counts;
}

describe('pivotExploreSectionsService', () => {
  describe('shouldBuildExploreSections', () => {
    it('allows default browse filters', () => {
      expect(
        shouldBuildExploreSections({
          tags: [],
          night: null,
          friendsOnly: false,
          excludePassed: true,
          q: null,
          sort: 'for_you',
        }),
      ).toBe(true);
    });

    it('skips sections when search or chip filters are active', () => {
      expect(
        shouldBuildExploreSections({
          tags: [],
          night: null,
          friendsOnly: true,
          q: null,
          sort: 'for_you',
        }),
      ).toBe(false);
      expect(
        shouldBuildExploreSections({
          tags: ['live-music'],
          night: null,
          friendsOnly: false,
          q: null,
          sort: 'for_you',
        }),
      ).toBe(false);
      expect(
        shouldBuildExploreSections({
          tags: [],
          night: 'fri',
          friendsOnly: false,
          q: null,
          sort: 'for_you',
        }),
      ).toBe(false);
      expect(
        shouldBuildExploreSections({
          tags: [],
          night: null,
          friendsOnly: false,
          q: 'jazz',
          sort: 'for_you',
        }),
      ).toBe(false);
    });
  });

  describe('buildRulesExploreSections', () => {
    it('only renders rows with at least three fresh events', () => {
      const events = [
        mockEvent('1', { tags: ['live-music'] }),
        mockEvent('2', { tags: ['live-music'] }),
        mockEvent('3'),
        mockEvent('4'),
      ];

      const sections = buildRulesExploreSections(events, RAILS);

      expect(sections).toHaveLength(1);
      expect(sections[0].id).toBe('trending');
      expect(sections[0].title).toBe(EXPLORE_SECTION_COPY.trending);
      expect(sections[0].layout).toBe('rail');
      expect(sections[0].events.length).toBeGreaterThanOrEqual(
        EXPLORE_CATEGORY_MIN_EVENTS,
      );
      expect(sections[0].events.length).toBeLessThanOrEqual(4);
    });

    it('caps duplicate appearances across rows', () => {
      const events = [
        mockEvent('1', { friendsGoingCount: 1, tags: ['live-music'] }),
        mockEvent('2', { friendsInterestedCount: 2, tags: ['live-music'] }),
        mockEvent('3', { tags: ['live-music', 'board-games'] }),
        mockEvent('4', { tags: ['live-music'] }),
        mockEvent('5', { tags: ['board-games'] }),
      ];

      const sections = buildRulesExploreSections(events, RAILS);
      const appearances = countAppearances(sections);

      for (const count of appearances.values()) {
        expect(count).toBeLessThanOrEqual(2);
      }

      expect(sections.find((section) => section.id === 'friends')).toBeUndefined();
      expect(sections.find((section) => section.id === 'tag:live-music')).toBeUndefined();
    });
  });

  describe('materializeCuratedSections', () => {
    it('maps ordered eventIds to serialized events and preserves layout metadata', () => {
      const eventsById = new Map([
        ['a', mockEvent('a')],
        ['b', mockEvent('b')],
        ['c', mockEvent('c')],
      ]);

      const sections = materializeCuratedSections(
        {
          sections: [
            {
              id: 'staff-picks',
              title: 'staff picks',
              retrieval: 'curated_rail',
              layout: 'grid',
              subtitle: 'hand picked',
              eventIds: ['b', 'missing', 'a', 'a'],
            },
          ],
        },
        eventsById,
      );

      expect(sections).toEqual([
        {
          id: 'staff-picks',
          title: 'staff picks',
          retrieval: 'curated_rail',
          layout: 'grid',
          subtitle: 'hand picked',
          events: [mockEvent('b'), mockEvent('a')],
        },
      ]);
    });
  });

  describe('resolveExploreSections', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('returns rules sections by default', async () => {
      const events = [
        mockEvent('1', { friendsInterestedCount: 1 }),
        mockEvent('2', { friendsInterestedCount: 2 }),
        mockEvent('3', { friendsInterestedCount: 3 }),
      ];

      const result = await resolveExploreSections(
        { school: 'nyc' },
        {
          tenantKey: 'nyc',
          batchWeek: '2026-W28',
          serializedEvents: events,
          rails: RAILS,
          filters: {
            tags: [],
            night: null,
            friendsOnly: false,
            q: null,
          },
        },
      );

      expect(result.sectionsSource).toBe('rules_v0');
      expect(result.sections[0]?.id).toBe('trending');
    });

    it('returns empty sections when filters are active', async () => {
      const result = await resolveExploreSections(
        { school: 'nyc' },
        {
          tenantKey: 'nyc',
          batchWeek: '2026-W28',
          serializedEvents: [mockEvent('1'), mockEvent('2'), mockEvent('3')],
          rails: RAILS,
          filters: {
            tags: [],
            night: null,
            friendsOnly: false,
            q: 'jazz',
          },
        },
      );

      expect(result).toEqual({ sections: [], sectionsSource: 'rules_v0' });
    });

    it('prefers curated sections when loadExploreCuration returns a doc', async () => {
      const events = [
        mockEvent('1'),
        mockEvent('2'),
        mockEvent('3'),
      ];

      const result = await resolveExploreSections(
        { school: 'nyc' },
        {
          tenantKey: 'nyc',
          batchWeek: '2026-W28',
          serializedEvents: events,
          rails: RAILS,
          filters: {
            tags: [],
            night: null,
            friendsOnly: false,
            q: null,
          },
          loadExploreCuration: jest.fn().mockResolvedValue({
            tenantKey: 'nyc',
            batchWeek: '2026-W28',
            sections: [
              {
                id: 'curated-row',
                title: 'curated row',
                retrieval: 'curated_rail',
                eventIds: ['2', '1'],
              },
            ],
          }),
        },
      );

      expect(result.sectionsSource).toBe('curated');
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].events.map((event) => event._id)).toEqual(['2', '1']);
    });
  });
});
