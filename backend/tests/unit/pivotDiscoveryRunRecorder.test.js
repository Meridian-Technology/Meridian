jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../utilities/pivotLogger', () => ({ logPivot: jest.fn() }));

const getGlobalModels = require('../../services/getGlobalModelService');
const { logPivot } = require('../../utilities/pivotLogger');
const {
  createDiscoveryRun,
  nullRecorder,
  serializeDiscoveryRun,
  findOrchestrationRun,
  findLatestOrchestrationRun,
} = require('../../services/pivotDiscoveryRunRecorder');
const { MAX_STEPS } = require('../../schemas/pivotSourceDiscoveryRun');

const RUN_ID = '665a1b2c3d4e5f6789012345';

function mockReq() {
  return { globalDb: {}, user: { email: 'ops@meridian.app' } };
}

describe('pivotDiscoveryRunRecorder', () => {
  let PivotSourceDiscoveryRun;

  beforeEach(() => {
    jest.clearAllMocks();
    PivotSourceDiscoveryRun = {
      create: jest.fn().mockResolvedValue({ _id: RUN_ID }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    };
    getGlobalModels.mockReturnValue({ PivotSourceDiscoveryRun });
  });

  describe('createDiscoveryRun', () => {
    it('opens a run with the agreed cost ceiling', async () => {
      const recorder = await createDiscoveryRun(mockReq(), {
        tenantKey: 'iowacity',
        city: 'Iowa City',
        actor: 'ops@meridian.app',
        tags: ['live-music'],
        plan: { queries: 8, categories: 1, maxCandidates: 5, minEvents: 1, maxOutboundCalls: 18 },
      });

      expect(recorder.runId).toBe(RUN_ID);
      expect(recorder.enabled).toBe(true);
      expect(PivotSourceDiscoveryRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantKey: 'iowacity',
          city: 'Iowa City',
          status: 'running',
          phase: 'searching',
          plan: expect.objectContaining({ maxOutboundCalls: 18 }),
          options: expect.objectContaining({ tags: ['live-music'], createJobs: true }),
        }),
      );
    });

    it('defaults to a discovery run, and records a batch when told', async () => {
      await createDiscoveryRun(mockReq(), { tenantKey: 'iowacity' });
      expect(PivotSourceDiscoveryRun.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'discovery', phase: 'searching' }),
      );

      await createDiscoveryRun(mockReq(), {
        tenantKey: 'iowacity',
        kind: 'curation-batch',
        phase: 'planning',
      });
      expect(PivotSourceDiscoveryRun.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'curation-batch', phase: 'planning' }),
      );
    });

    it('stays inert when recording is switched off, so the CLI writes nothing', async () => {
      const recorder = await createDiscoveryRun(mockReq(), {
        record: false,
        tenantKey: 'iowacity',
      });

      recorder.step({ phase: 'searching', kind: 'search', title: 'ignored' });
      await recorder.finish();

      expect(recorder.enabled).toBe(false);
      expect(recorder.runId).toBeNull();
      expect(PivotSourceDiscoveryRun.create).not.toHaveBeenCalled();
    });
  });

  describe('telemetry never breaks the run', () => {
    it('degrades to an inert recorder when the model is missing', async () => {
      getGlobalModels.mockReturnValue({});

      const recorder = await createDiscoveryRun(mockReq(), { tenantKey: 'iowacity' });

      expect(recorder.enabled).toBe(false);
      expect(logPivot).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('could not create discovery run'),
        expect.any(Object),
      );
    });

    it('degrades to an inert recorder when the model lookup throws', async () => {
      getGlobalModels.mockImplementation(() => {
        throw new Error('no global db');
      });

      const recorder = await createDiscoveryRun(mockReq(), { tenantKey: 'iowacity' });

      expect(recorder.enabled).toBe(false);
    });

    it('degrades when the insert itself fails', async () => {
      PivotSourceDiscoveryRun.create.mockRejectedValue(new Error('write concern'));

      const recorder = await createDiscoveryRun(mockReq(), { tenantKey: 'iowacity' });

      expect(recorder.enabled).toBe(false);
    });

    it('swallows a failed flush rather than surfacing it to the pipeline', async () => {
      PivotSourceDiscoveryRun.updateOne.mockRejectedValue(new Error('connection reset'));
      const recorder = await createDiscoveryRun(mockReq(), { tenantKey: 'iowacity' });

      recorder.step({ phase: 'searching', kind: 'search', title: 'Searched “x”' });

      await expect(recorder.flush()).resolves.toBeUndefined();
      await expect(recorder.finish()).resolves.toBeUndefined();
    });
  });

  describe('step buffering', () => {
    it('appends buffered steps in one write, capped to the retained window', async () => {
      const recorder = await createDiscoveryRun(mockReq(), { tenantKey: 'iowacity' });

      recorder.step({ phase: 'searching', kind: 'search', title: 'Searched “a”' });
      recorder.step({
        phase: 'qualifying',
        kind: 'qualify',
        tone: 'good',
        title: 'englert.org qualified',
        eventCount: 12,
      });
      await recorder.flush();

      expect(PivotSourceDiscoveryRun.updateOne).toHaveBeenCalledTimes(1);
      const [filter, update] = PivotSourceDiscoveryRun.updateOne.mock.calls[0];
      expect(filter).toEqual({ _id: RUN_ID });
      expect(update.$push.steps.$slice).toBe(-MAX_STEPS);
      expect(update.$push.steps.$each).toHaveLength(2);
      expect(update.$push.steps.$each[1]).toMatchObject({
        kind: 'qualify',
        tone: 'good',
        eventCount: 12,
      });
      expect(update.$push.steps.$each[0].at).toBeInstanceOf(Date);
    });

    it('drops entries that would not render', async () => {
      const recorder = await createDiscoveryRun(mockReq(), { tenantKey: 'iowacity' });

      recorder.step({ phase: 'searching', kind: 'search' });
      recorder.step({ phase: 'searching', title: 'no kind' });
      recorder.step({ kind: 'search', title: 'no phase' });
      await recorder.flush();

      expect(PivotSourceDiscoveryRun.updateOne).not.toHaveBeenCalled();
    });

    it('writes nothing when there is nothing pending', async () => {
      const recorder = await createDiscoveryRun(mockReq(), { tenantKey: 'iowacity' });

      await recorder.flush();

      expect(PivotSourceDiscoveryRun.updateOne).not.toHaveBeenCalled();
    });

    it('flushes on its own timer so the console stays close to live', async () => {
      jest.useFakeTimers();
      try {
        const recorder = await createDiscoveryRun(mockReq(), { tenantKey: 'iowacity' });
        recorder.step({ phase: 'searching', kind: 'search', title: 'Searched “a”' });

        expect(PivotSourceDiscoveryRun.updateOne).not.toHaveBeenCalled();

        jest.advanceTimersByTime(500);
        await Promise.resolve();

        expect(PivotSourceDiscoveryRun.updateOne).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('collapses parallel counter bumps into a single $inc', async () => {
      const recorder = await createDiscoveryRun(mockReq(), { tenantKey: 'iowacity' });

      recorder.bumpCounters({ searches: 1 });
      recorder.bumpCounters({ searches: 1, maps: 2 });
      recorder.bumpCounters({ scrapes: 0 });
      await recorder.flush();

      const [, update] = PivotSourceDiscoveryRun.updateOne.mock.calls[0];
      expect(update.$inc).toEqual({ 'counters.searches': 2, 'counters.maps': 2 });
    });

    it('records the phase so the console can pick an animation', async () => {
      const recorder = await createDiscoveryRun(mockReq(), { tenantKey: 'iowacity' });

      recorder.setPhase('qualifying');
      await recorder.flush();

      const [, update] = PivotSourceDiscoveryRun.updateOne.mock.calls[0];
      expect(update.$set).toEqual({ phase: 'qualifying' });
    });
  });

  describe('finish', () => {
    it('drains pending steps before closing the run out', async () => {
      const recorder = await createDiscoveryRun(mockReq(), { tenantKey: 'iowacity' });
      recorder.step({ phase: 'done', kind: 'done', title: 'Done — 3 sources registered' });

      await recorder.finish({ status: 'completed' });

      expect(PivotSourceDiscoveryRun.updateOne).toHaveBeenCalledTimes(2);
      const [, drain] = PivotSourceDiscoveryRun.updateOne.mock.calls[0];
      expect(drain.$push.steps.$each).toHaveLength(1);
      const [, close] = PivotSourceDiscoveryRun.updateOne.mock.calls[1];
      expect(close.$set).toMatchObject({ status: 'completed', phase: 'done' });
      expect(close.$set.finishedAt).toBeInstanceOf(Date);
    });

    it('records an abort distinctly from a plain failure', async () => {
      const recorder = await createDiscoveryRun(mockReq(), { tenantKey: 'iowacity' });

      await recorder.finish({
        status: 'failed',
        aborted: { code: 'SITE_SCRAPE_QUOTA_EXCEEDED', error: 'Out of credits.' },
      });

      const [, close] = PivotSourceDiscoveryRun.updateOne.mock.calls[0];
      expect(close.$set.aborted).toEqual({
        code: 'SITE_SCRAPE_QUOTA_EXCEEDED',
        error: 'Out of credits.',
      });
    });

    it('ignores a second finish, so the scheduler wrapper cannot double-close', async () => {
      const recorder = await createDiscoveryRun(mockReq(), { tenantKey: 'iowacity' });

      await recorder.finish({ status: 'completed' });
      await recorder.finish({ status: 'failed', error: 'late' });

      expect(PivotSourceDiscoveryRun.updateOne).toHaveBeenCalledTimes(1);
    });

    it('stops accepting steps once closed', async () => {
      const recorder = await createDiscoveryRun(mockReq(), { tenantKey: 'iowacity' });
      await recorder.finish({ status: 'completed' });
      PivotSourceDiscoveryRun.updateOne.mockClear();

      recorder.step({ phase: 'done', kind: 'done', title: 'too late' });
      await recorder.flush();

      expect(PivotSourceDiscoveryRun.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('reading runs back', () => {
    beforeEach(() => {
      PivotSourceDiscoveryRun.findOne = jest.fn(() => ({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      }));
    });

    it('treats runs written before `kind` existed as discovery runs', async () => {
      await findOrchestrationRun(mockReq(), {
        tenantKey: 'iowacity',
        runId: RUN_ID,
        kind: 'discovery',
      });

      expect(PivotSourceDiscoveryRun.findOne).toHaveBeenCalledWith({
        _id: RUN_ID,
        tenantKey: 'iowacity',
        kind: { $in: ['discovery', null] },
      });
    });

    it('matches a batch exactly, so it can never be served as discovery', async () => {
      await findOrchestrationRun(mockReq(), {
        tenantKey: 'iowacity',
        runId: RUN_ID,
        kind: 'curation-batch',
      });

      expect(PivotSourceDiscoveryRun.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'curation-batch' }),
      );
    });

    it('drops the timeline unless it is asked for', async () => {
      const select = jest.fn().mockReturnThis();
      PivotSourceDiscoveryRun.findOne = jest.fn(() => ({
        sort: jest.fn().mockReturnThis(),
        select,
        lean: jest.fn().mockResolvedValue(null),
      }));

      await findLatestOrchestrationRun(mockReq(), { tenantKey: 'iowacity' });
      expect(select).toHaveBeenCalledWith('-steps');

      select.mockClear();
      await findLatestOrchestrationRun(mockReq(), {
        tenantKey: 'iowacity',
        includeSteps: true,
      });
      expect(select).not.toHaveBeenCalled();
    });
  });

  describe('nullRecorder', () => {
    it('accepts every call without a run behind it', async () => {
      const recorder = nullRecorder();

      expect(recorder.runId).toBeNull();
      recorder.step({ phase: 'searching', kind: 'search', title: 'x' });
      recorder.setPhase('done');
      recorder.bumpCounters({ searches: 1 });
      await expect(recorder.finish()).resolves.toBeUndefined();
    });
  });

  describe('serializeDiscoveryRun', () => {
    it('exposes the timeline the console reads', () => {
      const at = new Date('2026-08-10T12:00:00.000Z');
      const run = serializeDiscoveryRun({
        _id: RUN_ID,
        tenantKey: 'iowacity',
        city: 'Iowa City',
        status: 'completed',
        phase: 'done',
        counters: { qualified: 2 },
        steps: [
          {
            at,
            phase: 'qualifying',
            kind: 'qualify',
            title: 'englert.org qualified with 12 event(s)',
            eventCount: 12,
            host: 'englert.org',
          },
        ],
        aborted: { code: null, error: null },
      });

      expect(run._id).toBe(RUN_ID);
      expect(run.steps).toHaveLength(1);
      expect(run.steps[0]).toMatchObject({
        kind: 'qualify',
        tone: 'info',
        eventCount: 12,
        host: 'englert.org',
      });
      // An empty abort is normalized away so the console can treat it as a flag.
      expect(run.aborted).toBeNull();
    });

    it('returns null for a missing run', () => {
      expect(serializeDiscoveryRun(null)).toBeNull();
    });

    it('drops the timeline entirely when it was not requested', () => {
      const run = serializeDiscoveryRun(
        {
          _id: RUN_ID,
          tenantKey: 'iowacity',
          status: 'running',
          phase: 'searching',
          counters: { searches: 3 },
        },
        { includeSteps: false },
      );

      // Absent rather than empty, so a summary cannot be mistaken for a run that
      // genuinely recorded no decisions.
      expect('steps' in run).toBe(false);
      expect(run.counters).toEqual({ searches: 3 });
    });
  });
});
