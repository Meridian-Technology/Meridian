jest.mock('../../services/getModelService', () => jest.fn());

const getModels = require('../../services/getModelService');
const {
  recordFeedAction,
  recordExternalOpen,
  confirmRegistered,
  getWeekRecap,
  resetWeekActions,
  serializeRecapEvent,
  resolveRegisteredTimeSlotId,
} = require('../../services/pivotIntentService');

const userId = '507f191e810c19729de860eb';
const eventId = '665a1b2c3d4e5f6789012345';
const now = new Date('2026-05-26T12:00:00.000Z');
const req = { user: { userId }, school: 'nyc' };

function mockEventFindOne(event) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(event),
  };
}

function publishedEvent(overrides = {}) {
  return {
    _id: eventId,
    start_time: new Date('2026-05-28T19:00:00.000Z'),
    externalLink: 'https://partiful.com/e/example',
    customFields: { pivot: { batchWeek: '2026-W22', host: { name: 'Venue' } } },
    ...overrides,
  };
}

describe('recordFeedAction', () => {
  beforeEach(() => {
    getModels.mockReset();
  });

  it('rejects an invalid eventId', async () => {
    const result = await recordFeedAction(req, { eventId: 'nope', action: 'interested' });
    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_EVENT_ID');
  });

  it('rejects an unsupported action', async () => {
    const result = await recordFeedAction(req, { eventId, action: 'registered' });
    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_ACTION');
  });

  it('returns 404 when the event is not an active pivot catalog event', async () => {
    getModels.mockReturnValue({
      Event: { findOne: jest.fn(() => mockEventFindOne(null)) },
    });

    const result = await recordFeedAction(
      { ...req, body: {} },
      { eventId, action: 'interested', now },
    );
    expect(result.status).toBe(404);
    expect(result.code).toBe('EVENT_NOT_FOUND');
  });

  it('maps pass to passed and upserts intent with event batchWeek', async () => {
    const findOneAndUpdate = jest.fn(() => ({
      lean: jest
        .fn()
        .mockResolvedValue({ eventId, status: 'passed', batchWeek: '2026-W22' }),
    }));
    getModels.mockImplementation((_req, ...names) => {
      if (names.includes('Event')) {
        return { Event: { findOne: jest.fn(() => mockEventFindOne(publishedEvent())) } };
      }
      return { PivotEventIntent: { findOneAndUpdate } };
    });

    const result = await recordFeedAction(req, { eventId, action: 'pass', now });

    expect(result.data).toEqual({
      eventId,
      status: 'passed',
      batchWeek: '2026-W22',
      timeSlotId: null,
    });
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { userId, eventId },
      { $set: { status: 'passed', batchWeek: '2026-W22', timeSlotId: null } },
      expect.objectContaining({ upsert: true }),
    );
  });
});

describe('recordExternalOpen', () => {
  beforeEach(() => {
    getModels.mockReset();
  });

  it('increments externalOpenCount and defaults a new row to interested', async () => {
    const findOneAndUpdate = jest.fn(() => ({
      lean: jest.fn().mockResolvedValue({
        eventId,
        status: 'interested',
        batchWeek: '2026-W22',
        externalOpenCount: 1,
        externalOpenAt: new Date('2026-05-26T12:00:00.000Z'),
      }),
    }));
    getModels.mockImplementation((_req, ...names) => {
      if (names.includes('Event')) {
        return { Event: { findOne: jest.fn(() => mockEventFindOne(publishedEvent())) } };
      }
      return { PivotEventIntent: { findOneAndUpdate } };
    });

    const result = await recordExternalOpen(req, eventId, {});

    expect(result.data.externalOpenCount).toBe(1);
    const [, update, opts] = findOneAndUpdate.mock.calls[0];
    expect(update.$inc).toEqual({ externalOpenCount: 1 });
    expect(update.$setOnInsert).toEqual({ status: 'interested', batchWeek: '2026-W22' });
    expect(update.$set).toHaveProperty('externalOpenAt');
    expect(opts).toEqual(expect.objectContaining({ upsert: true }));
  });

  it('returns 404 for non-pivot events', async () => {
    getModels.mockReturnValue({
      Event: { findOne: jest.fn(() => mockEventFindOne(null)) },
    });

    const result = await recordExternalOpen(req, eventId, {});
    expect(result.status).toBe(404);
  });

  it('rejects an invalid eventId', async () => {
    const result = await recordExternalOpen(req, 'nope', {});
    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_EVENT_ID');
  });
});

describe('confirmRegistered', () => {
  beforeEach(() => {
    getModels.mockReset();
  });

  it('sets status registered idempotently', async () => {
    const findOneAndUpdate = jest.fn(() => ({
      lean: jest
        .fn()
        .mockResolvedValue({ eventId, status: 'registered', batchWeek: '2026-W22' }),
    }));
    getModels.mockImplementation((_req, ...names) => {
      if (names.includes('Event')) {
        return { Event: { findOne: jest.fn(() => mockEventFindOne(publishedEvent())) } };
      }
      return { PivotEventIntent: { findOneAndUpdate } };
    });

    const result = await confirmRegistered(req, eventId);

    expect(result.data.status).toBe('registered');
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { userId, eventId },
      { $set: { status: 'registered', batchWeek: '2026-W22', timeSlotId: null } },
      expect.objectContaining({ upsert: true }),
    );
  });

  it('returns 404 for non-pivot events', async () => {
    getModels.mockReturnValue({
      Event: { findOne: jest.fn(() => mockEventFindOne(null)) },
    });

    const result = await confirmRegistered(req, eventId);
    expect(result.status).toBe(404);
  });
});

describe('getWeekRecap', () => {
  beforeEach(() => {
    getModels.mockReset();
  });

  it('lists interested + registered events, excluding passed', async () => {
    const intentFind = {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        { eventId, status: 'interested', timeSlotId: null },
        {
          eventId: '665a1b2c3d4e5f6789012346',
          status: 'registered',
          timeSlotId: '7pm',
        },
      ]),
    };
    const eventFind = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        publishedEvent(),
        publishedEvent({
          _id: '665a1b2c3d4e5f6789012346',
          name: 'Second',
          customFields: {
            pivot: { batchWeek: '2026-W22', host: { name: 'Venue 2' } },
          },
        }),
      ]),
    };
    const friendshipFind = {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };

    getModels.mockReturnValue({
      PivotEventIntent: { find: jest.fn(() => intentFind) },
      Event: { find: jest.fn(() => eventFind) },
      Friendship: { find: jest.fn(() => friendshipFind) },
    });

    const result = await getWeekRecap(req, { batchWeek: '2026-W22', now });

    expect(result.data.batchWeek).toBe('2026-W22');
    expect(result.data.events).toHaveLength(2);
    const statuses = result.data.events.map((e) => e.userIntent);
    expect(statuses).toContain('interested');
    expect(statuses).toContain('registered');
    expect(intentFind.lean).toHaveBeenCalled();
    expect(
      getModels.mock.results[0].value.PivotEventIntent.find,
    ).toHaveBeenCalledWith({
      userId,
      batchWeek: '2026-W22',
      status: { $in: ['interested', 'registered'] },
    });
  });

  it('returns empty events when user has no intents', async () => {
    getModels.mockReturnValue({
      PivotEventIntent: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
      Event: { find: jest.fn() },
    });

    const result = await getWeekRecap(req, { batchWeek: '2026-W22', now });
    expect(result.data.events).toEqual([]);
  });

  it('rejects an invalid batchWeek', async () => {
    const result = await getWeekRecap(req, { batchWeek: '2026-W99x', now });
    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_BATCH_WEEK');
  });
});

describe('resetWeekActions', () => {
  beforeEach(() => {
    getModels.mockReset();
  });

  it('deletes all intents for the batch week (interested, registered, passed)', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ deletedCount: 3 });
    getModels.mockReturnValue({
      PivotEventIntent: { deleteMany },
    });

    const result = await resetWeekActions(req, { batchWeek: '2026-W22', now });

    expect(result.data).toEqual({ batchWeek: '2026-W22', deletedCount: 3 });
    expect(deleteMany).toHaveBeenCalledWith({
      userId,
      batchWeek: '2026-W22',
    });
  });

  it('rejects an invalid batchWeek', async () => {
    const result = await resetWeekActions(req, { batchWeek: '2026-W99x', now });
    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_BATCH_WEEK');
  });
});

describe('serializeRecapEvent', () => {
  it('exposes displayHost, externalLink, and userIntent without hosting fields', () => {
    const payload = serializeRecapEvent(
      {
        _id: eventId,
        name: 'Recap Event',
        externalLink: 'https://luma.com/e/x',
        hostingId: 'internal-org',
        customFields: { pivot: { host: { name: 'Real Venue' }, tags: ['music'] } },
      },
      'interested',
    );

    expect(payload).toMatchObject({
      _id: eventId,
      externalLink: 'https://luma.com/e/x',
      displayHost: { name: 'Real Venue' },
      userIntent: 'interested',
      tags: ['music'],
    });
    expect(payload).not.toHaveProperty('hostingId');
  });
});

describe('resolveRegisteredTimeSlotId', () => {
  it('requires a showtime when multiple slots exist', () => {
    const event = {
      customFields: {
        pivot: {
          timeSlots: [
            { id: '7pm', start_time: '2026-05-23T23:00:00.000Z' },
            { id: '930pm', start_time: '2026-05-24T01:30:00.000Z' },
          ],
        },
      },
    };

    expect(resolveRegisteredTimeSlotId(event, '')).toMatchObject({
      code: 'TIME_SLOT_REQUIRED',
    });
    expect(resolveRegisteredTimeSlotId(event, '930pm')).toEqual({
      timeSlotId: '930pm',
    });
  });

  it('auto-selects the only showtime', () => {
    const event = {
      customFields: {
        pivot: {
          timeSlots: [{ id: '7pm', start_time: '2026-05-23T23:00:00.000Z' }],
        },
      },
    };

    expect(resolveRegisteredTimeSlotId(event, undefined)).toEqual({
      timeSlotId: '7pm',
    });
  });
});

describe('confirmRegistered time slots', () => {
  beforeEach(() => {
    getModels.mockReset();
  });

  it('persists timeSlotId when confirming registration', async () => {
    const findOneAndUpdate = jest.fn(() => ({
      lean: jest.fn().mockResolvedValue({
        eventId,
        status: 'registered',
        batchWeek: '2026-W22',
        timeSlotId: '7pm',
      }),
    }));
    getModels.mockImplementation((_req, ...names) => {
      if (names.includes('Event')) {
        return {
          Event: {
            findOne: jest.fn(() =>
              mockEventFindOne(
                publishedEvent({
                  customFields: {
                    pivot: {
                      batchWeek: '2026-W22',
                      host: { name: 'Venue' },
                      timeSlots: [
                        { id: '7pm', start_time: '2026-05-23T23:00:00.000Z' },
                        { id: '930pm', start_time: '2026-05-24T01:30:00.000Z' },
                      ],
                    },
                  },
                }),
              ),
            ),
          },
        };
      }
      return { PivotEventIntent: { findOneAndUpdate } };
    });

    const result = await confirmRegistered(req, eventId, { timeSlotId: '7pm' });

    expect(result.data).toMatchObject({
      eventId,
      status: 'registered',
      timeSlotId: '7pm',
    });
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { userId, eventId },
      { $set: expect.objectContaining({ timeSlotId: '7pm', status: 'registered' }) },
      expect.objectContaining({ upsert: true }),
    );
  });
});
