import {
  describeComputeJobWake,
  formatAge,
  formatComputeJobKind,
  formatComputeJobOrigin,
  formatFailure,
  formatProgress,
  hasActiveComputeJobs,
  redactSensitiveFields,
  resolveScheduleOccurrenceId,
  summarizeStoredResult,
} from './pivotComputeJobsFormat';

describe('pivotComputeJobsFormat', () => {
  it('describes a development run separately from a Mini wake', () => {
    const messages = {
      local: 'local',
      accepted: 'accepted',
      queued: 'queued',
    };
    expect(describeComputeJobWake({ status: 'local' }, messages)).toBe('local');
    expect(describeComputeJobWake({ status: 'accepted' }, messages)).toBe('accepted');
    expect(describeComputeJobWake({ status: 'failed' }, messages)).toBe('queued');
  });

  it('labels discovery, refresh, and carousel kinds', () => {
    expect(formatComputeJobKind('city-source-discovery')).toBe('Source discovery');
    expect(formatComputeJobKind('city-curation-refresh')).toBe('Curation refresh');
    expect(formatComputeJobKind('carousel-export')).toBe('Carousel export');
  });

  it('labels admin, schedule, and manual origins', () => {
    expect(formatComputeJobOrigin({ type: 'admin', requestedBy: 'admin@example.com' }))
      .toBe('Admin request · admin@example.com');
    expect(formatComputeJobOrigin({ type: 'schedule', scheduleId: 'discovery-nightly' }))
      .toBe('Scheduled · discovery-nightly');
    expect(formatComputeJobOrigin({ type: 'manual-upload', requestedBy: 'ops@example.com' }))
      .toBe('Manual upload · ops@example.com');
  });

  it('formats age, progress, and bounded failures', () => {
    const now = Date.parse('2026-09-08T21:00:00.000Z');
    expect(formatAge('2026-09-08T20:30:00.000Z', now)).toBe('30m');
    expect(formatProgress({
      phase: 'crawl',
      message: 'Fetching candidates',
      counters: { candidates: 3, qualified: 1 },
    })).toContain('crawl');
    expect(formatFailure({ code: 'PROVIDER_TIMEOUT', message: 'x'.repeat(300) }).length)
      .toBeLessThanOrEqual(240);
  });

  it('detects active jobs and redacts sensitive fields', () => {
    expect(hasActiveComputeJobs([{ status: 'running' }, { status: 'completed' }])).toBe(true);
    expect(hasActiveComputeJobs([{ status: 'completed' }])).toBe(false);
    expect(redactSensitiveFields({
      workerId: 'mini-1',
      lease: { token: 'secret-token', workerId: 'mini-1' },
      result: { embedded: { proposals: [] } },
    })).toEqual({
      workerId: 'mini-1',
      lease: { workerId: 'mini-1' },
      result: {},
    });
  });

  it('summarizes stored results without embedded payloads', () => {
    expect(summarizeStoredResult({
      mode: 'embedded',
      contractVersion: '1',
      submittedAt: '2026-09-08T20:10:00.000Z',
      resultIdempotencyKey: 'res:001',
      embedded: { proposals: [] },
    })).toEqual({
      mode: 'embedded',
      contractVersion: '1',
      submittedAt: '2026-09-08T20:10:00.000Z',
      resultIdempotencyKey: 'res:001',
      hasEmbeddedResult: true,
      embeddedByteSize: 16,
      embeddedSummary: null,
      artifactRef: null,
    });
  });

  it('resolves schedule occurrence ids from job or origin', () => {
    expect(resolveScheduleOccurrenceId({
      scheduleOccurrenceId: 'sched:discovery@2026-09-08T12:00:00.000Z',
    })).toBe('sched:discovery@2026-09-08T12:00:00.000Z');
    expect(resolveScheduleOccurrenceId({
      origin: { scheduleOccurrenceId: 'sched:refresh@2026-09-08T13:00:00.000Z' },
    })).toBe('sched:refresh@2026-09-08T13:00:00.000Z');
  });
});
