const {
  PUBLIC_EVENT_RESOLUTION_LIMITS,
  isCanonicalPublicEventId,
  isConfiguredJustGoTenant,
  planPublicEventResolution,
  classifyPublicEventResolution,
  publicResolutionEnvelope,
} = require('../../events/contracts/publicEventResolutionPolicy');

const EVENT_ID = '64f1234567890abcdef12345';
const SAFE_PROJECTION = { id: EVENT_ID, cityId: 'oakland' };

function tenant(tenantKey, overrides = {}) {
  return {
    tenantKey,
    tenantType: 'pivot',
    status: 'active',
    ...overrides,
  };
}

function eligible(tenantKey = 'oakland') {
  return { state: 'eligible_match', tenantKey, projection: SAFE_PROJECTION };
}

function unavailableEnvelope(classification) {
  return publicResolutionEnvelope(classification);
}

describe('Just Go public event cross-city resolution policy (Phase 1, Step 1.5)', () => {
  it('locks bounded-work defaults', () => {
    expect(PUBLIC_EVENT_RESOLUTION_LIMITS).toEqual({
      maxTenants: 20,
      concurrency: 4,
      perTenantTimeoutMs: 500,
      overallTimeoutMs: 3000,
      mongoMaxTimeMs: 400,
    });
  });

  it.each([
    EVENT_ID.toUpperCase(),
    ` ${EVENT_ID}`,
    EVENT_ID.slice(1),
    `${EVENT_ID}00`,
    'not-an-object-id',
    '',
    null,
  ])('rejects malformed ID %p before tenant work', (eventId) => {
    expect(isCanonicalPublicEventId(eventId)).toBe(false);
    expect(planPublicEventResolution(eventId, [tenant('oakland')])).toEqual({
      ok: false,
      internalState: 'malformed_id',
      tenants: [],
    });
  });

  it('selects only configured consumer-eligible Just Go cities in deterministic order', () => {
    const tenants = [
      tenant('z-city', { status: 'hidden' }),
      tenant('campus', { tenantType: 'campus', pivotPilot: false }),
      tenant('pilot', { tenantType: 'campus', pivotPilot: true }),
      tenant('soon', { status: 'coming_soon' }),
      tenant('maintenance', { status: 'maintenance' }),
      tenant('a-city'),
      tenant(''),
    ];

    expect(tenants.map(isConfiguredJustGoTenant)).toEqual([
      true,
      false,
      true,
      false,
      false,
      true,
      false,
    ]);
    expect(planPublicEventResolution(EVENT_ID, tenants).tenants.map((row) => row.tenantKey)).toEqual([
      'a-city',
      'pilot',
      'z-city',
    ]);
  });

  it('resolves exactly one eligible match after every city completes', () => {
    const result = classifyPublicEventResolution([
      { state: 'no_match', tenantKey: 'brooklyn' },
      eligible('oakland'),
      { state: 'no_match', tenantKey: 'troy' },
    ], 3);

    expect(result).toEqual({
      available: true,
      internalState: 'resolved',
      tenantKey: 'oakland',
      projection: SAFE_PROJECTION,
    });
    expect(publicResolutionEnvelope(result)).toEqual({
      contractVersion: '1',
      data: SAFE_PROJECTION,
    });
  });

  it('returns unavailable when no city matches', () => {
    expect(classifyPublicEventResolution([
      { state: 'no_match', tenantKey: 'oakland' },
      { state: 'no_match', tenantKey: 'troy' },
    ], 2)).toEqual({ available: false, internalState: 'no_match' });
  });

  it.each([
    [
      'two eligible records',
      [eligible('oakland'), eligible('troy')],
    ],
    [
      'one eligible and one private/draft record',
      [eligible('oakland'), { state: 'ineligible_match', tenantKey: 'troy' }],
    ],
    [
      'two ineligible records',
      [
        { state: 'ineligible_match', tenantKey: 'oakland' },
        { state: 'ineligible_match', tenantKey: 'troy' },
      ],
    ],
  ])('rejects collision: %s', (_label, results) => {
    expect(classifyPublicEventResolution(results, 2)).toEqual({
      available: false,
      internalState: 'collision',
    });
  });

  it('returns unavailable for a sole ineligible record', () => {
    expect(classifyPublicEventResolution([
      { state: 'ineligible_match', tenantKey: 'oakland' },
      { state: 'no_match', tenantKey: 'troy' },
    ], 2)).toEqual({ available: false, internalState: 'ineligible' });
  });

  it.each(['timeout', 'database error', 'connection failure'])('%s makes a unique-looking match incomplete', () => {
    expect(classifyPublicEventResolution([
      eligible('oakland'),
      { state: 'inaccessible', tenantKey: 'troy' },
    ], 2)).toEqual({ available: false, internalState: 'incomplete' });
  });

  it('rejects partial result sets and unknown worker results', () => {
    expect(classifyPublicEventResolution([eligible('oakland')], 2)).toEqual({
      available: false,
      internalState: 'incomplete',
    });
    expect(classifyPublicEventResolution([
      eligible('oakland'),
      { state: 'timed_out', tenantKey: 'troy' },
    ], 2)).toEqual({ available: false, internalState: 'incomplete' });
  });

  it('fails closed without querying a partial tenant inventory above the hard cap', () => {
    const tenants = Array.from(
      { length: PUBLIC_EVENT_RESOLUTION_LIMITS.maxTenants + 1 },
      (_, index) => tenant(`city-${index}`),
    );
    expect(planPublicEventResolution(EVENT_ID, tenants)).toEqual({
      ok: false,
      internalState: 'tenant_limit_exceeded',
      tenants: [],
    });
  });

  it('serializes every unavailable cause to the identical public envelope', () => {
    const classifications = [
      { available: false, internalState: 'malformed_id' },
      { available: false, internalState: 'no_match' },
      { available: false, internalState: 'ineligible' },
      { available: false, internalState: 'collision' },
      { available: false, internalState: 'incomplete' },
      { available: false, internalState: 'tenant_limit_exceeded' },
    ];
    const envelopes = classifications.map(unavailableEnvelope);

    expect(new Set(envelopes.map(JSON.stringify))).toEqual(new Set([
      JSON.stringify({
        contractVersion: '1',
        error: { code: 'EVENT_UNAVAILABLE' },
      }),
    ]));
  });
});
