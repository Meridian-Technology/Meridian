const mongoose = require('mongoose');

jest.mock('../../services/getModelService');

const getModels = require('../../services/getModelService');
const {
  runLocationBackfill,
  createProviderPacer,
  confidenceThresholds,
  classifyLegacyLocation,
  normalizeBackfillScope,
  constants,
} = require('../../services/pivotLocationBackfillService');

const TENANT = {
  tenantKey: 'nyc',
  tenantType: 'pivot',
  location: 'New York, NY',
  richLocationConstraints: {
    countryCode: 'US',
    bounds: { north: 41, south: 40, east: -73, west: -75 },
  },
};

function canonical(overrides = {}) {
  return {
    venueName: 'The Hall',
    formattedAddress: '10 Main St, New York, NY 10001, USA',
    addressComponents: [
      { longText: 'New York', shortText: 'New York', types: ['locality'] },
      { longText: 'United States', shortText: 'US', types: ['country'] },
    ],
    city: 'New York',
    region: 'New York',
    postalCode: '10001',
    countryCode: 'US',
    coordinates: { type: 'Point', coordinates: [-74, 40.7] },
    googlePlaceId: 'ChIJ_test_place',
    provider: 'google',
    placeTypes: ['event_venue'],
    aliases: ['10 Main St'],
    resolutionStatus: 'resolved',
    resolutionConfidence: 0.95,
    resolvedAt: new Date('2026-08-01T00:00:00.000Z'),
    publicDisplayLabel: 'The Hall',
    ...overrides,
  };
}

function setPath(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  parts.slice(0, -1).forEach((part) => {
    if (!cursor[part]) cursor[part] = {};
    cursor = cursor[part];
  });
  cursor[parts[parts.length - 1]] = value;
}

function queryResult(value) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function stateSnapshot(value) {
  if (!value) return value;
  return {
    ...value,
    checkpoint: value.checkpoint ? { ...value.checkpoint } : value.checkpoint,
    cumulativeCounts: value.cumulativeCounts ? { ...value.cumulativeCounts } : value.cumulativeCounts,
    auditSummaries: Array.isArray(value.auditSummaries)
      ? value.auditSummaries.map((summary) => ({ ...summary, counts: { ...summary.counts } }))
      : value.auditSummaries,
  };
}

function createModelDoubles(seedEvents = []) {
  const events = seedEvents;
  const runStates = new Map();
  const stateKey = (filter = {}) => filter.batchWeek
    ? `${filter.tenantKey || TENANT.tenantKey}:week:${filter.batchWeek}`
    : `${filter.tenantKey || TENANT.tenantKey}:${filter.scope || 'live'}`;
  const Event = {
    find: jest.fn((query) => {
      let rows = events.filter((event) => (
        event.customFields?.pivot
        && !event.isDeleted
        && event.location
        && (query['customFields.pivot.batchWeek']
          ? event.customFields.pivot.batchWeek === query['customFields.pivot.batchWeek']
          : query.end_time.$gte
            ? event.end_time >= query.end_time.$gte
            : event.end_time < query.end_time.$lt)
        && !event.richLocation
        && !event.customFields.pivot.locationBackfill?.processedAt
        && !event.customFields.pivot.locationReview?.reviewedAt
        && (!query._id?.$gt || String(event._id) > String(query._id.$gt))
      )).sort((first, second) => String(first._id).localeCompare(String(second._id)));
      const chain = {
        sort: jest.fn(() => chain),
        limit: jest.fn((limit) => {
          rows = rows.slice(0, limit);
          return chain;
        }),
        select: jest.fn(() => chain),
        lean: jest.fn(async () => rows),
      };
      return chain;
    }),
    updateOne: jest.fn(async (filter, update) => {
      const event = events.find((row) => String(row._id) === String(filter._id));
      if (!event || event.richLocation || event.customFields.pivot.locationBackfill?.processedAt) {
        return { modifiedCount: 0 };
      }
      Object.entries(update.$set || {}).forEach(([path, value]) => setPath(event, path, value));
      return { modifiedCount: 1 };
    }),
  };
  const PivotLocationBackfillRun = {
    findOne: jest.fn((filter) => queryResult(stateSnapshot(runStates.get(stateKey(filter)) || null))),
    updateOne: jest.fn(async (filter, update) => {
      const key = stateKey(filter);
      const runState = runStates.get(key) || { tenantKey: filter.tenantKey, scope: filter.scope };
      Object.assign(runState, update.$set || {});
      runStates.set(key, runState);
      return { modifiedCount: 1 };
    }),
    findOneAndUpdate: jest.fn(async (filter, update) => {
      const key = stateKey(filter);
      const runState = runStates.get(key) || { tenantKey: filter.tenantKey, scope: filter.scope };
      Object.assign(runState, update.$set || {});
      runStates.set(key, runState);
      return runState;
    }),
  };
  return {
    Event,
    PivotLocationBackfillRun,
    PivotLocationBackfillWeekRun: PivotLocationBackfillRun,
    events,
    state: (scope = 'live') => runStates.get(`${TENANT.tenantKey}:${scope}`) || null,
    setState: (scope, state) => runStates.set(`${TENANT.tenantKey}:${scope}`, {
      tenantKey: TENANT.tenantKey,
      scope,
      ...state,
    }),
  };
}

function eventDoc(location, overrides = {}) {
  const { event: eventOverrides = {}, ...pivotOverrides } = overrides;
  return {
    _id: new mongoose.Types.ObjectId(),
    name: `Event at ${location}`,
    location,
    start_time: new Date('2026-09-10T20:00:00.000Z'),
    end_time: new Date('2026-09-10T22:00:00.000Z'),
    customFields: {
      pivot: {
        ingestStatus: 'published',
        source: 'manual',
        ...pivotOverrides,
      },
    },
    ...eventOverrides,
  };
}

describe('rich-location backfill configuration', () => {
  it('enforces ordered confidence thresholds', () => {
    expect(confidenceThresholds({ autoApplyConfidence: 0.9, reviewConfidence: 0.7 }))
      .toEqual({ autoApplyConfidence: 0.9, reviewConfidence: 0.7 });
    expect(() => confidenceThresholds({ autoApplyConfidence: 0.5, reviewConfidence: 0.8 }))
      .toThrow(/review <= auto-apply/);
  });

  it('paces calls at the configured minimum interval', async () => {
    let now = 1_000;
    const sleeps = [];
    const pacer = createProviderPacer({
      minIntervalMs: 250,
      nowMs: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    });
    await pacer.wait();
    await pacer.wait();
    now += 100;
    await pacer.wait();
    expect(sleeps).toEqual([250, 150]);
  });

  it('caps batch size at a production-safe bound', () => {
    expect(constants.MAX_BATCH_SIZE).toBe(200);
  });

  it('accepts only live and historical scopes', () => {
    expect(normalizeBackfillScope()).toBe('live');
    expect(normalizeBackfillScope('historical')).toBe('historical');
    expect(() => normalizeBackfillScope('archive')).toThrow(/live or historical/);
  });

  it.each([
    ['Online', { kind: 'categorical', mode: 'online' }],
    ['https://zoom.us/j/123', { kind: 'categorical', mode: 'online' }],
    ['Venue TBD', { kind: 'categorical', mode: 'tbd' }],
    ['Near Prospect Park', { kind: 'categorical', mode: 'approximate' }],
    ['Downtown Brooklyn', { kind: 'categorical', mode: 'approximate' }],
    ['New York, NY', { kind: 'categorical', mode: 'approximate' }],
    ['Address revealed after registration', { kind: 'gated', mode: 'registration_gated' }],
    ['The Great Hall', { kind: 'physical', mode: 'physical' }],
  ])('classifies intentional legacy value %s', (input, expected) => {
    expect(classifyLegacyLocation(input, TENANT)).toMatchObject(expected);
  });

  it('treats hybrid text as ambiguous rather than guessing a mode', () => {
    expect(classifyLegacyLocation('Online and in-person')).toEqual({
      kind: 'ambiguous',
      reason: 'mixed_location_modes',
    });
  });
});

describe('runLocationBackfill', () => {
  let models;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function run(overrides = {}) {
    return runLocationBackfill({
      db: {},
      tenantKey: TENANT.tenantKey,
      tenant: TENANT,
      minIntervalMs: 0,
      now: () => new Date('2026-09-01T12:00:00.000Z'),
      googleAdapter: { geocodeAddress: jest.fn().mockResolvedValue(canonical()) },
      ...overrides,
    });
  }

  function useEvents(events) {
    models = createModelDoubles(events);
    getModels.mockReturnValue(models);
    return models;
  }

  it('produces a bounded dry-run without changing events or checkpoints', async () => {
    const source = [eventDoc('First Hall'), eventDoc('Second Hall'), eventDoc('Third Hall')];
    useEvents(source);
    const adapter = { geocodeAddress: jest.fn().mockResolvedValue(canonical()) };

    const result = await run({ dryRun: true, batchSize: 2, googleAdapter: adapter });

    expect(result).toMatchObject({
      dryRun: true,
      status: 'batch_complete',
      hasMore: true,
      counts: { scanned: 2, applied: 2 },
    });
    expect(result.items).toHaveLength(2);
    expect(adapter.geocodeAddress).toHaveBeenCalledTimes(2);
    expect(source.every((event) => event.richLocation === undefined)).toBe(true);
    expect(models.PivotLocationBackfillRun.updateOne).not.toHaveBeenCalled();
    expect(models.PivotLocationBackfillRun.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('resumes from checkpoints and is idempotent while preserving legacy strings', async () => {
    const source = [eventDoc('First Hall'), eventDoc('Second Hall')]
      .sort((first, second) => String(first._id).localeCompare(String(second._id)));
    useEvents(source);
    const first = await run({ batchSize: 1 });
    const second = await run({ batchSize: 1 });
    const third = await run({ batchSize: 1 });

    expect(first.status).toBe('batch_complete');
    expect(second.status).toBe('completed');
    expect(third.counts.scanned).toBe(0);
    expect(third.cumulativeCounts.applied).toBe(2);
    expect(source.map((event) => event.location)).toEqual(['First Hall', 'Second Hall']);
    expect(source[0].richLocation).toMatchObject({
      mode: 'physical',
      originalInput: 'First Hall',
      resolutionStatus: 'resolved',
      revealPolicy: 'public',
    });
    expect(source[0].customFields.pivot.rawLocationText).toBe('First Hall');
    expect(models.state().tenantKey).toBe('nyc');
  });

  it('uses an independent checkpoint and filters events for a selected batch week', async () => {
    const selected = eventDoc('Selected Hall', { batchWeek: '2026-W37' });
    const other = eventDoc('Other Hall', { batchWeek: '2026-W38' });
    useEvents([selected, other]);

    const result = await run({ batchWeek: '2026-W37', batchSize: 10 });

    expect(result).toMatchObject({ batchWeek: '2026-W37', counts: { scanned: 1, applied: 1 } });
    expect(selected.richLocation).toMatchObject({ mode: 'physical' });
    expect(selected.customFields.pivot.locationBackfill.batchWeek).toBe('2026-W37');
    expect(other.richLocation).toBeUndefined();
    expect(models.PivotLocationBackfillWeekRun.findOne).toHaveBeenCalledWith({
      tenantKey: 'nyc',
      batchWeek: '2026-W37',
    });
  });

  it('routes lower-confidence and out-of-scope candidates to ops review', async () => {
    const source = [eventDoc('Possible Hall'), eventDoc('Far Hall')]
      .sort((first, second) => String(first._id).localeCompare(String(second._id)));
    useEvents(source);
    const adapter = {
      geocodeAddress: jest.fn()
        .mockResolvedValueOnce(canonical({ resolutionConfidence: 0.75 }))
        .mockResolvedValueOnce(canonical({
          resolutionConfidence: 0.99,
          coordinates: { type: 'Point', coordinates: [-122.4, 37.8] },
        })),
    };
    const result = await run({ batchSize: 10, googleAdapter: adapter });

    expect(result.counts).toMatchObject({ scanned: 2, applied: 0, needsReview: 2 });
    expect(source[0].richLocation).toBeUndefined();
    expect(source[0].customFields.pivot.locationReview).toMatchObject({
      status: 'needs_review',
      reason: 'confidence_below_auto_apply',
      source: 'rich_location_backfill',
    });
    expect(source[0].customFields.pivot.locationReview.candidateMatches).toHaveLength(1);
    expect(source[1].customFields.pivot.locationReview.reason).toBe('out_of_scope');
  });

  it('honors configured confidence thresholds in apply decisions', async () => {
    const applyEvent = eventDoc('Threshold Apply Hall');
    useEvents([applyEvent]);
    const applyResult = await run({
      autoApplyConfidence: 0.8,
      reviewConfidence: 0.6,
      googleAdapter: {
        geocodeAddress: jest.fn().mockResolvedValue(canonical({ resolutionConfidence: 0.85 })),
      },
    });
    expect(applyResult.counts.applied).toBe(1);

    const reviewEvent = eventDoc('Threshold Review Hall');
    useEvents([reviewEvent]);
    const reviewResult = await run({
      autoApplyConfidence: 0.9,
      reviewConfidence: 0.6,
      googleAdapter: {
        geocodeAddress: jest.fn().mockResolvedValue(canonical({ resolutionConfidence: 0.85 })),
      },
    });
    expect(reviewResult.counts).toMatchObject({ applied: 0, needsReview: 1 });
    expect(reviewEvent.customFields.pivot.locationReview.reason)
      .toBe('confidence_below_auto_apply');
  });

  it('applies intentional online, TBD, and approximate modes without provider calls', async () => {
    const source = [
      eventDoc('Online'),
      eventDoc('Location TBD'),
      eventDoc('Near Prospect Park'),
    ].sort((first, second) => String(first._id).localeCompare(String(second._id)));
    useEvents(source);
    const adapter = { geocodeAddress: jest.fn() };

    const result = await run({ batchSize: 10, googleAdapter: adapter });

    expect(result.counts).toMatchObject({
      scanned: 3,
      applied: 3,
      online: 1,
      tbd: 1,
      approximate: 1,
      physical: 0,
    });
    expect(adapter.geocodeAddress).not.toHaveBeenCalled();
    expect(source.map((event) => event.richLocation.mode).sort())
      .toEqual(['approximate', 'online', 'tbd']);
    expect(source.find((event) => event.richLocation.mode === 'approximate').richLocation)
      .toMatchObject({
        originalInput: 'Near Prospect Park',
        approximateLabel: 'Near Prospect Park',
        countryCode: 'US',
        resolutionStatus: 'not_applicable',
      });
  });

  it('routes explicit gated and mixed-mode values to review without provider calls', async () => {
    const source = [
      eventDoc('Address revealed after registration'),
      eventDoc('Hybrid - online and in-person'),
    ].sort((first, second) => String(first._id).localeCompare(String(second._id)));
    useEvents(source);
    const adapter = { geocodeAddress: jest.fn() };

    const result = await run({ batchSize: 10, googleAdapter: adapter });

    expect(result.counts).toMatchObject({
      needsReview: 2,
      registrationGated: 1,
      ambiguous: 1,
    });
    expect(adapter.geocodeAddress).not.toHaveBeenCalled();
    expect(source[0].customFields.pivot.locationReview).toMatchObject({
      status: 'needs_review',
      suggestedMode: 'registration_gated',
    });
    expect(source[1].customFields.pivot.locationReview.reason).toBe('mixed_location_modes');
  });

  it('processes only non-deleted current/future events and preserves reviewed overrides', async () => {
    const current = eventDoc('Current Hall', {
      event: {
        start_time: new Date('2026-08-31T22:00:00.000Z'),
        end_time: new Date('2026-09-01T13:00:00.000Z'),
      },
    });
    const future = eventDoc('Future Hall');
    const past = eventDoc('Past Hall', {
      event: { end_time: new Date('2026-08-31T23:00:00.000Z') },
    });
    const deleted = eventDoc('Deleted Hall', { event: { isDeleted: true } });
    const reviewed = eventDoc('Reviewed Hall', {
      locationReview: {
        status: 'needs_review',
        reviewedAt: '2026-08-30T00:00:00.000Z',
        lastDecision: 'reject_match',
      },
    });
    const source = [current, future, past, deleted, reviewed]
      .sort((first, second) => String(first._id).localeCompare(String(second._id)));
    useEvents(source);
    const adapter = { geocodeAddress: jest.fn().mockResolvedValue(canonical()) };

    const result = await run({ batchSize: 10, googleAdapter: adapter });

    expect(result.counts.scanned).toBe(2);
    expect(adapter.geocodeAddress).toHaveBeenCalledTimes(2);
    expect(current.richLocation.mode).toBe('physical');
    expect(future.richLocation.mode).toBe('physical');
    expect(past.richLocation).toBeUndefined();
    expect(deleted.richLocation).toBeUndefined();
    expect(reviewed.richLocation).toBeUndefined();
    expect(reviewed.customFields.pivot.locationReview.lastDecision).toBe('reject_match');
  });

  it('routes multiple provider matches to review instead of auto-applying', async () => {
    const source = [eventDoc('Common Hall')];
    useEvents(source);
    const matches = [
      canonical(),
      canonical({ venueName: 'The Other Hall', googlePlaceId: 'ChIJ_other_place' }),
    ];
    const result = await run({
      googleAdapter: {
        geocodeAddress: jest.fn().mockResolvedValue(canonical({
          _backfillMatchCount: 2,
          _backfillCandidates: matches,
        })),
      },
    });

    expect(result.counts).toMatchObject({ applied: 0, needsReview: 1, ambiguous: 1 });
    expect(source[0].richLocation).toBeUndefined();
    expect(source[0].customFields.pivot.locationReview.reason)
      .toBe('ambiguous_provider_matches');
    expect(source[0].customFields.pivot.locationReview.candidateMatches)
      .toHaveLength(2);
    expect(source[0].customFields.pivot.locationReview.candidateMatches[1])
      .toMatchObject({ venueName: 'The Other Hall', googlePlaceId: 'ChIJ_other_place' });
  });

  it('keeps unique broad-geography provider results approximate', async () => {
    const source = [eventDoc('Williamsburg')];
    useEvents(source);
    const result = await run({
      googleAdapter: {
        geocodeAddress: jest.fn().mockResolvedValue(canonical({
          venueName: undefined,
          publicDisplayLabel: 'Williamsburg',
          neighborhood: 'Williamsburg',
          placeTypes: ['neighborhood', 'political'],
          resolutionConfidence: 0.95,
        })),
      },
    });

    expect(result.counts).toMatchObject({
      applied: 1,
      physical: 0,
      approximate: 1,
    });
    expect(source[0].richLocation).toMatchObject({
      mode: 'approximate',
      originalInput: 'Williamsburg',
      approximateLabel: 'Williamsburg',
      neighborhood: 'Williamsburg',
    });
    expect(source[0].richLocation).not.toHaveProperty('coordinates');
    expect(source[0].richLocation).not.toHaveProperty('googlePlaceId');
  });

  it('requires explicit stability confirmation before any historical pass', async () => {
    useEvents([eventDoc('Past Hall', {
      event: { end_time: new Date('2026-08-01T00:00:00.000Z') },
    })]);
    models.setState('live', { status: 'completed', cumulativeCounts: {} });

    await expect(run({ scope: 'historical' })).rejects.toMatchObject({
      code: 'LIVE_CATALOG_STABILITY_CONFIRMATION_REQUIRED',
    });
    expect(models.Event.find).not.toHaveBeenCalled();
    expect(models.state('historical')).toBeNull();
  });

  it('requires the live backfill to complete before historical processing', async () => {
    useEvents([eventDoc('Past Hall', {
      event: { end_time: new Date('2026-08-01T00:00:00.000Z') },
    })]);
    models.setState('live', { status: 'batch_complete', cumulativeCounts: {} });

    await expect(run({
      scope: 'historical',
      liveCatalogStable: true,
    })).rejects.toMatchObject({ code: 'LIVE_LOCATION_BACKFILL_INCOMPLETE' });
    expect(models.Event.find).not.toHaveBeenCalled();
  });

  it('uses the same apply and review workflow for historical events only', async () => {
    const physicalPast = eventDoc('Historic Hall', {
      event: { end_time: new Date('2026-07-01T00:00:00.000Z') },
    });
    const gatedPast = eventDoc('Address revealed after registration', {
      event: { end_time: new Date('2026-06-01T00:00:00.000Z') },
    });
    const current = eventDoc('Current Hall');
    useEvents([physicalPast, gatedPast, current]
      .sort((first, second) => String(first._id).localeCompare(String(second._id))));
    models.setState('live', {
      status: 'completed',
      catalogAsOf: new Date('2026-09-01T12:00:00.000Z'),
      cumulativeCounts: { scanned: 10, applied: 8 },
    });

    const result = await run({
      scope: 'historical',
      liveCatalogStable: true,
      batchSize: 10,
    });

    expect(result).toMatchObject({
      scope: 'historical',
      status: 'completed',
      counts: { scanned: 2, applied: 1, needsReview: 1, registrationGated: 1 },
    });
    expect(physicalPast.richLocation.mode).toBe('physical');
    expect(physicalPast.customFields.pivot.locationBackfill.scope).toBe('historical');
    expect(gatedPast.customFields.pivot.locationReview).toMatchObject({
      status: 'needs_review',
      suggestedMode: 'registration_gated',
    });
    expect(gatedPast.customFields.pivot.locationBackfill.scope).toBe('historical');
    expect(current.richLocation).toBeUndefined();
    expect(models.state('live').cumulativeCounts).toEqual({ scanned: 10, applied: 8 });
    expect(models.state('historical')).toMatchObject({
      scope: 'historical',
      status: 'completed',
      cumulativeCounts: { scanned: 2 },
    });
  });

  it('resumes historical batches independently with a frozen catalog cutoff', async () => {
    const source = [
      eventDoc('Online', { event: { end_time: new Date('2026-05-01T00:00:00.000Z') } }),
      eventDoc('Venue TBD', { event: { end_time: new Date('2026-06-01T00:00:00.000Z') } }),
    ].sort((first, second) => String(first._id).localeCompare(String(second._id)));
    useEvents(source);
    models.setState('live', { status: 'completed', cumulativeCounts: { scanned: 4 } });

    const first = await run({
      scope: 'historical',
      liveCatalogStable: true,
      batchSize: 1,
      asOf: '2026-09-01T12:00:00.000Z',
    });
    const second = await run({
      scope: 'historical',
      liveCatalogStable: true,
      batchSize: 1,
    });

    expect(first.status).toBe('batch_complete');
    expect(second.status).toBe('completed');
    expect(second.cumulativeCounts).toMatchObject({ scanned: 2, applied: 2 });
    expect(second.catalogAsOf).toEqual(new Date('2026-09-01T12:00:00.000Z'));
    expect(models.state('historical').checkpoint.lastEventId).toEqual(source[1]._id);
    expect(models.state('live').checkpoint).toBeUndefined();

    await expect(run({
      scope: 'historical',
      liveCatalogStable: true,
      asOf: '2026-10-01T00:00:00.000Z',
    })).rejects.toMatchObject({ code: 'LOCATION_BACKFILL_CUTOFF_MISMATCH' });
  });

  it('defers over-quota provider work and resumes from the unchanged checkpoint', async () => {
    const source = [
      eventDoc('Online'),
      eventDoc('First Physical Hall'),
      eventDoc('Second Physical Hall'),
    ].sort((first, second) => String(first._id).localeCompare(String(second._id)));
    useEvents(source);
    const adapter = { geocodeAddress: jest.fn().mockResolvedValue(canonical()) };

    const first = await run({
      batchSize: 10,
      maxProviderOperations: 1,
      googleAdapter: adapter,
    });

    expect(first).toMatchObject({
      status: 'quota_reached',
      hasMore: true,
      counts: {
        scanned: 2,
        applied: 2,
        providerOperations: 1,
        quotaStops: 1,
      },
    });
    expect(first.items.at(-1)).toMatchObject({ outcome: 'quota_deferred' });
    expect(adapter.geocodeAddress).toHaveBeenCalledTimes(1);
    expect(source[2].richLocation).toBeUndefined();
    expect(models.state().checkpoint.lastEventId).toEqual(source[1]._id);
    expect(models.state().lastBatch.maxProviderOperations).toBe(1);

    const resumed = await run({ maxProviderOperations: 1 });
    expect(resumed.status).toBe('completed');
    expect(resumed.counts).toMatchObject({ scanned: 1, applied: 1, providerOperations: 1 });
    expect(resumed.cumulativeCounts).toMatchObject({
      scanned: 3,
      applied: 3,
      providerOperations: 2,
      quotaStops: 1,
    });
    expect(source[2].richLocation.mode).toBe('physical');
  });

  it('continues after a terminal partial failure and checkpoints later successes', async () => {
    const source = [eventDoc('Missing Hall'), eventDoc('Resolved Hall')]
      .sort((first, second) => String(first._id).localeCompare(String(second._id)));
    useEvents(source);
    const terminal = Object.assign(new Error('not found'), {
      code: 'GOOGLE_GEOCODE_NOT_FOUND',
      retryable: false,
    });
    const adapter = {
      geocodeAddress: jest.fn()
        .mockRejectedValueOnce(terminal)
        .mockResolvedValueOnce(canonical()),
    };

    const result = await run({ batchSize: 10, googleAdapter: adapter });

    expect(result).toMatchObject({
      status: 'completed',
      counts: {
        scanned: 2,
        applied: 1,
        needsReview: 1,
        providerFailures: 1,
        providerOperations: 2,
      },
    });
    expect(source[0].customFields.pivot.locationReview.reason).toBe('unmatched_physical');
    expect(source[1].richLocation.mode).toBe('physical');
    expect(models.state().checkpoint.lastEventId).toEqual(source[1]._id);
  });

  it('preserves partial progress when a later retryable failure pauses the batch', async () => {
    const source = [eventDoc('Resolved First'), eventDoc('Retry Second')]
      .sort((first, second) => String(first._id).localeCompare(String(second._id)));
    useEvents(source);
    const retryable = Object.assign(new Error('temporary'), {
      code: 'GOOGLE_LOCATION_UNAVAILABLE',
      retryable: true,
    });
    const adapter = {
      geocodeAddress: jest.fn()
        .mockResolvedValueOnce(canonical())
        .mockRejectedValueOnce(retryable),
    };

    const first = await run({ batchSize: 10, googleAdapter: adapter });

    expect(first).toMatchObject({
      status: 'paused',
      counts: { scanned: 2, applied: 1, providerFailures: 1, providerOperations: 2 },
    });
    expect(source[0].richLocation.mode).toBe('physical');
    expect(source[1].richLocation).toBeUndefined();
    expect(models.state().checkpoint.lastEventId).toEqual(source[0]._id);

    const resumed = await run();
    expect(resumed.status).toBe('completed');
    expect(resumed.counts).toMatchObject({ scanned: 1, applied: 1 });
    expect(source[1].richLocation.mode).toBe('physical');
  });

  it('pauses without advancing past an exhausted retryable provider failure', async () => {
    const source = [eventDoc('Retry Hall')];
    useEvents(source);
    const retryable = Object.assign(new Error('private provider detail'), {
      code: 'GOOGLE_LOCATION_UNAVAILABLE',
      retryable: true,
      attempts: 3,
    });
    const failed = await run({
      googleAdapter: { geocodeAddress: jest.fn().mockRejectedValue(retryable) },
    });

    expect(failed).toMatchObject({
      status: 'paused',
      hasMore: true,
      checkpoint: null,
      counts: { scanned: 1, providerFailures: 1 },
    });
    expect(source[0].richLocation).toBeUndefined();
    expect(models.state().status).toBe('paused');
    expect(models.state().lastBatch.lastErrorCode).toBe('GOOGLE_LOCATION_UNAVAILABLE');
    expect(JSON.stringify(models.state().lastBatch)).not.toContain('private provider detail');

    const resumed = await run();
    expect(resumed.counts.applied).toBe(1);
    expect(resumed.cumulativeCounts.providerFailures).toBe(1);
    expect(source[0].richLocation.mode).toBe('physical');
  });

  it('records terminal failures for review without storing provider error text in audits', async () => {
    const source = [eventDoc('Unknown Hall')];
    useEvents(source);
    const terminal = Object.assign(new Error('address and secret response body'), {
      code: 'GOOGLE_GEOCODE_NOT_FOUND',
      retryable: false,
    });
    const result = await run({
      googleAdapter: { geocodeAddress: jest.fn().mockRejectedValue(terminal) },
    });

    expect(result.status).toBe('completed');
    expect(result.counts).toMatchObject({ providerFailures: 1, needsReview: 1 });
    expect(source[0].customFields.pivot.locationReview.reason).toBe('unmatched_physical');
    expect(JSON.stringify(models.state().auditSummaries)).not.toContain('Unknown Hall');
    expect(JSON.stringify(models.state().auditSummaries)).not.toContain('secret response body');
  });
});
