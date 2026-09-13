import {
  COMPUTE_CONTRACT_VERSION,
  formatPreviewAction,
  parseUploadedResultText,
  previewAllowsApply,
  previewApplyWarnings,
  previewBlockingMessage,
  validateParsedResult,
  validateUploadedResultText,
} from './pivotComputeJobReviewFormat';

describe('pivotComputeJobReviewFormat', () => {
  const VALID_RESULT = {
    contractVersion: COMPUTE_CONTRACT_VERSION,
    jobId: 'job:discovery-iowacity-001',
    scheduleOccurrenceId: null,
    kind: 'city-source-discovery',
    cityKey: 'iowacity',
    implementationRevision: 'relay-worker@2026.09.08',
    basedOnContextVersion: 'ctx:iowacity.discovery.v3',
    completedAt: '2026-09-08T20:45:00.000Z',
    outcome: 'completed',
    idempotencyKey: 'idem:discovery-iowacity-001',
    proposals: { sources: [], curationJobs: [], events: [] },
    summary: { searched: 1, qualified: 1, rejected: 0, eventsProposed: 0 },
  };

  it('rejects invalid JSON, unknown versions, city mismatches, and failed outcomes', () => {
    expect(parseUploadedResultText('{').errors[0]).toMatch(/not valid/i);
    expect(validateParsedResult({ ...VALID_RESULT, contractVersion: '2' }, { tenantKey: 'iowacity' })[0])
      .toMatch(/Unsupported contract version/i);
    expect(validateParsedResult({ ...VALID_RESULT, cityKey: 'nyc' }, { tenantKey: 'iowacity' })[0])
      .toMatch(/City mismatch/i);
    expect(validateParsedResult({ ...VALID_RESULT, outcome: 'failed' }, { tenantKey: 'iowacity' })[0])
      .toMatch(/Only completed results/i);
  });

  it('rejects diagnostic fields in importable results', () => {
    const errors = validateParsedResult({
      ...VALID_RESULT,
      logs: ['secret step'],
    }, { tenantKey: 'iowacity' });
    expect(errors[0]).toMatch(/diagnostic fields/i);
  });

  it('labels preview actions and blocking messages', () => {
    expect(formatPreviewAction('stale').label).toBe('Stale');
    expect(previewAllowsApply({ applyAllowed: true })).toBe(true);
    expect(previewBlockingMessage({
      applyAllowed: false,
      blockingReasons: [{ code: 'STALE_CONTEXT', message: 'Context moved on.' }],
    })).toMatch(/STALE_CONTEXT/);
    expect(previewApplyWarnings({
      applyWarnings: [{ code: 'MISSING_REQUIRED_EVENT_FIELDS', message: '2 rows will be skipped.' }],
    })).toHaveLength(1);
  });

  it('validates uploaded text end-to-end', () => {
    const validated = validateUploadedResultText(JSON.stringify(VALID_RESULT), { tenantKey: 'iowacity' });
    expect(validated.errors).toEqual([]);
    expect(validated.result.jobId).toBe('job:discovery-iowacity-001');
  });
});
