const {
  CONTRACT_VERSION,
  COMPUTE_JOB_KINDS,
  ALWAYS_ENABLED_COMPUTE_JOB_KINDS,
  CAROUSEL_COMPOSE_JOB_KIND,
  CAROUSEL_COMPOSE_ENV_FLAG,
  CAROUSEL_COMPOSE_LIMITS,
  EDITORIAL_COMPOSITION_CAPABILITY,
  NO_POST_DISPOSITIONS,
  FORBIDDEN_IMPORTABLE_KEYS,
  enabledComputeJobKinds,
  isCarouselComposeEnabled,
  isComputeJobKindEnabled,
  collectAgentContextViolations,
  isNoPostComposeResult,
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
const { buildEventProposalFromEntry } = require('../../services/pivotDiscoverySinks');

describe('Pivot admin compute job contracts v1 (Phase 1, Step 1.2)', () => {
  it('locks contract version and supported compute kinds', () => {
    expect(CONTRACT_VERSION).toBe('1');
    expect(COMPUTE_JOB_KINDS).toEqual([
      'city-source-discovery',
      'city-curation-refresh',
      'carousel-export',
      'carousel-compose',
    ]);
    expect(ALWAYS_ENABLED_COMPUTE_JOB_KINDS).toEqual([
      'city-source-discovery',
      'city-curation-refresh',
      'carousel-export',
    ]);
  });

  it('keeps carousel-compose describable but disabled until an operator enables it', () => {
    expect(isCarouselComposeEnabled({})).toBe(false);
    expect(enabledComputeJobKinds({})).toEqual(ALWAYS_ENABLED_COMPUTE_JOB_KINDS);
    expect(isComputeJobKindEnabled(CAROUSEL_COMPOSE_JOB_KIND, {})).toBe(false);
    expect(isComputeJobKindEnabled('carousel-export', {})).toBe(true);

    const enabled = { [CAROUSEL_COMPOSE_ENV_FLAG]: 'true' };
    expect(isCarouselComposeEnabled(enabled)).toBe(true);
    expect(enabledComputeJobKinds(enabled)).toContain(CAROUSEL_COMPOSE_JOB_KIND);

    for (const off of ['', '   ', '0', 'false', 'off', 'no', 'maybe']) {
      expect(isCarouselComposeEnabled({ [CAROUSEL_COMPOSE_ENV_FLAG]: off })).toBe(false);
    }
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
    it('accepts only bounded approved rules in refresh context', () => {
      const context = loadFixture('context-refresh-valid.json');
      context.jobs[0].extractionRules = [{ id: 'rule-1', field: 'image', reason: 'venue_logo',
        badValue: 'https://venue.example/logo.png', status: 'active' }];
      expect(validateContextSnapshot(context)).toEqual({ valid: true });
      context.jobs[0].extractionRules[0].status = 'proposed';
      expect(validateContextSnapshot(context).valid).toBe(false);
    });
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

    it('carries bounded scrape image evidence in refresh event proposals', () => {
      const result = loadFixture('result-refresh-valid-completed.json');
      const proposal = result.proposals.jobOutcomes?.[0]?.events?.[0]
        || result.proposals.events?.[0];
      expect(proposal).toBeDefined();
      proposal.draft.scrapeEvidence = {
        imageCandidates: ['https://venue.example/poster.jpg'], appliedRuleIds: ['rule-1'],
      };
      expect(validateExecutionResult(result)).toEqual({ valid: true });
      proposal.draft.scrapeEvidence.imageCandidates.push('http://localhost/logo.png');
      expect(validateExecutionResult(result).valid).toBe(false);
    });

    it('preserves only safe image evidence when building an offloaded event proposal', () => {
      const proposal = buildEventProposalFromEntry({ draft: {
        name: 'Open Mic', sourceUrl: 'https://venue.example/show',
        start_time: '2026-09-26T20:00:00Z',
        scrapeEvidence: { imageCandidates: ['https://venue.example/poster.jpg',
          'http://localhost/logo.png'], appliedRuleIds: ['logo-rule'] },
      } }, { provider: 'generic-site', defaultTags: ['music'] });
      expect(proposal.draft.scrapeEvidence).toEqual({
        imageCandidates: ['https://venue.example/poster.jpg'], appliedRuleIds: ['logo-rule'],
      });
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
      expect(capability.supportedKinds).toEqual(ALWAYS_ENABLED_COMPUTE_JOB_KINDS);
      expect(capability.capabilities.executionModes).toEqual(
        expect.arrayContaining(['artifact-only']),
      );
    });

    it('requires the narrow composition capability before advertising carousel-compose', () => {
      expect(validateWorkerCapability(loadFixture('worker-capability-compose-valid.json')))
        .toEqual({ valid: true });

      const missing = validateWorkerCapability(loadFixture('worker-capability-compose-unsupported.json'));
      expect(missing.valid).toBe(false);
      expect(missing.errors).toEqual(expect.arrayContaining([
        expect.stringContaining(EDITORIAL_COMPOSITION_CAPABILITY),
      ]));

      for (const incapable of [{ structuredOutput: false }, { imageReview: false }]) {
        const capability = loadFixture('worker-capability-compose-valid.json');
        Object.assign(capability.capabilities.editorialComposition, incapable);
        expect(validateWorkerCapability(capability).valid).toBe(false);
      }
    });

    it('still accepts a legacy worker that knows nothing about composition', () => {
      const legacy = loadFixture('worker-capability-valid.json');
      expect(legacy.capabilities.editorialComposition).toBeUndefined();
      expect(validateWorkerCapability(legacy)).toEqual({ valid: true });
    });
  });

  describe('carousel-compose editorial job', () => {
    it('accepts a bound compose request and refuses render material in its options', () => {
      const request = loadFixture('job-request-compose-valid.json');
      expect(validateJobRequest(request)).toEqual({ valid: true });
      expect(request.options).toMatchObject({
        accountId: expect.stringMatching(/^[0-9a-f]{24}$/),
        format: 'city-picks',
        sourceTenantKeys: ['iowacity'],
        policyVersion: expect.stringMatching(/^pol:/),
        feedbackVersion: expect.stringMatching(/^fb:/),
      });
      expect(request.options.proposedPublicationWindow.timezone).toBe('America/Chicago');
      expect(request.idempotencyKey).toMatch(/^idem:/);

      expect(validateJobRequest(loadFixture('job-request-compose-invalid-render-token.json')))
        .toEqual({ valid: false, errors: expect.arrayContaining(['$.options.renderToken: unknown field']) });
    });

    it('requires every binding the apply path later rechecks', () => {
      for (const field of ['accountId', 'format', 'sourceTenantKeys', 'proposedPublicationWindow', 'policyVersion', 'feedbackVersion']) {
        const request = loadFixture('job-request-compose-valid.json');
        delete request.options[field];
        expect(validateJobRequest(request).valid).toBe(false);
      }
      for (const field of ['idempotencyKey', 'contextVersion', 'requestedAt']) {
        const request = loadFixture('job-request-compose-valid.json');
        delete request[field];
        expect(validateJobRequest(request).valid).toBe(false);
      }
    });

    it('accepts an agent-visible context with no render or upload grant', () => {
      const context = loadFixture('context-compose-valid.json');
      expect(validateContextSnapshot(context)).toEqual({ valid: true });
      expect(context.renderToken).toBeUndefined();
      expect(context.artifactUploadGrant).toBeUndefined();
      expect(collectAgentContextViolations(context)).toEqual([]);
      expect(context.attemptId).toMatch(/^[0-9a-f]{24}$/);
      expect(context.policy.policyVersion).toMatch(/^pol:/);
      expect(Object.keys(context.policy.proposed).length).toBeGreaterThan(0);
      expect(context.policy.openChoices.length).toBeGreaterThan(0);
    });

    it('names the leaked grant rather than calling it an unknown field', () => {
      const leaked = validateContextSnapshot(loadFixture('context-compose-invalid-render-grant.json'));
      expect(leaked.valid).toBe(false);
      expect(leaked.errors).toEqual([
        expect.stringContaining('root.renderToken'),
      ]);
      expect(leaked.errors[0]).toContain('root.artifactUploadGrant');
    });

    it('refuses candidates and coverage outside the account\'s permitted source tenants', () => {
      const strayCandidate = loadFixture('context-compose-valid.json');
      strayCandidate.candidates[1].sourceTenantKey = 'chicago';
      expect(validateContextSnapshot(strayCandidate)).toEqual({
        valid: false,
        errors: expect.arrayContaining([expect.stringContaining('outside the account')]),
      });

      const strayCoverage = loadFixture('context-compose-valid.json');
      strayCoverage.coverage.requestedTenantKeys = ['iowacity', 'chicago'];
      expect(validateContextSnapshot(strayCoverage).valid).toBe(false);

      const wrongOwner = loadFixture('context-compose-valid.json');
      wrongOwner.cityKey = 'chicago';
      expect(validateContextSnapshot(wrongOwner)).toEqual({
        valid: false,
        errors: expect.arrayContaining([expect.stringContaining('editorial account owner tenant')]),
      });
    });

    it('treats wait and needs-editor as completed executions that produce no issue', () => {
      for (const fixture of ['result-compose-wait.json', 'result-compose-needs-editor.json']) {
        const result = loadFixture(fixture);
        expect(validateExecutionResult(result)).toEqual({ valid: true });
        expect(result.outcome).toBe('completed');
        expect(result.proposal).toBeNull();
        expect(NO_POST_DISPOSITIONS).toContain(result.decision.disposition);
        expect(isNoPostComposeResult(result)).toBe(true);
      }
      expect(isNoPostComposeResult(loadFixture('result-compose-valid-ready.json'))).toBe(false);
      expect(isNoPostComposeResult(loadFixture('result-carousel-valid-completed.json'))).toBe(false);
    });

    it('requires a wait decision to say when or on what change to reconsider', () => {
      const result = loadFixture('result-compose-wait.json');
      result.decision.reconsiderAt = null;
      result.decision.reconsiderTrigger = null;
      expect(validateExecutionResult(result)).toEqual({
        valid: false,
        errors: expect.arrayContaining([expect.stringContaining('when or on what change')]),
      });
    });

    it('accepts a reviewed proposal and binds it to the policy and feedback it saw', () => {
      const result = loadFixture('result-compose-valid-ready.json');
      expect(validateExecutionResult(result)).toEqual({ valid: true });
      expect(result.decision.basedOnPolicyVersion).toMatch(/^pol:/);
      expect(result.decision.basedOnFeedbackVersion).toMatch(/^fb:/);
      expect(result.proposal.proposalIdempotencyKey).toMatch(/^idem:/);
      expect(result.proposal.eventSlides).toHaveLength(3);
      expect(result.proposal.socialCaption).toBeTruthy();
      expect(result.proposal.review.disposition).toBe('ready-for-review');
      expect(collectForbiddenImportableViolations(result)).toEqual([]);
    });

    it('refuses a one-event issue and a no-post decision that still proposes one', () => {
      expect(validateExecutionResult(loadFixture('result-compose-invalid-single-event.json'))).toEqual({
        valid: false,
        errors: expect.arrayContaining([expect.stringContaining('$.proposal.eventSlides')]),
      });
      expect(validateExecutionResult(loadFixture('result-compose-invalid-wait-with-proposal.json'))).toEqual({
        valid: false,
        errors: expect.arrayContaining([expect.stringContaining('must not propose an issue')]),
      });
      expect(CAROUSEL_COMPOSE_LIMITS.minEventSlides).toBe(2);
    });

    it('refuses an unreviewed, duplicated, or decision-mismatched proposal', () => {
      const unreviewed = loadFixture('result-compose-valid-ready.json');
      unreviewed.proposal.review.disposition = 'repair';
      expect(validateExecutionResult(unreviewed).valid).toBe(false);

      const uninspected = loadFixture('result-compose-valid-ready.json');
      uninspected.proposal.review.inspectedSlides = 2;
      expect(validateExecutionResult(uninspected)).toEqual({
        valid: false,
        errors: expect.arrayContaining([expect.stringContaining('every rendered slide must be inspected')]),
      });

      const duplicated = loadFixture('result-compose-valid-ready.json');
      duplicated.proposal.eventSlides[2].eventRef = duplicated.proposal.eventSlides[0].eventRef;
      expect(validateExecutionResult(duplicated)).toEqual({
        valid: false,
        errors: expect.arrayContaining([expect.stringContaining('cannot appear twice')]),
      });

      const mismatched = loadFixture('result-compose-valid-ready.json');
      mismatched.decision.selectedEventRefs = mismatched.decision.selectedEventRefs.slice(0, 2);
      expect(validateExecutionResult(mismatched)).toEqual({
        valid: false,
        errors: expect.arrayContaining([expect.stringContaining('selected event references')]),
      });
    });

    it('refuses an oversized compose result instead of embedding slide bytes', () => {
      const oversized = loadFixture('result-compose-valid-ready.json');
      oversized.proposal.editorialAngle = 'x'.repeat(2000);
      expect(validateExecutionResult(oversized).valid).toBe(false);

      const inflated = loadFixture('result-compose-valid-ready.json');
      inflated.decision.briefReasons = Array.from(
        { length: 10 },
        () => 'y'.repeat(1000),
      );
      inflated.decision.evidenceGaps = Array.from({ length: 20 }, () => 'z'.repeat(500));
      expect(validateExecutionResult(inflated).valid).toBe(true);
      expect(CAROUSEL_COMPOSE_LIMITS.maxResultBytes).toBe(1024 * 1024);
    });

    it('refuses a proposal on a failed or cancelled execution', () => {
      for (const outcome of ['failed', 'cancelled']) {
        const result = loadFixture('result-compose-valid-ready.json');
        result.outcome = outcome;
        result.failure = { code: 'PROVIDER_EXHAUSTED', message: 'Both configured accounts are out of allowance.' };
        expect(validateExecutionResult(result)).toEqual({
          valid: false,
          errors: expect.arrayContaining([expect.stringContaining('only a completed execution')]),
        });
      }
      const failed = loadFixture('result-compose-wait.json');
      failed.outcome = 'failed';
      expect(validateExecutionResult(failed)).toEqual({
        valid: false,
        errors: expect.arrayContaining([expect.stringContaining('must record a failure')]),
      });
    });

    it('keeps compose results out of the discovery, refresh, and export shapes', () => {
      const compose = loadFixture('result-compose-valid-ready.json');
      expect(compose.proposals).toBeUndefined();
      expect(compose.artifacts).toBeUndefined();
      expect(compose.summary).toBeUndefined();

      const exportResult = loadFixture('result-carousel-valid-completed.json');
      expect(exportResult.decision).toBeUndefined();
      expect(exportResult.proposal).toBeUndefined();
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
          'job-request-compose-valid.json',
          'job-request-compose-invalid-render-token.json',
          'context-compose-valid.json',
          'context-compose-invalid-render-grant.json',
          'result-compose-valid-ready.json',
          'result-compose-wait.json',
          'result-compose-needs-editor.json',
          'result-compose-invalid-single-event.json',
          'result-compose-invalid-wait-with-proposal.json',
          'worker-capability-compose-valid.json',
          'worker-capability-compose-unsupported.json',
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
