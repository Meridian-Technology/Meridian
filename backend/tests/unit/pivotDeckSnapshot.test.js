const mongoose = require('mongoose');
const {
  createMongoMemoryConnection,
  getOrCreateModel,
} = require('../helpers/mongoMemory');
const pivotDeckSnapshotSchema = require('../../schemas/pivotDeckSnapshot');

jest.mock('../../services/getModelService', () => jest.fn());

const getModels = require('../../services/getModelService');
const {
  normalizeDeckSnapshotRefresh,
  upsertPivotDeckSnapshot,
  recordPivotDeckSnapshot,
} = require('../../services/pivotDeckSnapshotService');

describe('PivotDeckSnapshot (Task 6.1)', () => {
  let mongo;
  let PivotDeckSnapshot;
  let req;
  const userId = new mongoose.Types.ObjectId();
  const eventA = new mongoose.Types.ObjectId();
  const eventB = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection();
    PivotDeckSnapshot = getOrCreateModel(
      mongo.connection,
      'PivotDeckSnapshot',
      pivotDeckSnapshotSchema,
      'pivotDeckSnapshots',
    );
    req = { db: mongo.connection, user: { userId: String(userId) }, school: 'nyc' };

    getModels.mockImplementation((_req, ...names) => {
      const models = { PivotDeckSnapshot };
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

  describe('normalizeDeckSnapshotRefresh', () => {
    it('allows refresh only for admin or developer roles', () => {
      expect(normalizeDeckSnapshotRefresh('1', ['user'])).toBe(false);
      expect(normalizeDeckSnapshotRefresh('1', ['admin'])).toBe(true);
      expect(normalizeDeckSnapshotRefresh('true', ['developer'])).toBe(true);
      expect(normalizeDeckSnapshotRefresh(false, ['admin'])).toBe(false);
    });
  });

  describe('upsertPivotDeckSnapshot', () => {
    it('writes once per user and batchWeek', async () => {
      const first = await upsertPivotDeckSnapshot(req, {
        userId,
        batchWeek: '2026-W22',
        orderedEventIds: [eventA, eventB],
        rankerVersion: 'rules_v0',
      });

      expect(first.skipped).toBe(false);
      expect(first.created).toBe(true);
      expect(first.data.orderedEventIds).toEqual([
        String(eventA),
        String(eventB),
      ]);

      const second = await upsertPivotDeckSnapshot(req, {
        userId,
        batchWeek: '2026-W22',
        orderedEventIds: [eventB, eventA],
        rankerVersion: 'rules_v0',
      });

      expect(second.skipped).toBe(true);
      expect(second.data.orderedEventIds).toEqual([
        String(eventA),
        String(eventB),
      ]);
      expect(await PivotDeckSnapshot.countDocuments()).toBe(1);
    });

    it('refreshes an existing snapshot when forceRefresh is true', async () => {
      await upsertPivotDeckSnapshot(req, {
        userId,
        batchWeek: '2026-W22',
        orderedEventIds: [eventA, eventB],
        rankerVersion: 'rules_v0',
      });

      const refreshed = await upsertPivotDeckSnapshot(req, {
        userId,
        batchWeek: '2026-W22',
        orderedEventIds: [eventB, eventA],
        rankerVersion: 'rules_v0',
        forceRefresh: true,
      });

      expect(refreshed.skipped).toBe(false);
      expect(refreshed.refreshed).toBe(true);
      expect(refreshed.data.orderedEventIds).toEqual([
        String(eventB),
        String(eventA),
      ]);
    });

    it('recordPivotDeckSnapshot swallows write failures without throwing', async () => {
      getModels.mockImplementationOnce(() => {
        throw new Error('model unavailable');
      });

      const result = await recordPivotDeckSnapshot(req, {
        userId,
        batchWeek: '2026-W22',
        orderedEventIds: [eventA],
        rankerVersion: 'rules_v0',
      });

      expect(result.error).toMatch(/model unavailable/i);
    });
  });
});
