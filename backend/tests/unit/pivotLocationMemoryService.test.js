jest.mock('../../services/getModelService', () => jest.fn());

const getModels = require('../../services/getModelService');
const {
  createLocationMemoryLookup,
  locationMatchKey,
  memoryTemplate,
  rememberLocation,
  richLocationFromMemory,
} = require('../../services/pivotLocationMemoryService');

const NOW = new Date('2026-10-12T12:00:00.000Z');

function remembered(overrides = {}) {
  return {
    _id: 'memory-1',
    tenantKey: 'nyc',
    matchKey: 'the bell house',
    sourceText: 'The Bell House',
    action: 'select_match',
    richLocation: {
      mode: 'physical', venueName: 'The Bell House', googlePlaceId: 'ChIJ-bell',
      formattedAddress: '149 7th St, Brooklyn, NY 11215, USA',
      coordinates: { type: 'Point', coordinates: [-73.99, 40.67] },
      provider: 'google', resolutionStatus: 'resolved', resolutionConfidence: 1,
      resolvedAt: '2026-10-01T00:00:00.000Z', publicDisplayLabel: 'The Bell House',
      revealPolicy: 'public',
    },
    ...overrides,
  };
}

describe('pivot location memory', () => {
  beforeEach(() => jest.clearAllMocks());

  test.each([
    ['The Bell House', 'the bell house'],
    ['  the   BELL house!! ', 'the bell house'],
    ['Café Wha?', 'cafe wha'],
    ['Smith & Wollensky', 'smith and wollensky'],
  ])('normalizes %p to a shared match key', (text, key) => {
    expect(locationMatchKey(text)).toBe(key);
  });

  test('keeps distinct venues distinct', () => {
    expect(locationMatchKey('Bell House Rooftop')).not.toBe(locationMatchKey('Bell House'));
    expect(locationMatchKey('')).toBe('');
  });

  test('stores templates without per-event fields', () => {
    expect(memoryTemplate({ mode: 'online', originalInput: 'Zoom', createdAt: NOW,
      updatedAt: NOW, _id: 'x', publicDisplayLabel: 'Online' }))
      .toEqual({ mode: 'online', publicDisplayLabel: 'Online' });
  });

  test('rebuilds a remembered location with the event source text', () => {
    expect(richLocationFromMemory(remembered(), 'the bell house', NOW)).toMatchObject({
      mode: 'physical', googlePlaceId: 'ChIJ-bell', originalInput: 'the bell house',
      createdAt: NOW, updatedAt: NOW,
    });
  });

  test('lookup applies a match and records its use', async () => {
    const findOne = jest.fn(() => ({ lean: jest.fn().mockResolvedValue(remembered()) }));
    const updateOne = jest.fn().mockResolvedValue({});
    getModels.mockReturnValue({ PivotLocationMemory: { findOne, updateOne } });
    const lookup = createLocationMemoryLookup({ db: {}, tenantKey: 'NYC', now: NOW });
    const result = await lookup('THE BELL HOUSE.');
    expect(findOne).toHaveBeenCalledWith({ tenantKey: 'nyc', matchKey: 'the bell house' });
    expect(result).toMatchObject({ memoryId: 'memory-1',
      richLocation: { originalInput: 'THE BELL HOUSE.', googlePlaceId: 'ChIJ-bell' } });
    expect(updateOne).toHaveBeenCalledWith({ _id: 'memory-1' },
      { $inc: { useCount: 1 }, $set: { lastUsedAt: NOW } });
  });

  test('dry-run lookups do not record use, and failures fall through', async () => {
    const findOne = jest.fn(() => ({ lean: jest.fn().mockResolvedValue(remembered()) }));
    const updateOne = jest.fn();
    getModels.mockReturnValue({ PivotLocationMemory: { findOne, updateOne } });
    await createLocationMemoryLookup({ db: {}, tenantKey: 'nyc', recordUse: false })('Bell');
    expect(updateOne).not.toHaveBeenCalled();

    getModels.mockReturnValue({ PivotLocationMemory: {
      findOne: () => ({ lean: () => Promise.reject(new Error('offline')) }) } });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(createLocationMemoryLookup({ db: {}, tenantKey: 'nyc' })('Bell'))
      .resolves.toBeNull();
    expect(await createLocationMemoryLookup({})('Bell')).toBeNull();
  });

  test('remembers a decision keyed by normalized text', async () => {
    const findOneAndUpdate = jest.fn(() => ({ lean: jest.fn().mockResolvedValue(remembered()) }));
    getModels.mockReturnValue({ PivotLocationMemory: { findOneAndUpdate } });
    await rememberLocation({ db: {}, tenantKey: 'nyc', sourceText: ' The Bell House ',
      richLocation: { ...remembered().richLocation, originalInput: 'The Bell House' },
      action: 'select_match', reviewer: { id: 'admin-1', email: 'ops@example.com' },
      eventId: 'event-1' });
    const [filter, update] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ tenantKey: 'nyc', matchKey: 'the bell house' });
    expect(update.$set).toMatchObject({ sourceText: 'The Bell House', action: 'select_match',
      rememberedBy: { id: 'admin-1', email: 'ops@example.com' }, sourceEventId: 'event-1' });
    expect(update.$set.richLocation).not.toHaveProperty('originalInput');
  });

  test('does not remember blank text', async () => {
    expect(await rememberLocation({ db: {}, tenantKey: 'nyc', sourceText: '  ',
      richLocation: { mode: 'tbd' } })).toBeNull();
  });
});
