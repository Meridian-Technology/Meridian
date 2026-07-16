jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../services/feedbackService', () => {
  return jest.fn().mockImplementation(() => ({
    submitFeedback: jest.fn(),
  }));
});
jest.mock('../../services/pivotInteractionService', () => ({
  recordPivotInteraction: jest.fn(),
  pickInteractionContext: jest.requireActual('../../services/pivotInteractionService')
    .pickInteractionContext,
}));

const getModels = require('../../services/getModelService');
const FeedbackService = require('../../services/feedbackService');
const { recordPivotInteraction } = require('../../services/pivotInteractionService');
const {
  getPendingEventFeedback,
  submitEventFeedback,
} = require('../../services/pivotFeedbackService');

const userId = '507f191e810c19729de860eb';
const eventId = '665a1b2c3d4e5f6789012345';
const now = new Date('2026-06-26T12:00:00.000Z');
const req = { user: { userId }, school: 'nyc' };

function publishedEvent(overrides = {}) {
  return {
    _id: eventId,
    name: 'Board Game Night',
    start_time: new Date('2026-06-24T19:00:00.000Z'),
    end_time: new Date('2026-06-24T22:00:00.000Z'),
    externalLink: 'https://partiful.com/e/example',
    customFields: {
      pivot: { batchWeek: '2026-W26', host: { name: 'Venue' } },
    },
    ...overrides,
  };
}

describe('getPendingEventFeedback', () => {
  beforeEach(() => {
    getModels.mockReset();
  });

  it('returns null when user has no registered intents', async () => {
    getModels.mockReturnValue({
      PivotEventIntent: { find: jest.fn(() => ({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) })) },
    });

    const result = await getPendingEventFeedback(req, { now });
    expect(result.data.events).toEqual([]);
  });

  it('returns all ended registered events without feedback', async () => {
    getModels.mockReturnValue({
      PivotEventIntent: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([{ eventId }]),
        })),
      },
      Event: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([publishedEvent()]),
        })),
      },
      UniversalFeedback: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
      },
    });

    const result = await getPendingEventFeedback(req, { now });
    expect(result.data.events).toHaveLength(1);
    expect(result.data.events[0]).toMatchObject({
      _id: eventId,
      name: 'Board Game Night',
      displayHost: { name: 'Venue' },
    });
  });

  it('skips events that already have feedback', async () => {
    getModels.mockReturnValue({
      PivotEventIntent: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([{ eventId }]),
        })),
      },
      Event: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([publishedEvent()]),
        })),
      },
      UniversalFeedback: {
        find: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([{ processId: eventId }]),
        })),
      },
    });

    const result = await getPendingEventFeedback(req, { now });
    expect(result.data.events).toEqual([]);
  });
});

describe('submitEventFeedback', () => {
  beforeEach(() => {
    getModels.mockReset();
    FeedbackService.mockClear();
    recordPivotInteraction.mockClear();
  });

  it('rejects invalid rating', async () => {
    const result = await submitEventFeedback(req, { eventId, rating: 6 });
    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_RATING');
  });

  it('returns 404 for unknown event', async () => {
    getModels.mockReturnValue({
      Event: { findOne: jest.fn(() => mockEventFindOne(null)) },
    });

    const result = await submitEventFeedback(req, { eventId, rating: 4, now });
    expect(result.status).toBe(404);
    expect(result.code).toBe('EVENT_NOT_FOUND');
  });

  it('returns 403 when event has not ended', async () => {
    getModels.mockReturnValue({
      Event: {
        findOne: jest.fn(() =>
          mockEventFindOne(
            publishedEvent({ end_time: new Date('2026-06-27T22:00:00.000Z') }),
          ),
        ),
      },
    });

    const result = await submitEventFeedback(req, { eventId, rating: 4, now });
    expect(result.status).toBe(403);
    expect(result.code).toBe('EVENT_NOT_ENDED');
  });

  it('returns 403 when user is not registered', async () => {
    getModels.mockImplementation((_req, ...names) => {
      if (names.includes('Event')) {
        return { Event: { findOne: jest.fn(() => mockEventFindOne(publishedEvent())) } };
      }
      return {
        PivotEventIntent: {
          findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
        },
      };
    });

    const result = await submitEventFeedback(req, { eventId, rating: 5, now });
    expect(result.status).toBe(403);
    expect(result.code).toBe('NOT_REGISTERED');
  });

  it('submits rating via FeedbackService for registered past events', async () => {
    const submitFeedback = jest.fn().mockResolvedValue({
      processId: eventId,
      submittedAt: now,
    });
    const ensurePivotEventFeedbackConfig = jest.fn().mockResolvedValue({ version: 'v1.0' });
    FeedbackService.mockImplementation(() => ({
      submitFeedback,
      ensurePivotEventFeedbackConfig,
    }));

    getModels.mockImplementation((_req, ...names) => {
      if (names.includes('Event')) {
        return { Event: { findOne: jest.fn(() => mockEventFindOne(publishedEvent())) } };
      }
      return {
        PivotEventIntent: {
          findOne: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue({ batchWeek: '2026-W26' }),
          }),
        },
      };
    });

    const result = await submitEventFeedback(req, { eventId, rating: 4, now });

    expect(result.data).toEqual({
      eventId,
      rating: 4,
      submittedAt: now,
    });
    expect(submitFeedback).toHaveBeenCalledWith(
      userId,
      'pivot_event',
      eventId,
      { rating: 4 },
      expect.objectContaining({ batchWeek: '2026-W26' }),
    );
    expect(ensurePivotEventFeedbackConfig).toHaveBeenCalledWith(userId);
    expect(recordPivotInteraction).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        type: 'rating',
        rating: 4,
        surface: 'deck',
        batchWeek: '2026-W26',
      }),
    );
  });
});

function mockEventFindOne(event) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(event),
  };
}
