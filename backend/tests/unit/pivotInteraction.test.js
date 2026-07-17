const mongoose = require('mongoose');
const {
  createMongoMemoryConnection,
  getOrCreateModel,
} = require('../helpers/mongoMemory');
const pivotInteractionSchema = require('../../schemas/pivotInteraction');
const pivotEventIntentSchema = require('../../schemas/pivotEventIntent');

jest.mock('../../services/getModelService', () => jest.fn());

const getModels = require('../../services/getModelService');
const {
  normalizePivotInteractionPayload,
  writePivotInteraction,
  recordPivotInteraction,
  recordPivotImpressions,
  recordPivotMicroInteractions,
  pickInteractionContext,
  DEFAULT_SURFACE,
  DEFAULT_RETRIEVAL,
} = require('../../services/pivotInteractionService');

describe('PivotInteraction schema + writer (Task 1.1)', () => {
  let mongo;
  let PivotInteraction;
  let PivotEventIntent;
  let req;

  const userId = new mongoose.Types.ObjectId();
  const eventId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection();
    PivotInteraction = getOrCreateModel(
      mongo.connection,
      'PivotInteraction',
      pivotInteractionSchema,
      'pivotInteractions',
    );
    PivotEventIntent = getOrCreateModel(
      mongo.connection,
      'PivotEventIntent',
      pivotEventIntentSchema,
      'pivotEventIntents',
    );
    req = { db: mongo.connection, user: { userId: String(userId) }, school: 'nyc' };

    getModels.mockImplementation((_req, ...names) => {
      const models = { PivotInteraction, PivotEventIntent };
      return names.reduce((acc, name) => {
        if (models[name]) acc[name] = models[name];
        return acc;
      }, {});
    });
  });

  afterEach(async () => {
    await mongo.reset();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  describe('pickInteractionContext', () => {
    it('defaults surface and retrieval when omitted', () => {
      expect(pickInteractionContext({})).toEqual({
        surface: DEFAULT_SURFACE,
        retrieval: DEFAULT_RETRIEVAL,
      });
    });

    it('passes through explore surface', () => {
      expect(
        pickInteractionContext({
          surface: 'explore',
          retrieval: 'filter',
          rankInFeed: 2,
        }),
      ).toEqual({
        surface: 'explore',
        retrieval: 'filter',
        rankInFeed: 2,
      });
    });
  });

  describe('normalizePivotInteractionPayload', () => {
    it('coerces invalid surface to deck', () => {
      const result = normalizePivotInteractionPayload({
        userId,
        eventId,
        batchWeek: '2026-W28',
        surface: 'homepage',
        type: 'impression',
      });

      expect(result.error).toBeUndefined();
      expect(result.doc.surface).toBe(DEFAULT_SURFACE);
    });

    it('coerces invalid retrieval to weekly_batch', () => {
      const result = normalizePivotInteractionPayload({
        userId,
        eventId,
        batchWeek: '2026-W28',
        surface: 'explore',
        retrieval: 'magic',
        type: 'impression',
      });

      expect(result.doc.retrieval).toBe(DEFAULT_RETRIEVAL);
      expect(result.doc.surface).toBe('explore');
    });

    it('rejects invalid type', () => {
      const result = normalizePivotInteractionPayload({
        userId,
        eventId,
        batchWeek: '2026-W28',
        type: 'swipe',
      });

      expect(result.error).toMatch(/Invalid interaction type/);
      expect(result.code).toBe('INVALID_INTERACTION_TYPE');
    });
  });

  describe('writePivotInteraction', () => {
    it('write + read round-trip preserves fields', async () => {
      const result = await writePivotInteraction(req, {
        userId,
        eventId,
        batchWeek: '2026-W28',
        surface: 'explore',
        retrieval: 'filter',
        type: 'impression',
        rankInFeed: 3,
        rankerVersion: 'rules_v0',
        requestId: 'req-abc',
        filters: { tags: ['live-music'], night: 'fri' },
      });

      expect(result.error).toBeUndefined();
      expect(result.data._id).toBeDefined();
      expect(result.data.surface).toBe('explore');
      expect(result.data.retrieval).toBe('filter');
      expect(result.data.rankInFeed).toBe(3);
      expect(result.data.requestId).toBe('req-abc');
      expect(result.data.filters).toEqual({
        tags: ['live-music'],
        night: 'fri',
      });

      const found = await PivotInteraction.findById(result.data._id).lean();
      expect(found).toBeTruthy();
      expect(String(found.userId)).toBe(String(userId));
      expect(String(found.eventId)).toBe(String(eventId));
      expect(found.batchWeek).toBe('2026-W28');
      expect(found.type).toBe('impression');
    });

    it('does not replace PivotEventIntent (state vs log)', async () => {
      await writePivotInteraction(req, {
        userId,
        eventId,
        batchWeek: '2026-W28',
        surface: 'deck',
        type: 'interested',
      });

      const intentCount = await PivotEventIntent.countDocuments();
      const interactionCount = await PivotInteraction.countDocuments();

      expect(interactionCount).toBe(1);
      expect(intentCount).toBe(0);
    });

    it('skips write when type is invalid', async () => {
      const result = await writePivotInteraction(req, {
        userId,
        eventId,
        batchWeek: '2026-W28',
        type: 'not-a-type',
      });

      expect(result.skipped).toBe(true);
      expect(await PivotInteraction.countDocuments()).toBe(0);
    });
  });

  describe('recordPivotInteraction', () => {
    it('schedules a fire-and-forget write from req.user', async () => {
      let scheduled = null;
      const setImmediateSpy = jest
        .spyOn(global, 'setImmediate')
        .mockImplementation((fn) => {
          scheduled = fn;
          return 0;
        });

      recordPivotInteraction(req, {
        eventId,
        batchWeek: '2026-W28',
        surface: 'deck',
        retrieval: 'weekly_batch',
        type: 'impression',
        rankInFeed: 0,
      });

      expect(scheduled).toEqual(expect.any(Function));
      expect(await PivotInteraction.countDocuments()).toBe(0);

      setImmediateSpy.mockRestore();
      await scheduled();

      const rows = await PivotInteraction.find().lean();
      expect(rows).toHaveLength(1);
      expect(String(rows[0].userId)).toBe(String(userId));
      expect(rows[0].type).toBe('impression');
      expect(rows[0].rankInFeed).toBe(0);
    });
  });

  describe('recordPivotImpressions', () => {
    it('schedules impression rows with rankInFeed and rules_v0', async () => {
      const callbacks = [];
      const setImmediateSpy = jest
        .spyOn(global, 'setImmediate')
        .mockImplementation((fn) => {
          callbacks.push(fn);
          return 0;
        });

      const result = recordPivotImpressions(req, {
        batchWeek: '2026-W28',
        impressions: [
          { eventId, rankInFeed: 0 },
          { eventId: new mongoose.Types.ObjectId(), rankInFeed: 2 },
        ],
      });

      expect(result.error).toBeUndefined();
      expect(result.data).toEqual({
        accepted: 2,
        skipped: 0,
        received: 2,
      });
      expect(callbacks).toHaveLength(2);

      setImmediateSpy.mockRestore();
      await Promise.all(callbacks.map((fn) => fn()));

      const rows = await PivotInteraction.find().sort({ rankInFeed: 1 }).lean();
      expect(rows).toHaveLength(2);
      expect(rows[0].type).toBe('impression');
      expect(rows[0].surface).toBe('deck');
      expect(rows[0].retrieval).toBe('weekly_batch');
      expect(rows[0].rankInFeed).toBe(0);
      expect(rows[0].rankerVersion).toBe('rules_v0');
      expect(rows[1].rankInFeed).toBe(2);
    });

    it('skips invalid items without failing the batch', () => {
      const result = recordPivotImpressions(req, {
        batchWeek: '2026-W28',
        impressions: [
          { eventId: 'not-an-id', rankInFeed: 0 },
          { eventId, rankInFeed: 1 },
        ],
      });

      expect(result.data.accepted).toBe(1);
      expect(result.data.skipped).toBe(1);
      expect(result.data.received).toBe(2);
    });
  });

  describe('recordPivotMicroInteractions', () => {
    it('schedules dwell rows with clamped ms', async () => {
      const callbacks = [];
      const setImmediateSpy = jest
        .spyOn(global, 'setImmediate')
        .mockImplementation((fn) => {
          callbacks.push(fn);
          return 0;
        });

      const result = recordPivotMicroInteractions(req, {
        batchWeek: '2026-W28',
        interactions: [
          {
            eventId,
            type: 'dwell',
            ms: 1200,
            surface: 'deck',
            retrieval: 'weekly_batch',
            rankInFeed: 1,
          },
          {
            eventId: new mongoose.Types.ObjectId(),
            type: 'detail_open',
            surface: 'explore',
            retrieval: 'filter',
            rankInFeed: 4,
          },
        ],
      });

      expect(result.error).toBeUndefined();
      expect(result.data).toEqual({
        accepted: 2,
        skipped: 0,
        received: 2,
      });

      setImmediateSpy.mockRestore();
      await Promise.all(callbacks.map((fn) => fn()));

      const dwell = await PivotInteraction.findOne({ type: 'dwell' }).lean();
      expect(dwell.ms).toBe(1200);
      expect(dwell.surface).toBe('deck');

      const detailOpen = await PivotInteraction.findOne({ type: 'detail_open' }).lean();
      expect(detailOpen.ms).toBeNull();
      expect(detailOpen.surface).toBe('explore');
    });

    it('clamps dwell ms above cap and skips zero ms', async () => {
      const callbacks = [];
      const setImmediateSpy = jest
        .spyOn(global, 'setImmediate')
        .mockImplementation((fn) => {
          callbacks.push(fn);
          return 0;
        });

      const result = recordPivotMicroInteractions(req, {
        batchWeek: '2026-W28',
        interactions: [
          {
            eventId,
            type: 'dwell',
            ms: 6 * 60 * 1000,
          },
          {
            eventId,
            type: 'dwell',
            ms: 0,
          },
          {
            eventId,
            type: 'detail_open',
          },
        ],
      });

      expect(result.data.accepted).toBe(2);
      expect(result.data.skipped).toBe(1);

      setImmediateSpy.mockRestore();
      await Promise.all(callbacks.map((fn) => fn()));

      const dwell = await PivotInteraction.findOne({ type: 'dwell' }).lean();
      expect(dwell.ms).toBe(5 * 60 * 1000);
    });
  });

  describe('schema validation', () => {
    it('rejects invalid surface at the mongoose layer', async () => {
      const doc = new PivotInteraction({
        userId,
        eventId,
        batchWeek: '2026-W28',
        surface: 'homepage',
        type: 'impression',
      });

      await expect(doc.validate()).rejects.toThrow(/surface/);
    });
  });
});
