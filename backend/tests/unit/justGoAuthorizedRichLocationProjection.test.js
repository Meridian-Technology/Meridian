jest.mock('../../services/getModelService', () => jest.fn());

const getModels = require('../../services/getModelService');
const {
  projectAuthorizedRichLocation,
  loadRichLocationViewerContext,
  projectEventRichLocation,
} = require('../../services/justGoRichLocationProjectionService');

const USER_ID = '507f191e810c19729de860ea';
const UNRELATED_USER_ID = '507f191e810c19729de860ec';
const EVENT_ID = '507f191e810c19729de860eb';

function event(overrides = {}) {
  return {
    _id: EVENT_ID,
    location: 'Legacy location remains separate',
    richLocation: {
      mode: 'registration_gated',
      originalInput: 'Private source notes',
      venueName: 'The Great Hall',
      formattedAddress: '123 Main St, Brooklyn, NY 11201, USA',
      addressComponents: [{
        longText: 'Brooklyn',
        shortText: 'BK',
        types: ['locality'],
      }],
      neighborhood: 'Downtown Brooklyn',
      city: 'Brooklyn',
      region: 'New York',
      postalCode: '11201',
      countryCode: 'US',
      coordinates: { type: 'Point', coordinates: [-73.99, 40.69] },
      googlePlaceId: 'ChIJ-registered-only',
      provider: 'google',
      placeTypes: ['event_venue'],
      aliases: ['Private alias'],
      normalizedSearchText: 'private search text',
      resolutionStatus: 'resolved',
      resolutionConfidence: 1,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      resolvedAt: new Date('2026-09-01T00:00:00.000Z'),
      publicDisplayLabel: 'The Great Hall · address after registration',
      approximateLabel: 'Downtown Brooklyn',
      revealPolicy: 'registered_only',
    },
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    user: { userId: USER_ID },
    db: {},
    school: 'brooklyn',
    ...overrides,
  };
}

function mockIntentExists(value) {
  const exists = jest.fn().mockResolvedValue(value ? { _id: 'intent-id' } : null);
  getModels.mockReturnValue({ PivotEventIntent: { exists } });
  return exists;
}

function expectNoPrecision(projection) {
  expect(projection).not.toHaveProperty('formattedAddress');
  expect(projection).not.toHaveProperty('addressComponents');
  expect(projection).not.toHaveProperty('postalCode');
  expect(projection).not.toHaveProperty('coordinates');
  expect(projection).not.toHaveProperty('googlePlaceId');
}

describe('Just Go authorized rich-location projection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('adds gated precision only after a registered-intent lookup for the authenticated user', async () => {
    const exists = mockIntentExists(true);

    const projection = await projectAuthorizedRichLocation(request(), event());

    expect(exists).toHaveBeenCalledWith({
      userId: USER_ID,
      eventId: EVENT_ID,
      status: 'registered',
    });
    expect(projection).toMatchObject({
      mode: 'registration_gated',
      formattedAddress: '123 Main St, Brooklyn, NY 11201, USA',
      addressComponents: [{ longText: 'Brooklyn', shortText: 'BK', types: ['locality'] }],
      postalCode: '11201',
      coordinates: { type: 'Point', coordinates: [-73.99, 40.69] },
      googlePlaceId: 'ChIJ-registered-only',
      revealPolicy: 'registered_only',
    });
    expect(JSON.stringify(projection)).not.toMatch(
      /Private source notes|provider|placeTypes|Private alias|normalizedSearchText|resolutionConfidence|resolvedAt/,
    );
  });

  it('returns only public-safe fields for authenticated users without registered intent', async () => {
    mockIntentExists(false);
    const projection = await projectAuthorizedRichLocation(request(), event());
    expectNoPrecision(projection);
  });

  it.each([
    ['interested', USER_ID],
    ['passed', USER_ID],
    ['unrelated', UNRELATED_USER_ID],
  ])('does not reveal gated precision to a %s viewer', async (_viewerState, userId) => {
    const exists = mockIntentExists(false);

    const projection = await projectAuthorizedRichLocation(
      request({ user: { userId } }),
      event(),
    );

    expect(exists).toHaveBeenCalledWith({
      userId,
      eventId: EVENT_ID,
      status: 'registered',
    });
    expectNoPrecision(projection);
  });

  it('does not trust client or pre-serialized claims of registration', async () => {
    const exists = mockIntentExists(false);
    const req = request({
      body: { registered: true, userIntent: 'registered' },
      query: { revealPreciseLocation: 'true' },
    });
    const source = event({ userIntent: 'registered' });

    const projection = await projectAuthorizedRichLocation(req, source, {
      registered: true,
      userIntent: 'registered',
      getModels: () => ({
        PivotEventIntent: { exists: jest.fn().mockResolvedValue({ _id: 'forged' }) },
      }),
    });

    expect(exists).toHaveBeenCalledTimes(1);
    expectNoPrecision(projection);
  });

  it('does not query or reveal precision for anonymous or invalid identities', async () => {
    const exists = mockIntentExists(true);
    expectNoPrecision(await projectAuthorizedRichLocation({}, event()));
    expectNoPrecision(await projectAuthorizedRichLocation(
      request({ user: { userId: 'not-an-object-id' } }),
      event(),
    ));
    expect(exists).not.toHaveBeenCalled();
  });

  it('reveals precision through the authorized projector but not a generic projector', async () => {
    mockIntentExists(true);

    const authorized = await projectAuthorizedRichLocation(request(), event());
    const generic = projectEventRichLocation(event());

    expect(authorized).toMatchObject({
      formattedAddress: '123 Main St, Brooklyn, NY 11201, USA',
      coordinates: { type: 'Point', coordinates: [-73.99, 40.69] },
      googlePlaceId: 'ChIJ-registered-only',
    });
    expectNoPrecision(generic);
  });

  it('does not accept a client-shaped event id as authorization input', async () => {
    const exists = mockIntentExists(true);
    const source = event();
    delete source._id;
    source.id = EVENT_ID;

    expectNoPrecision(await projectAuthorizedRichLocation(request(), source));
    expect(exists).not.toHaveBeenCalled();
  });

  it('fails closed when authorization lookup errors', async () => {
    const onAuthorizationError = jest.fn();
    getModels.mockImplementation(() => { throw new Error('database unavailable'); });

    const projection = await projectAuthorizedRichLocation(request(), event(), {
      onAuthorizationError,
    });

    expectNoPrecision(projection);
    expect(onAuthorizationError).toHaveBeenCalledWith({ error: expect.any(Error) });
  });

  it('does not perform intent lookups for non-gated modes', async () => {
    const exists = mockIntentExists(true);
    const source = event();
    source.richLocation = {
      ...source.richLocation,
      mode: 'physical',
      revealPolicy: 'public',
    };

    const projection = await projectAuthorizedRichLocation(request(), source);

    expect(exists).not.toHaveBeenCalled();
    expect(projection.formattedAddress).toBe('123 Main St, Brooklyn, NY 11201, USA');
  });

  it('filters malformed precise provider data even for registered users', async () => {
    mockIntentExists(true);
    const source = event();
    source.richLocation.addressComponents = [
      null,
      { longText: '', types: [] },
      { longText: 'Brooklyn', types: ['locality', 'locality'] },
    ];
    source.richLocation.coordinates = { type: 'Point', coordinates: [190, 95] };

    const projection = await projectAuthorizedRichLocation(request(), source);

    expect(projection.addressComponents).toEqual([
      { longText: 'Brooklyn', types: ['locality'] },
    ]);
    expect(projection).not.toHaveProperty('coordinates');
  });

  it('mints a batch viewer context from registered intents for response serializers', async () => {
    const lean = jest.fn().mockResolvedValue([{ eventId: EVENT_ID }]);
    const select = jest.fn(() => ({ lean }));
    const find = jest.fn(() => ({ select }));
    getModels.mockReturnValue({ PivotEventIntent: { find } });
    const tenant = {
      tenantType: 'pivot',
      richLocationControls: { rollout: 'on', reads: true },
    };

    const context = await loadRichLocationViewerContext(request(), [EVENT_ID], { tenant });
    const projection = projectEventRichLocation(event(), context);

    expect(find).toHaveBeenCalledWith({
      userId: USER_ID,
      eventId: { $in: [EVENT_ID] },
      status: 'registered',
    });
    expect(projection.formattedAddress).toBe('123 Main St, Brooklyn, NY 11201, USA');
    expect(projection.coordinates).toEqual({ type: 'Point', coordinates: [-73.99, 40.69] });
  });

  it('omits rich locations when reads are disabled and ignores forged viewer contexts', async () => {
    const source = event();
    const disabled = await loadRichLocationViewerContext(request(), [EVENT_ID], {
      tenant: { tenantType: 'pivot', richLocationControls: { rollout: 'off', reads: true } },
    });
    expect(projectEventRichLocation(source, disabled)).toBeUndefined();

    const forged = {
      enabled: true,
      registeredEventIds: new Set([EVENT_ID]),
    };
    expectNoPrecision(projectEventRichLocation(source, forged));
  });
});
