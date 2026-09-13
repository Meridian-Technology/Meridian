const {
  CONTRACT_VERSION,
  COMPUTE_JOB_KINDS,
  FORBIDDEN_IMPORTABLE_KEYS,
  collectForbiddenImportableViolations,
  validateJobRequest,
  validateContextSnapshot,
  validateExecutionResult,
  prepareExecutionResultForRepair,
  validateDiagnosticExport,
  validateWorkerCapability,
  validateResultPreview,
  loadFixture,
  listFixtures,
  isStaleContextPreview,
} = require('../../utilities/pivotAdminComputeJobContract');

describe('Pivot admin compute job contracts v1 (Phase 1, Step 1.2)', () => {
  it('locks contract version and supported compute kinds', () => {
    expect(CONTRACT_VERSION).toBe('1');
    expect(COMPUTE_JOB_KINDS).toEqual([
      'city-source-discovery',
      'city-curation-refresh',
      'carousel-export',
    ]);
  });

  describe('job request', () => {
    it('accepts valid discovery and refresh requests from fixtures', () => {
      expect(validateJobRequest(loadFixture('job-request-discovery-valid.json'))).toEqual({ valid: true });
      expect(validateJobRequest(loadFixture('job-request-refresh-valid.json'))).toEqual({ valid: true });
      expect(validateJobRequest(loadFixture('job-request-carousel-valid.json'))).toEqual({ valid: true });
    });

    it('requires stable ids, kind, cityKey, contract/context versions, and timestamps', () => {
      const required = [
        'contractVersion',
        'jobId',
        'scheduleOccurrenceId',
        'kind',
        'cityKey',
        'implementationRevision',
        'contextVersion',
        'requestedAt',
        'options',
      ];
      for (const field of required) {
        const request = loadFixture('job-request-discovery-valid.json');
        delete request[field];
        expect(validateJobRequest(request).valid).toBe(false);
      }
    });

    it('rejects unknown fields and unsafe request options', () => {
      expect(validateJobRequest(loadFixture('job-request-invalid-unknown-field.json')).valid).toBe(false);
      const withCommand = loadFixture('job-request-discovery-valid.json');
      withCommand.options.command = 'require("./evil")';
      expect(validateJobRequest(withCommand).valid).toBe(false);
    });

    it('bounds discovery and refresh options per kind', () => {
      const tooManyTags = loadFixture('job-request-discovery-valid.json');
      tooManyTags.options.tags = Array.from({ length: 17 }, (_, index) => `tag-${index}`);
      expect(validateJobRequest(tooManyTags).valid).toBe(false);

      const tooManyJobs = loadFixture('job-request-refresh-valid.json');
      tooManyJobs.options.jobIds = Array.from({ length: 101 }, () => '507f1f77bcf86cd799439011');
      expect(validateJobRequest(tooManyJobs).valid).toBe(false);
    });
  });

  describe('context snapshot', () => {
    it('accepts bounded discovery and refresh context snapshots', () => {
      expect(validateContextSnapshot(loadFixture('context-discovery-valid.json'))).toEqual({ valid: true });
      expect(validateContextSnapshot(loadFixture('context-refresh-valid.json'))).toEqual({ valid: true });
      expect(validateContextSnapshot(loadFixture('context-carousel-valid.json'))).toEqual({ valid: true });
    });

    it('includes tenant, identity, and capability material without credentials', () => {
      const context = loadFixture('context-discovery-valid.json');
      expect(context.tenant.cityKey).toBe('iowacity');
      expect(context.sources[0].recordVersion).toMatch(/^rv:/);
      expect(context.organizers[0].normalizedName).toBeTruthy();
      expect(context.providerCapabilities.firecrawlConfigured).toBe(true);
      expect(collectForbiddenImportableViolations(context)).toEqual([]);
    });

    it('rejects mixed-kind context payloads', () => {
      const mixed = loadFixture('context-discovery-valid.json');
      mixed.kind = 'city-curation-refresh';
      expect(validateContextSnapshot(mixed).valid).toBe(false);
    });
  });

  describe('execution result (importable proposals only)', () => {
    it('accepts valid completed discovery and refresh results', () => {
      expect(validateExecutionResult(loadFixture('result-discovery-valid-completed.json'))).toEqual({ valid: true });
      expect(validateExecutionResult(loadFixture('result-refresh-valid-completed.json'))).toEqual({ valid: true });
      expect(validateExecutionResult(loadFixture('result-carousel-valid-completed.json'))).toEqual({ valid: true });
    });

    it('rejects unsupported carousel artifacts and oversized or incomplete manifests', () => {
      const unsupported = loadFixture('result-carousel-valid-completed.json');
      unsupported.artifacts[0].mimeType = 'image/jpeg';
      expect(validateExecutionResult(unsupported).valid).toBe(false);

      const incomplete = loadFixture('result-carousel-valid-completed.json');
      incomplete.artifacts.pop();
      expect(validateExecutionResult(incomplete)).toEqual({
        valid: false,
        errors: expect.arrayContaining([expect.stringContaining('exactly one ZIP')]),
      });

      const single = loadFixture('result-carousel-valid-completed.json');
      single.slideCount = 1;
      single.artifacts = [single.artifacts[0]];
      expect(validateExecutionResult(single)).toEqual({ valid: true });

      const zippedSingle = { ...single, artifacts: [...single.artifacts, incomplete.artifacts[incomplete.artifacts.length - 1]] };
      zippedSingle.artifacts = [
        single.artifacts[0],
        loadFixture('result-carousel-valid-completed.json').artifacts[2],
      ];
      expect(validateExecutionResult(zippedSingle)).toEqual({
        valid: false,
        errors: expect.arrayContaining([expect.stringContaining('must not include a ZIP')]),
      });

      const oversized = loadFixture('result-carousel-valid-completed.json');
      oversized.artifacts[0].byteCount = 67108865;
      expect(validateExecutionResult(oversized).valid).toBe(false);
    });

    it('accepts failed outcomes with empty proposals but no diagnostics mixed in', () => {
      expect(validateExecutionResult(loadFixture('result-discovery-failed.json'))).toEqual({ valid: true });
    });

    it('requires basedOnContextVersion and idempotency keys for replay safety', () => {
      for (const fixtureName of [
        'result-discovery-valid-completed.json',
        'result-refresh-valid-completed.json',
      ]) {
        const result = loadFixture(fixtureName);
        expect(result.basedOnContextVersion).toMatch(/^ctx:/);
        expect(result.idempotencyKey).toMatch(/^idem:/);
      }
    });

    it('rejects diagnostics, logs, memory, and internal ids in importable results', () => {
      const withLogs = loadFixture('result-invalid-with-logs.json');
      expect(validateExecutionResult(withLogs).valid).toBe(false);
      expect(collectForbiddenImportableViolations(withLogs)).toContain('root.logs');

      const withMemory = loadFixture('result-discovery-valid-completed.json');
      withMemory.memory = { startedFreeBytes: 1 };
      expect(validateExecutionResult(withMemory).valid).toBe(false);

      const withInternalRun = loadFixture('result-discovery-valid-completed.json');
      withInternalRun.internalRunId = '64f1234567890abcdef999999';
      expect(validateExecutionResult(withInternalRun).valid).toBe(false);
    });

    it('rejects command, module, path, callback, query, and credential fields', () => {
      for (const [field, value] of [
        ['command', 'node evil.js'],
        ['module', 'Meridian/backend/services/pivotSourceDiscoveryService.js'],
        ['filesystemPath', '/Users/admin/secret.json'],
        ['callbackUrl', 'https://attacker.example.test/hook'],
        ['query', 'db.sources.find({})'],
        ['credential', 'super-secret'],
      ]) {
        const result = loadFixture('result-discovery-valid-completed.json');
        result[field] = value;
        expect(validateExecutionResult(result).valid).toBe(false);
      }
      expect(FORBIDDEN_IMPORTABLE_KEYS).toEqual(expect.arrayContaining(['command', 'module', 'callbackUrl']));
    });

    it('keeps discovery and refresh proposal shapes separate', () => {
      const discovery = loadFixture('result-discovery-valid-completed.json');
      expect(discovery.proposals.sources).toBeDefined();
      expect(discovery.proposals.jobOutcomes).toBeUndefined();

      const refresh = loadFixture('result-refresh-valid-completed.json');
      expect(refresh.proposals.jobOutcomes).toBeDefined();
      expect(refresh.proposals.sources).toBeUndefined();
    });

    it('returns bounded field paths for invalid execution results', () => {
      const refresh = loadFixture('result-refresh-valid-completed.json');
      refresh.proposals.events[0].draft.description = 'x'.repeat(5001);
      refresh.proposals.events[0].draft.image = 'http://unsafe.example.test/poster.jpg';

      const validation = validateExecutionResult(refresh);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('$.proposals.events[0].draft.description'),
        expect.stringContaining('$.proposals.events[0].draft.image'),
      ]));
    });

    it('clones and revalidates quarantined results through the repair hook', () => {
      const candidate = loadFixture('result-refresh-valid-completed.json');
      const prepared = prepareExecutionResultForRepair(candidate);
      expect(prepared).toMatchObject({ valid: true, result: candidate });
      expect(prepared.result).not.toBe(candidate);

      candidate.proposals.events[0].draft.description = 'x'.repeat(5001);
      const invalid = prepareExecutionResultForRepair(candidate);
      expect(invalid.valid).toBe(false);
      expect(invalid.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('$.proposals.events[0].draft.description'),
      ]));
    });
  });

  describe('diagnostic export', () => {
    it('accepts worker-local diagnostics separated from importable proposals', () => {
      expect(validateDiagnosticExport(loadFixture('diagnostic-export-valid.json'))).toEqual({ valid: true });
    });

    it('allows logs, memory, internal run ids, and provider call counts only in diagnostics', () => {
      const diagnostics = loadFixture('diagnostic-export-valid.json').diagnostics;
      expect(Array.isArray(diagnostics.logs)).toBe(true);
      expect(diagnostics.memory.startedFreeBytes).toBeGreaterThan(0);
      expect(diagnostics.internalRunId).toMatch(/^[0-9a-f]{24}$/);
      expect(diagnostics.providerCalls.scrapes).toBe(2);
    });
  });

  describe('worker capability', () => {
    it('advertises supported contract versions, kinds, and execution modes', () => {
      const capability = loadFixture('worker-capability-valid.json');
      expect(validateWorkerCapability(capability)).toEqual({ valid: true });
      expect(capability.supportedContractVersions).toEqual(['1']);
      expect(capability.supportedKinds).toEqual(COMPUTE_JOB_KINDS);
      expect(capability.capabilities.executionModes).toEqual(
        expect.arrayContaining(['artifact-only']),
      );
    });
  });

  describe('result application preview', () => {
    it('accepts a valid preview with create rows and applyAllowed=true', () => {
      expect(validateResultPreview(loadFixture('result-preview-valid.json'))).toEqual({ valid: true });
    });

    it('marks stale previews as not applyable', () => {
      const preview = loadFixture('result-preview-stale.json');
      expect(validateResultPreview(preview)).toEqual({ valid: true });
      expect(preview.applyAllowed).toBe(false);
      expect(preview.rows[0].action).toBe('stale');
      expect(isStaleContextPreview(preview, 'ctx:iowacity.refresh.v7')).toBe(true);
    });

    it('classifies unchanged, conflict, rejected, and stale preview actions', () => {
      const preview = loadFixture('result-preview-stale.json');
      expect(preview.summary.stale).toBe(1);
      expect(preview.blockingReasons[0].code).toBe('STALE_CONTEXT');
    });
  });

  describe('compatibility fixtures', () => {
    it('ships representative valid, invalid, stale, duplicate, failed, discovery, and refresh fixtures', () => {
      const fixtures = listFixtures();
      expect(fixtures).toEqual(
        expect.arrayContaining([
          'job-request-discovery-valid.json',
          'job-request-refresh-valid.json',
          'job-request-carousel-valid.json',
          'job-request-invalid-unknown-field.json',
          'context-discovery-valid.json',
          'context-refresh-valid.json',
          'context-carousel-valid.json',
          'result-discovery-valid-completed.json',
          'result-discovery-failed.json',
          'result-refresh-valid-completed.json',
          'result-carousel-valid-completed.json',
          'result-duplicate-idempotency.json',
          'result-stale-context-version.json',
          'result-invalid-with-logs.json',
          'diagnostic-export-valid.json',
          'worker-capability-valid.json',
          'result-preview-valid.json',
          'result-preview-stale.json',
        ]),
      );
    });

    it('keeps duplicate idempotency submissions structurally valid for replay checks', () => {
      const duplicate = loadFixture('result-duplicate-idempotency.json');
      const original = loadFixture('result-discovery-valid-completed.json');
      expect(duplicate.idempotencyKey).toBe(original.idempotencyKey);
      expect(validateExecutionResult(duplicate).valid).toBe(true);
    });

    it('records stale context versions without breaking result shape', () => {
      const stale = loadFixture('result-stale-context-version.json');
      expect(stale.basedOnContextVersion).toBe('ctx:iowacity.refresh.v6');
      expect(validateExecutionResult(stale).valid).toBe(true);
      expect(isStaleContextPreview(
        { basedOnContextVersion: stale.basedOnContextVersion },
        'ctx:iowacity.refresh.v7',
      )).toBe(true);
    });
  });
});
