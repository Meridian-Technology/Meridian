const {
  PUBLIC_EVENT_SELECT,
  projectPublicEvent,
  lookupPublicEvent,
} = require('../../events/services/publicEventService');

const EVENT_ID = '64f1234567890abcdef12345';
const NOW = new Date('2026-09-05T01:00:00.000Z');

function tenant(key = 'oakland', overrides = {}) {
  return {
    tenantKey: key,
    tenantType: 'pivot',
    status: 'active',
    pivotDropTimezone: 'America/Los_Angeles',
    ...overrides,
  };
}

function event(overrides = {}) {
  return {
    _id: EVENT_ID,
    name: ' Movie night ',
    description: 'Bring a blanket.',
    image: 'https://images.example.test/event.jpg',
    start_time: new Date('2026-09-05T02:00:00.000Z'),
    end_time: new Date('2026-09-05T04:00:00.000Z'),
    location: ' Civic Center Lawn ',
    status: 'approved',
    visibility: 'public',
    isDeleted: false,
    externalLink: null,
    registrationEnabled: true,
    registrationCount: 0,
    hostingType: 'Org',
    hostingId: '64f1234567890abcdef99999',
    customFields: {
      pivot: {
        ingestStatus: 'published',
        host: { name: 'Night Owl Cinema' },
      },
    },
    ...overrides,
  };
}

function projection(source = event(), sourceTenant = tenant(), options = {}) {
  return projectPublicEvent(source, sourceTenant, {
    now: NOW,
    technicalHostResolved: true,
    formResolved: true,
    ...options,
  });
}

function query(value) {
  return {
    select: jest.fn(function select() { return this; }),
    maxTimeMS: jest.fn(function maxTimeMS() { return this; }),
    lean: jest.fn().mockResolvedValue(value),
  };
}

function exists(value = true) {
  return { maxTimeMS: jest.fn().mockResolvedValue(value ? { _id: 'resolved' } : null) };
}

function dependencies(records, tenants = Object.keys(records).map((key) => tenant(key))) {
  const models = new Map();
  for (const [key, value] of Object.entries(records)) {
    models.set(key, {
      Event: { findById: jest.fn(() => query(value)) },
      Org: { exists: jest.fn(() => exists(true)) },
      Form: { exists: jest.fn(() => exists(true)) },
    });
  }
  return {
    getTenants: jest.fn().mockResolvedValue(tenants),
    connectToDatabase: jest.fn(async (key) => ({ key })),
    getModels: jest.fn(({ db }) => models.get(db.key)),
  };
}

describe('Just Go public event safe projection', () => {
  it('emits only the approved v1 fields and derives lifecycle and in-app capability', () => {
    const result = projection(event({
      description: '<b>Bring</b>   a blanket.',
      attendees: [{ email: 'private@example.test' }],
      contact: 'private@example.test',
    }));

    expect(result).toEqual({
      id: EVENT_ID,
      title: 'Movie night',
      description: 'Bring a blanket.',
      image: { url: 'https://images.example.test/event.jpg' },
      startsAt: '2026-09-05T02:00:00.000Z',
      endsAt: '2026-09-05T04:00:00.000Z',
      timezone: 'America/Los_Angeles',
      venue: { text: 'Civic Center Lawn' },
      organizer: { name: 'Night Owl Cinema', imageUrl: null, profileUrl: null },
      lifecycleStatus: 'upcoming',
      registrationCapability: 'in_app',
      cityId: 'oakland',
      canonicalUrl: `https://justgo.lol/events/${EVENT_ID}`,
      socialPreview: {
        title: 'Movie night',
        description: 'Bring a blanket.',
        imageUrl: 'https://images.example.test/event.jpg',
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/attendees|private@example|contact/);
  });

  it('uses all valid time slots for the effective interval and preserves ended events', () => {
    const result = projection(event({
      customFields: {
        pivot: {
          ingestStatus: 'published',
          host: { name: 'Cinema' },
          timeSlots: [
            { start_time: '2026-09-04T22:00:00Z', end_time: '2026-09-04T23:00:00Z' },
            { start_time: '2026-09-05T00:00:00Z' },
          ],
        },
      },
    }));
    expect(result).toMatchObject({
      startsAt: '2026-09-04T22:00:00.000Z',
      endsAt: '2026-09-05T00:00:00.000Z',
      lifecycleStatus: 'ended',
      registrationCapability: 'none',
    });
  });

  it('prefers valid external registration and never exposes its destination', () => {
    const result = projection(event({ externalLink: 'https://tickets.example.test/buy' }));
    expect(result.registrationCapability).toBe('external');
    expect(result).not.toHaveProperty('externalLink');
  });

  it('skips unsafe image candidates and truncates without splitting Unicode', () => {
    const source = event({ name: `${'a'.repeat(119)}😀tail` });
    source.customFields.pivot.movie = {
      backdropUrl: 'http://unsafe.example.test/backdrop.jpg',
      posterUrl: 'https://images.example.test/poster.jpg',
    };
    const result = projection(source);
    expect(result.image).toEqual({ url: 'https://images.example.test/poster.jpg' });
    expect(result.socialPreview.title).toBe('a'.repeat(119));
    expect(result.socialPreview.title).not.toContain('\ud83d');
  });

  it.each([
    ['private', { visibility: 'private' }, tenant()],
    ['draft workflow', { status: 'draft' }, tenant()],
    ['unpublished', { customFields: { pivot: { ingestStatus: 'staged', host: { name: 'Host' } } } }, tenant()],
    ['removed', { isDeleted: true }, tenant()],
    ['missing host', { customFields: { pivot: { ingestStatus: 'published', host: {} } } }, tenant()],
    ['invalid interval', { end_time: new Date('2026-09-04') }, tenant()],
    ['invalid timezone', {}, tenant('oakland', { pivotDropTimezone: 'Not/AZone' })],
  ])('rejects %s events', (_label, overrides, sourceTenant) => {
    expect(projection(event(overrides), sourceTenant)).toBeNull();
  });

  it('rejects malformed slot collections rather than guessing from valid entries', () => {
    const source = event();
    source.customFields.pivot.timeSlots = [
      { start_time: '2026-09-05T02:00:00Z' },
      { start_time: 'bad-date' },
    ];
    expect(projection(source)).toBeNull();
  });

  it('keeps the database selection allowlisted', () => {
    expect(PUBLIC_EVENT_SELECT).not.toMatch(/attendees|contact|approvalReference|reservation|deletedAt/);
    expect(PUBLIC_EVENT_SELECT).toMatch(/customFields\.pivot\.host\.name/);
    expect(PUBLIC_EVENT_SELECT).toMatch(/richLocation/);
  });

  it('adds only public-safe rich location fields when city reads are enabled', () => {
    const source = event({
      richLocation: {
        mode: 'registration_gated',
        venueName: 'Supper Club',
        formattedAddress: '123 Private St, Oakland, CA 94612',
        addressComponents: [{ longText: 'Oakland', types: ['locality'] }],
        neighborhood: 'Uptown',
        city: 'Oakland',
        region: 'California',
        postalCode: '94612',
        countryCode: 'US',
        coordinates: { type: 'Point', coordinates: [-122.27, 37.81] },
        googlePlaceId: 'ChIJ-private',
        resolutionStatus: 'resolved',
        publicDisplayLabel: 'Supper Club · Uptown',
        revealPolicy: 'registered_only',
      },
    });
    const enabledTenant = tenant('oakland', {
      richLocationControls: { rollout: 'on', reads: true },
    });

    const result = projection(source, enabledTenant);

    expect(result.venue).toEqual({ text: 'Civic Center Lawn' });
    expect(result.richLocation).toMatchObject({
      mode: 'registration_gated',
      publicDisplayLabel: 'Supper Club · Uptown',
      venueName: 'Supper Club',
      city: 'Oakland',
      revealPolicy: 'registered_only',
    });
    expect(result.richLocation).not.toHaveProperty('formattedAddress');
    expect(result.richLocation).not.toHaveProperty('coordinates');
    expect(result.richLocation).not.toHaveProperty('googlePlaceId');
    expect(projection(source)).not.toHaveProperty('richLocation');
  });
});

describe('Just Go cross-city public event lookup', () => {
  it('returns one uniquely resolved safe projection after checking every city', async () => {
    const deps = dependencies({ oakland: event(), troy: null });
    await expect(lookupPublicEvent(EVENT_ID, deps, { now: NOW })).resolves.toMatchObject({
      contractVersion: '1',
      data: { id: EVENT_ID, cityId: 'oakland' },
    });
    expect(deps.connectToDatabase).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['no match', { oakland: null, troy: null }],
    ['eligible collision', { oakland: event(), troy: event() }],
    ['eligible plus private collision', { oakland: event(), troy: event({ visibility: 'private' }) }],
  ])('returns the same unavailable envelope for %s', async (_label, records) => {
    await expect(lookupPublicEvent(EVENT_ID, dependencies(records), { now: NOW })).resolves.toEqual({
      contractVersion: '1',
      error: { code: 'EVENT_UNAVAILABLE' },
    });
  });

  it('fails closed when any tenant is inaccessible', async () => {
    const deps = dependencies({ oakland: event(), troy: null });
    deps.connectToDatabase.mockImplementation(async (key) => {
      if (key === 'troy') throw new Error('database unavailable');
      return { key };
    });
    await expect(lookupPublicEvent(EVENT_ID, deps, { now: NOW })).resolves.toEqual({
      contractVersion: '1', error: { code: 'EVENT_UNAVAILABLE' },
    });
  });

  it('rejects malformed identifiers before database work', async () => {
    const deps = dependencies({ oakland: event() });
    await expect(lookupPublicEvent('NOT-AN-ID', deps)).resolves.toEqual({
      contractVersion: '1', error: { code: 'EVENT_UNAVAILABLE' },
    });
    expect(deps.connectToDatabase).not.toHaveBeenCalled();
  });
});
