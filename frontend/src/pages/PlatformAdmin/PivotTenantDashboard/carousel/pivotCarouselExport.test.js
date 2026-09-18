import {
  ARTIFACTS_EXPIRED_COPY,
  buildCarouselExportJobRequest,
  carouselExportIdempotencyKey,
  carouselComputeJobsHref,
  carouselEditorHref,
  deriveExportUiState,
  exportFailureLabel,
  formatExportProgress,
  isCarouselExportUiEnabled,
  isRevisionStale,
  pickDeckExportJob,
  readExportSession,
  writeExportSession,
} from './pivotCarouselExport';

const DECK = '507f1f77bcf86cd799439011';

function job(overrides = {}) {
  return {
    externalJobId: 'job:carousel-iowacity-001',
    kind: 'carousel-export',
    status: 'pending',
    options: { deckId: DECK, deckRevision: '2026-09-11T19:58:00.000Z' },
    ...overrides,
  };
}

describe('carousel export helpers', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('builds a tenant-bound carousel create request', () => {
    const request = buildCarouselExportJobRequest({
      tenantKey: 'IowaCity',
      deckId: DECK,
      deckRevision: '2026-09-11T19:58:00.000Z',
      idempotencyKey: 'idem:carousel-iowacity-001',
      now: Date.parse('2026-09-11T20:00:00.000Z'),
    });

    expect(request).toMatchObject({
      contractVersion: '1',
      kind: 'carousel-export',
      cityKey: 'iowacity',
      jobId: `job:carousel-iowacity-${Date.parse('2026-09-11T20:00:00.000Z')}`,
      idempotencyKey: 'idem:carousel-iowacity-001',
      contextVersion: 'ctx:carousel.pending',
      options: {
        deckId: DECK,
        deckRevision: '2026-09-11T19:58:00.000Z',
      },
    });
  });

  it('builds idempotency keys the compute contract accepts', () => {
    const pattern = /^[a-zA-Z0-9:_-]{8,128}$/;
    const multi = carouselExportIdempotencyKey({
      tenantKey: 'iowacity',
      deckId: DECK,
      slideNumbers: [1, 2, 3],
      now: 1758157730123,
    });
    expect(multi).toBe(`idem:carousel-iowacity-${DECK}-1-2-3-1758157730123`);
    expect(multi).toMatch(pattern);

    const dotted = carouselExportIdempotencyKey({
      reuseKey: `idem:carousel-iowacity-${DECK}-1.2.3-1758157730123`,
      tenantKey: 'iowacity',
      deckId: DECK,
      now: 1758157730999,
    });
    expect(dotted).toBe(`idem:carousel-iowacity-${DECK}-all-1758157730999`);
    expect(dotted).toMatch(pattern);

    const longSelection = carouselExportIdempotencyKey({
      tenantKey: 'iowacity',
      deckId: DECK,
      slideNumbers: Array.from({ length: 40 }, (_, index) => index + 1),
      now: 1758157730123,
    });
    expect(longSelection.length).toBeLessThanOrEqual(128);
    expect(longSelection).toMatch(pattern);
    expect(longSelection).toContain('-sel-');
  });

  it('names only the slides that are not the whole deck', () => {
    const subset = buildCarouselExportJobRequest({
      tenantKey: 'iowacity',
      deckId: DECK,
      deckRevision: '2026-09-11T19:58:00.000Z',
      idempotencyKey: 'idem:carousel-iowacity-001',
      slideNumbers: [2],
      slideCount: 3,
    });
    expect(subset.options.slideNumbers).toEqual([2]);

    const whole = buildCarouselExportJobRequest({
      tenantKey: 'iowacity',
      deckId: DECK,
      deckRevision: '2026-09-11T19:58:00.000Z',
      idempotencyKey: 'idem:carousel-iowacity-001',
      slideNumbers: [1, 2, 3],
      slideCount: 3,
    });
    expect(whole.options.slideNumbers).toBeUndefined();
  });

  it('maps job and wake into distinct export states', () => {
    expect(deriveExportUiState({ creating: true })).toBe('creating');
    expect(deriveExportUiState({ job: job(), wake: { status: 'accepted' } })).toBe('relay-notified');
    expect(deriveExportUiState({ job: job({ status: 'leased' }) })).toBe('waiting-for-worker');
    expect(deriveExportUiState({
      job: job({ status: 'running', progress: { phase: 'rendering' } }),
    })).toBe('rendering');
    expect(deriveExportUiState({
      job: job({ status: 'running', progress: { phase: 'uploading' } }),
    })).toBe('uploading');
    expect(deriveExportUiState({ job: job({ status: 'completed' }) })).toBe('completed');
    expect(deriveExportUiState({ job: job({ status: 'retryable' }) })).toBe('failed');
    expect(deriveExportUiState({ job: job({ status: 'cancelled' }) })).toBe('cancelled');
  });

  it('surfaces concrete render and upload progress', () => {
    expect(formatExportProgress({
      progress: { message: 'Rendering slide 4 of 8: slide-04.png' },
    }, 'rendering')).toBe('Rendering slide 4 of 8');
    expect(formatExportProgress({
      progress: { message: '4 PNGs uploaded: slide-04.png' },
    }, 'uploading')).toBe('4 PNGs uploaded');
  });

  it('names whether rendering, uploading, or finalization failed', () => {
    expect(exportFailureLabel({
      progress: { phase: 'rendering' },
      failure: { message: 'Playwright timed out' },
    })).toBe('Rendering failed');
    expect(exportFailureLabel({
      progress: { phase: 'uploading' },
      failure: { message: 'upload was reset' },
    })).toBe('Uploading failed');
    expect(exportFailureLabel({
      failure: { code: 'ARTIFACT_MANIFEST_MISMATCH', message: 'checksum' },
    })).toBe('Finalization failed');
    expect(exportFailureLabel({
      status: 'expired',
      failure: { message: 'Lease expired before a worker claimed the job' },
    })).toBe('Queue failed');
  });

  it('keeps tenant context on editor and compute-job links', () => {
    expect(carouselEditorHref(job({ tenantKey: 'iowacity' }))).toBe(
      `/platform-admin/pivot/iowacity?page=8&deckId=${DECK}`,
    );
    expect(carouselComputeJobsHref(job({ tenantKey: 'iowacity' }))).toBe(
      '/platform-admin/pivot/iowacity?page=10&computeJobId=job%3Acarousel-iowacity-001',
    );
    expect(ARTIFACTS_EXPIRED_COPY).toMatch(/Export record available/);
  });

  it('restores the latest job for a deck and warns on a newer revision', () => {
    const older = job({
      externalJobId: 'job:old',
      options: { deckId: DECK, deckRevision: '2026-09-11T19:00:00.000Z' },
    });
    const current = job({ externalJobId: 'job:new' });
    expect(pickDeckExportJob([current, older], DECK)).toEqual(current);
    expect(pickDeckExportJob([current, older], DECK, 'job:old')).toEqual(older);
    expect(isRevisionStale(current, '2026-09-11T20:10:00.000Z')).toBe(true);
    expect(isRevisionStale(current, current.options.deckRevision)).toBe(false);
  });

  it('gates the one-click export UI by flag and tenant allowlist', () => {
    expect(isCarouselExportUiEnabled('iowacity', {})).toBe(true);
    expect(isCarouselExportUiEnabled('iowacity', { REACT_APP_ENABLE_CAROUSEL_EXPORT: 'false' })).toBe(false);
    expect(isCarouselExportUiEnabled('iowacity', {
      REACT_APP_ENABLE_CAROUSEL_EXPORT: 'true',
      REACT_APP_CAROUSEL_EXPORT_TENANTS: 'oakland',
    })).toBe(false);
    expect(isCarouselExportUiEnabled('oakland', {
      REACT_APP_CAROUSEL_EXPORT_TENANTS: 'oakland, iowacity',
    })).toBe(true);
  });

  it('persists the active export across a refresh', () => {
    writeExportSession('iowacity', DECK, {
      jobId: 'job:carousel-iowacity-001',
      panelOpen: true,
      createKey: 'idem:carousel-iowacity-001',
    });
    expect(readExportSession('iowacity', DECK)).toEqual({
      jobId: 'job:carousel-iowacity-001',
      panelOpen: true,
      createKey: 'idem:carousel-iowacity-001',
    });
  });
});
