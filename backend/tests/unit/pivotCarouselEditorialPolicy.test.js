const {
  MAX_PUBLICATION_HORIZON_DAYS,
  MAX_RETROSPECTIVE_DAYS,
  ABSOLUTE_MIN_EVENTS,
  CONFIRMED_DEFAULTS,
  PROPOSED_KEYS,
  OPEN_CHOICES,
  computePolicyVersion,
  normalizeEditorialPolicy,
  checkEventEligibility,
  checkSelectionCount,
  validateComposeProposalAgainstPolicy,
  unresolvedPolicyChoices,
  canEnableSchedule,
} = require('../../utilities/pivotCarouselEditorialPolicy');
const {
  PIVOT_CAROUSEL_EDITORIAL_SEEDS,
  findEditorialSeed,
} = require('../../constants/pivotCarouselEditorialSeeds');
const { loadFixture } = require('../../utilities/pivotAdminComputeJobContract');

const DAY_MS = 24 * 60 * 60 * 1000;

function policyFor(seedKey, overrides = {}) {
  const seed = findEditorialSeed(seedKey);
  const result = normalizeEditorialPolicy({
    ...seed,
    settings: { ...seed.settings, ...overrides },
  });
  if (!result.valid) throw new Error(result.errors.join('; '));
  return result.policy;
}

describe('Carousel editorial account policy', () => {
  describe('defaults and proposals', () => {
    it('ships with automation off, posting manual, and paid fallback refused', () => {
      const policy = policyFor('just-go-ic');
      expect(policy.confirmed.schedulingEnabled).toBe(false);
      expect(policy.confirmed.manualPostingOnly).toBe(true);
      expect(policy.confirmed.paidFallbackEnabled).toBe(false);
      expect(policy.confirmed.browsingEnabled).toBe(false);
      expect(policy.confirmed.twoEventExceptionEnabled).toBe(false);
      expect(policy.confirmed.minEvents).toBe(3);
      expect(policy.confirmed.maxEvents).toBe(5);
      expect(policy.confirmed.coverAssetProviders).toEqual(['event-poster', 'unsplash']);
      expect(policy.confirmed.eventSlideAssetProviders).toEqual(['event-poster']);
      expect(policy.confirmed.coverVariationPreference).toBe('prefer-different');
      expect(policy.confirmed.allowCrossMagazineReuse).toBe(true);
    });

    it('keeps user decisions and Relay proposals in separate buckets', () => {
      const policy = policyFor('just-go-ic');
      // Confirmed by the editorial brief: these never appear as open proposals.
      for (const decided of ['minEvents', 'maxEvents', 'horizonDays', 'coverAssetProviders', 'manualPostingOnly']) {
        expect(policy.proposed).not.toHaveProperty(decided);
      }
      // Awaiting an explicit choice, even though a working default is applied.
      for (const open of ['retrospectiveDays', 'twoEventExceptionEnabled', 'browsingEnabled', 'reviewOwner']) {
        expect(policy.proposed).toHaveProperty(open);
        expect(policy.proposed[open]).toEqual(policy.confirmed[open]);
      }
      expect(PROPOSED_KEYS).toEqual(expect.arrayContaining(['retrospectiveDays', 'captionPolicy']));
      expect(policy.openChoices.map((choice) => choice.key))
        .toEqual(OPEN_CHOICES.map((choice) => choice.key));
    });

    it('drops a choice from the proposal list once the account configures it', () => {
      const configured = policyFor('just-go-ic', { retrospectiveDays: 14, browsingEnabled: true });
      expect(configured.proposed).not.toHaveProperty('retrospectiveDays');
      expect(configured.proposed).not.toHaveProperty('browsingEnabled');
      expect(configured.confirmed.retrospectiveDays).toBe(14);

      const remaining = unresolvedPolicyChoices(configured).map((choice) => choice.key);
      expect(remaining).not.toContain('retrospectiveWindow');
      expect(remaining).not.toContain('authorizedBrowsing');
      expect(remaining).toContain('reviewOwner');
    });

    it('refuses to enable a schedule while proposals or the review owner are open', () => {
      expect(canEnableSchedule(policyFor('just-go-ic'))).toEqual({
        allowed: false,
        blockers: expect.arrayContaining([
          'schedulingEnabled is off',
          'no review owner is assigned',
        ]),
      });

      const answered = policyFor('just-go-ic', Object.fromEntries(
        PROPOSED_KEYS.map((key) => [key, CONFIRMED_DEFAULTS[key]]),
      ));
      expect(canEnableSchedule(answered).allowed).toBe(false);
      expect(canEnableSchedule({
        ...answered,
        confirmed: { ...answered.confirmed, schedulingEnabled: true, reviewOwner: 'editor@justgo.lol' },
      }).allowed).toBe(true);
    });

    it('gives every seeded pilot account a distinct, stable policy version', () => {
      const versions = PIVOT_CAROUSEL_EDITORIAL_SEEDS.map((seed) => policyFor(seed.seedKey).policyVersion);
      expect(new Set(versions).size).toBe(versions.length);
      expect(versions.every((version) => /^pol:carousel\.[0-9a-f]{32}$/.test(version))).toBe(true);
      expect(policyFor('just-go-ic').policyVersion).toBe(policyFor('just-go-ic').policyVersion);
      expect(computePolicyVersion({ a: 1, b: 2 }, 'x')).toBe(computePolicyVersion({ b: 2, a: 1 }, 'x'));
      expect(computePolicyVersion({ a: 1 }, 'x')).not.toBe(computePolicyVersion({ a: 2 }, 'x'));
    });

    it('seeds the three pilot accounts without claiming their production mapping', () => {
      expect(PIVOT_CAROUSEL_EDITORIAL_SEEDS.map((seed) => seed.handle)).toEqual([
        '@just.go.ic',
        '@just.go.sf',
        '@sorry.u.missed.it',
      ]);
      expect(PIVOT_CAROUSEL_EDITORIAL_SEEDS.every((seed) => seed.tenantMappingConfirmed === false)).toBe(true);
      expect(findEditorialSeed('sorry-u-missed-it').format).toBe('sorry-you-missed-it');
      expect(findEditorialSeed('sorry-u-missed-it').sourceTenantKeys.length).toBeGreaterThan(1);
      expect(findEditorialSeed('nope')).toBeNull();
    });
  });

  describe('validation', () => {
    it('rejects an unknown setting rather than silently keeping the default', () => {
      const result = normalizeEditorialPolicy({
        ...findEditorialSeed('just-go-ic'),
        settings: { minEventCount: 4 },
      });
      expect(result).toEqual({
        valid: false,
        errors: expect.arrayContaining([expect.stringContaining('settings.minEventCount')]),
      });
    });

    it('refuses a one-event floor, an over-long horizon, and an unbounded retrospective', () => {
      const seed = findEditorialSeed('just-go-ic');
      expect(normalizeEditorialPolicy({ ...seed, settings: { minEvents: 1 } }).errors)
        .toEqual(expect.arrayContaining([expect.stringContaining('single-event issues are never allowed')]));
      expect(normalizeEditorialPolicy({ ...seed, settings: { horizonDays: 15 } }).errors)
        .toEqual(expect.arrayContaining([expect.stringContaining(`1-${MAX_PUBLICATION_HORIZON_DAYS}`)]));
      expect(normalizeEditorialPolicy({ ...seed, settings: { retrospectiveDays: 21 } }).errors)
        .toEqual(expect.arrayContaining([expect.stringContaining(`1-${MAX_RETROSPECTIVE_DAYS}`)]));
      expect(normalizeEditorialPolicy({ ...seed, settings: { minEvents: 5, maxEvents: 3 } }).errors)
        .toEqual(expect.arrayContaining([expect.stringContaining('must not exceed')]));
    });

    it('will not let an account turn posting automatic or paid fallback on', () => {
      const seed = findEditorialSeed('just-go-ic');
      expect(normalizeEditorialPolicy({ ...seed, settings: { manualPostingOnly: false } }).errors)
        .toEqual(expect.arrayContaining([expect.stringContaining('posting is a human action')]));
      expect(normalizeEditorialPolicy({ ...seed, settings: { paidFallbackEnabled: true } }).errors)
        .toEqual(expect.arrayContaining([expect.stringContaining('paid API fallback is out of scope')]));
    });

    it('rejects a malformed account binding', () => {
      expect(normalizeEditorialPolicy({ accountId: 'nope', format: 'city-picks', sourceTenantKeys: ['iowacity'], timezone: 'America/Chicago' }).errors)
        .toEqual(expect.arrayContaining([expect.stringContaining('accountId')]));
      expect(normalizeEditorialPolicy({ format: 'zine', sourceTenantKeys: ['iowacity'] }).errors)
        .toEqual(expect.arrayContaining([expect.stringContaining('format must be one of')]));
      expect(normalizeEditorialPolicy({ format: 'city-picks', sourceTenantKeys: [] }).errors)
        .toEqual(expect.arrayContaining([expect.stringContaining('sourceTenantKeys')]));
      expect(normalizeEditorialPolicy({ format: 'city-picks', sourceTenantKeys: ['iowacity'], timezone: 'Mars/Olympus/Mons/Base' }).errors)
        .toEqual(expect.arrayContaining([expect.stringContaining('IANA timezone')]));
      expect(normalizeEditorialPolicy(null)).toEqual({ valid: false, errors: ['policy must be an object'] });
    });

    it('bounds caption, slot, off-hours, and provider sub-objects', () => {
      const seed = findEditorialSeed('just-go-ic');
      expect(normalizeEditorialPolicy({ ...seed, settings: { captionPolicy: { maxHashtags: 99 } } }).errors)
        .toEqual(expect.arrayContaining([expect.stringContaining('captionPolicy.maxHashtags')]));
      expect(normalizeEditorialPolicy({ ...seed, settings: { preferredPublicationSlot: { weekday: 9 } } }).errors)
        .toEqual(expect.arrayContaining([expect.stringContaining('preferredPublicationSlot.weekday')]));
      expect(normalizeEditorialPolicy({ ...seed, settings: { offHoursWindow: { startHour: 25 } } }).errors)
        .toEqual(expect.arrayContaining([expect.stringContaining('offHoursWindow.startHour')]));
      expect(normalizeEditorialPolicy({ ...seed, settings: { coverAssetProviders: ['generated'] } }).errors)
        .toEqual(expect.arrayContaining([expect.stringContaining('unsupported provider')]));
      expect(normalizeEditorialPolicy({ ...seed, settings: { coverAssetProviders: ['unsplash', 'unsplash'] } }).errors)
        .toEqual(expect.arrayContaining([expect.stringContaining('must not repeat')]));
    });
  });

  describe('publication-relative event eligibility', () => {
    const publicationAt = '2026-10-05T23:00:00.000Z';
    const curation = policyFor('just-go-ic');

    it('accepts a same-day event that has not finished yet', () => {
      expect(checkEventEligibility({
        format: 'city-picks',
        policy: curation,
        eventStart: '2026-10-06T00:30:00.000Z',
        publicationAt,
      })).toEqual({ eligible: true });
    });

    it('accepts an event still running at publication and rejects one already over', () => {
      expect(checkEventEligibility({
        format: 'city-picks',
        policy: curation,
        eventStart: '2026-10-05T22:00:00.000Z',
        eventEnd: '2026-10-06T02:00:00.000Z',
        publicationAt,
      })).toEqual({ eligible: true });

      expect(checkEventEligibility({
        format: 'city-picks',
        policy: curation,
        eventStart: '2026-10-04T22:00:00.000Z',
        eventEnd: '2026-10-05T01:00:00.000Z',
        publicationAt,
      })).toMatchObject({ eligible: false, code: 'EVENT_ALREADY_PASSED' });
    });

    it('holds the fourteen-day cap exactly, including across a DST change', () => {
      const publication = Date.parse(publicationAt);
      expect(checkEventEligibility({
        format: 'city-picks',
        policy: curation,
        eventStart: new Date(publication + 14 * DAY_MS).toISOString(),
        publicationAt,
      })).toEqual({ eligible: true });

      expect(checkEventEligibility({
        format: 'city-picks',
        policy: curation,
        eventStart: new Date(publication + 14 * DAY_MS + 1).toISOString(),
        publicationAt,
      })).toMatchObject({ eligible: false, code: 'BEYOND_PUBLICATION_HORIZON' });

      // America/Chicago leaves daylight time on 2026-11-01; the horizon is
      // publication-relative and must not drift by the extra hour.
      const lateOctober = '2026-10-25T23:00:00.000Z';
      const across = Date.parse(lateOctober);
      expect(checkEventEligibility({
        format: 'city-picks',
        policy: curation,
        eventStart: new Date(across + 14 * DAY_MS).toISOString(),
        publicationAt: lateOctober,
      })).toEqual({ eligible: true });
      expect(checkEventEligibility({
        format: 'city-picks',
        policy: curation,
        eventStart: new Date(across + 15 * DAY_MS).toISOString(),
        publicationAt: lateOctober,
      })).toMatchObject({ eligible: false, code: 'BEYOND_PUBLICATION_HORIZON' });
    });

    it('keeps the cap even when an account tries to configure past it', () => {
      const stretched = { confirmed: { ...curation.confirmed, horizonDays: 90 } };
      const publication = Date.parse(publicationAt);
      expect(checkEventEligibility({
        format: 'city-picks',
        policy: stretched,
        eventStart: new Date(publication + 20 * DAY_MS).toISOString(),
        publicationAt,
      })).toMatchObject({ eligible: false, code: 'BEYOND_PUBLICATION_HORIZON' });
    });

    it('applies the retrospective window backwards and refuses events that have not happened', () => {
      const retro = policyFor('sorry-u-missed-it');
      const publication = Date.parse(publicationAt);

      expect(checkEventEligibility({
        format: 'sorry-you-missed-it',
        policy: retro,
        eventStart: new Date(publication - 2 * DAY_MS).toISOString(),
        publicationAt,
      })).toEqual({ eligible: true });

      expect(checkEventEligibility({
        format: 'sorry-you-missed-it',
        policy: retro,
        eventStart: new Date(publication - 8 * DAY_MS).toISOString(),
        publicationAt,
      })).toMatchObject({ eligible: false, code: 'OUTSIDE_RETROSPECTIVE_WINDOW' });

      expect(checkEventEligibility({
        format: 'sorry-you-missed-it',
        policy: retro,
        eventStart: new Date(publication + DAY_MS).toISOString(),
        publicationAt,
      })).toMatchObject({ eligible: false, code: 'EVENT_NOT_PAST' });

      const expanded = policyFor('sorry-u-missed-it', { retrospectiveDays: 14 });
      expect(checkEventEligibility({
        format: 'sorry-you-missed-it',
        policy: expanded,
        eventStart: new Date(publication - 8 * DAY_MS).toISOString(),
        publicationAt,
      })).toEqual({ eligible: true });
    });

    it('refuses cancelled events and unparseable timestamps', () => {
      expect(checkEventEligibility({
        format: 'city-picks',
        policy: curation,
        eventStart: '2026-10-07T00:00:00.000Z',
        publicationAt,
        cancelled: true,
      })).toMatchObject({ eligible: false, code: 'EVENT_CANCELLED' });

      expect(checkEventEligibility({
        format: 'city-picks',
        policy: curation,
        eventStart: 'soon',
        publicationAt,
      })).toMatchObject({ eligible: false, code: 'INVALID_TIME' });
    });

    it('honours an account that turns same-day posting off', () => {
      const noSameDay = policyFor('just-go-ic', { sameDayAllowed: false });
      expect(checkEventEligibility({
        format: 'city-picks',
        policy: noSameDay,
        eventStart: '2026-10-06T02:00:00.000Z',
        publicationAt,
      })).toMatchObject({ eligible: false, code: 'SAME_DAY_NOT_ALLOWED' });
    });
  });

  describe('selection count', () => {
    const policy = policyFor('just-go-ic');

    it('never allows a single-event issue', () => {
      expect(ABSOLUTE_MIN_EVENTS).toBe(2);
      for (const count of [0, 1]) {
        expect(checkSelectionCount(count, policy)).toEqual({
          valid: false,
          errors: ['An issue needs at least two events; single-event issues are not allowed'],
        });
      }
      const permissive = policyFor('just-go-ic', { minEvents: 2, twoEventExceptionEnabled: true });
      expect(checkSelectionCount(1, permissive).valid).toBe(false);
    });

    it('accepts three to five and refuses six', () => {
      for (const count of [3, 4, 5]) {
        expect(checkSelectionCount(count, policy)).toEqual({ valid: true });
      }
      expect(checkSelectionCount(6, policy)).toEqual({
        valid: false,
        errors: ['An issue may contain at most 5 events'],
      });
    });

    it('refuses two events until the exception is enabled and explained', () => {
      expect(checkSelectionCount(2, policy)).toEqual({
        valid: false,
        errors: ['An issue needs at least 3 events'],
      });

      const withException = policyFor('just-go-ic', { twoEventExceptionEnabled: true });
      expect(checkSelectionCount(2, withException)).toEqual({
        valid: false,
        errors: ['A two-event issue requires a written explanation for admin review'],
      });
      expect(checkSelectionCount(2, withException, {
        exceptionReason: 'Both events are the same artist residency and nothing else fits the angle.',
      })).toEqual({ valid: true });
    });
  });

  describe('proposal against account policy', () => {
    const policy = policyFor('just-go-ic');
    const ready = () => {
      const result = loadFixture('result-compose-valid-ready.json');
      result.decision.basedOnPolicyVersion = policy.policyVersion;
      return result;
    };

    it('accepts the reviewed fixture proposal', () => {
      expect(validateComposeProposalAgainstPolicy(ready(), policy)).toEqual({ valid: true });
    });

    it('rejects a proposal built against a stale policy version', () => {
      const stale = ready();
      stale.decision.basedOnPolicyVersion = 'pol:carousel.00000000000000000000000000000000';
      expect(validateComposeProposalAgainstPolicy(stale, policy)).toEqual({
        valid: false,
        errors: expect.arrayContaining([expect.stringContaining('stale for this account')]),
      });
    });

    it('rejects a cover or event image from a provider this account does not allow', () => {
      const unsplashCover = ready();
      unsplashCover.proposal.cover.asset = {
        provider: 'unsplash',
        assetRef: 'unsplash:photo-abc123',
        credit: 'Photo by A. Photographer on Unsplash',
        creditUrl: 'https://unsplash.com/photos/abc123',
      };
      expect(validateComposeProposalAgainstPolicy(unsplashCover, policy)).toEqual({ valid: true });

      const unsplashSlide = ready();
      unsplashSlide.proposal.eventSlides[1].asset = {
        provider: 'unsplash',
        assetRef: 'unsplash:photo-def456',
        credit: 'Photo by B. Photographer on Unsplash',
        creditUrl: 'https://unsplash.com/photos/def456',
      };
      expect(validateComposeProposalAgainstPolicy(unsplashSlide, policy)).toEqual({
        valid: false,
        errors: expect.arrayContaining([expect.stringContaining('Event slide images must come from')]),
      });

      const substitutionAllowed = policyFor('just-go-ic', {
        eventSlideAssetProviders: ['event-poster', 'unsplash'],
      });
      const rebound = ready();
      rebound.decision.basedOnPolicyVersion = substitutionAllowed.policyVersion;
      rebound.proposal.eventSlides[1].asset = unsplashSlide.proposal.eventSlides[1].asset;
      expect(validateComposeProposalAgainstPolicy(rebound, substitutionAllowed)).toEqual({ valid: true });
    });

    it('enforces the caption conventions and the closing-slide switch', () => {
      const longCaption = ready();
      longCaption.proposal.socialCaption = 'a'.repeat(1201);
      expect(validateComposeProposalAgainstPolicy(longCaption, policy)).toEqual({
        valid: false,
        errors: expect.arrayContaining([expect.stringContaining('exceeds 1200 characters')]),
      });

      const hashtagged = ready();
      hashtagged.proposal.socialCaption = 'go outside #a #b #c #d #e #f';
      expect(validateComposeProposalAgainstPolicy(hashtagged, policy)).toEqual({
        valid: false,
        errors: expect.arrayContaining([expect.stringContaining('hashtags')]),
      });

      const closing = ready();
      closing.proposal.closingSlide = { presetId: 'paper-close', copy: 'see you next week' };
      expect(validateComposeProposalAgainstPolicy(closing, policy)).toEqual({
        valid: false,
        errors: expect.arrayContaining([expect.stringContaining('Closing slides are not enabled')]),
      });
    });

    it('accepts a wait result and refuses a ready decision with nothing attached', () => {
      const wait = loadFixture('result-compose-wait.json');
      wait.decision.basedOnPolicyVersion = policy.policyVersion;
      expect(validateComposeProposalAgainstPolicy(wait, policy)).toEqual({ valid: true });

      const empty = { decision: { disposition: 'ready-for-review', basedOnPolicyVersion: policy.policyVersion }, proposal: null };
      expect(validateComposeProposalAgainstPolicy(empty, policy)).toEqual({
        valid: false,
        errors: ['A ready-for-review decision requires a proposal'],
      });
    });
  });
});
