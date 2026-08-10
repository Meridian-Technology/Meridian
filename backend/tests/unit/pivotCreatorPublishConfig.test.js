const {
  CREATOR_PUBLISH_CONFIG_DEFAULTS,
  resolveCreatorPublishConfig,
  computeCreatorBatchWeek,
  resolveCreatorDefaultIngestStatus,
  mergeCreatorPublishConfig,
  validateCreatorPublishConfigPatch,
} = require('../../utilities/pivotCreatorPublishConfig');
const { toIsoWeek } = require('../../utilities/pivotIsoWeek');
const {
  resolveCreatorPublishConfig: resolveFromService,
  computeCreatorBatchWeek: computeFromService,
} = require('../../services/pivotCreatorPublishConfigService');

describe('pivotCreatorPublishConfig', () => {
  describe('resolveCreatorPublishConfig', () => {
    it('loads pilot defaults when tenant has no creatorPublish override', () => {
      const config = resolveCreatorPublishConfig({ tenantKey: 'brooklyn', tenantType: 'pivot' });

      expect(config).toEqual(CREATOR_PUBLISH_CONFIG_DEFAULTS);
      expect(config.defaultIngestStatus).toBe('draft');
      expect(config.weekAssignment).toBe('event_start');
      expect(config.requireTagsToSubmit).toBe(false);
      expect(config.notifyAdminsOnCreate).toBe(true);
      expect(config.notifyAdminsOnLiveWeekSubmit).toBe(true);
    });

    it('deep-merges sparse tenant overrides without dropping defaults', () => {
      const config = resolveCreatorPublishConfig({
        creatorPublish: {
          defaultIngestStatus: 'staged',
          notifyAdminsOnCreate: false,
        },
      });

      expect(config.defaultIngestStatus).toBe('staged');
      expect(config.notifyAdminsOnCreate).toBe(false);
      expect(config.weekAssignment).toBe('event_start');
      expect(config.notifyAdminsOnLiveWeekSubmit).toBe(true);
    });

    it('ignores invalid stored enum values and keeps defaults', () => {
      const config = mergeCreatorPublishConfig({
        defaultIngestStatus: 'published',
        weekAssignment: 'magic',
      });

      expect(config.defaultIngestStatus).toBe('draft');
      expect(config.weekAssignment).toBe('event_start');
    });
  });

  describe('resolveCreatorDefaultIngestStatus', () => {
    it('defaults to draft', () => {
      expect(resolveCreatorDefaultIngestStatus()).toBe('draft');
      expect(resolveCreatorDefaultIngestStatus({})).toBe('draft');
    });

    it('allows staged override only', () => {
      expect(resolveCreatorDefaultIngestStatus({ defaultIngestStatus: 'staged' })).toBe('staged');
      expect(resolveCreatorDefaultIngestStatus({ defaultIngestStatus: 'published' })).toBe('draft');
    });
  });

  describe('computeCreatorBatchWeek', () => {
    it('uses ISO week of event start_time under default config', () => {
      const start = new Date('2026-05-23T19:00:00.000Z');
      const result = computeCreatorBatchWeek(start, CREATOR_PUBLISH_CONFIG_DEFAULTS);

      expect(result.error).toBeUndefined();
      expect(result.batchWeek).toBe(toIsoWeek(start));
      expect(result.source).toBe('event-date');
    });

    it('honors force-week override', () => {
      const start = new Date('2026-05-23T19:00:00.000Z');
      const result = computeCreatorBatchWeek(start, {
        weekAssignment: 'force',
        forceBatchWeek: '2026-W30',
      });

      expect(result).toEqual({ batchWeek: '2026-W30', source: 'forced' });
    });

    it('errors when force mode lacks forceBatchWeek', () => {
      const result = computeCreatorBatchWeek(new Date('2026-05-23T19:00:00.000Z'), {
        weekAssignment: 'force',
      });

      expect(result.status).toBe(400);
      expect(result.code).toBe('FORCE_BATCH_WEEK_REQUIRED');
    });

    it('falls back to timeSlots when start is missing', () => {
      const slotStart = new Date('2026-05-20T12:00:00.000Z');
      const result = computeCreatorBatchWeek(null, CREATOR_PUBLISH_CONFIG_DEFAULTS, {
        timeSlots: [{ start_time: slotStart }],
      });

      expect(result.error).toBeUndefined();
      expect(result.batchWeek).toBe(toIsoWeek(slotStart));
      expect(result.source).toBe('event-date');
    });
  });

  describe('validateCreatorPublishConfigPatch', () => {
    it('accepts a valid sparse patch', () => {
      const result = validateCreatorPublishConfigPatch({
        defaultIngestStatus: 'staged',
        weekAssignment: 'force',
        forceBatchWeek: '2026-W21',
        requireTagsToSubmit: true,
      });

      expect(result.ok).toBe(true);
      expect(result.patch).toEqual({
        defaultIngestStatus: 'staged',
        weekAssignment: 'force',
        forceBatchWeek: '2026-W21',
        requireTagsToSubmit: true,
      });
    });

    it('rejects published as defaultIngestStatus', () => {
      const result = validateCreatorPublishConfigPatch({
        defaultIngestStatus: 'published',
      });

      expect(result.error).toMatch(/draft.*staged/);
    });

    it('rejects invalid forceBatchWeek', () => {
      const result = validateCreatorPublishConfigPatch({
        forceBatchWeek: 'not-a-week',
      });

      expect(result.error).toMatch(/YYYY-Www/);
    });
  });

  describe('service re-exports', () => {
    it('exposes the same helpers from pivotCreatorPublishConfigService', () => {
      const tenant = { creatorPublish: { defaultIngestStatus: 'draft' } };
      expect(resolveFromService(tenant).defaultIngestStatus).toBe('draft');

      const start = new Date('2026-05-23T19:00:00.000Z');
      expect(computeFromService(start, {}).batchWeek).toBe(toIsoWeek(start));
    });
  });
});
