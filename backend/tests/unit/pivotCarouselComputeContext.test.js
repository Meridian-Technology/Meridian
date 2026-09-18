const deckId = '507f1f77bcf86cd799439011';
const attemptId = '507f1f77bcf86cd799439012';
const revision = '2026-09-11T19:58:00.000Z';

const mockLean = jest.fn();
jest.mock('../../services/getGlobalModelService', () => jest.fn(() => ({
  PivotCarouselDeck: {
    findOne: jest.fn(() => ({
      select: jest.fn(() => ({ lean: mockLean })),
    })),
  },
})));
jest.mock('../../services/pivotCarouselExportService', () => ({
  ...jest.requireActual('../../services/pivotCarouselExportService'),
  deckRevision: jest.fn((deck) => new Date(deck.updatedAt).toISOString()),
  mintExportToken: jest.fn(async () => ({
    data: {
      token: 'render-token-value-that-is-long-enough-for-contract-validation',
      expiresAt: '2026-09-11T20:15:00.000Z',
    },
  })),
}));

const {
  buildCarouselExportContextSnapshot,
} = require('../../services/pivotCarouselComputeContextService');
const { validateContextSnapshot } = require('../../utilities/pivotAdminComputeJobContract');
const { mintExportToken } = require('../../services/pivotCarouselExportService');

describe('pivotCarouselComputeContextService', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'carousel-compute-context-test-secret';
    mockLean.mockReset();
    mockLean.mockResolvedValue({
      _id: deckId,
      updatedAt: new Date(revision),
      slides: [{ type: 'cover' }, { type: 'back' }],
    });
    mintExportToken.mockClear();
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it('builds bounded attempt-scoped grants only for the requested immutable revision', async () => {
    const job = {
      externalJobId: 'job:carousel-iowacity-001',
      tenantKey: 'iowacity',
      cityKey: 'iowacity',
      implementationRevision: 'relay-worker@test',
      options: { deckId, deckRevision: revision },
      lease: { attemptId },
    };
    const result = await buildCarouselExportContextSnapshot({}, {
      job,
      now: new Date('2026-09-11T20:05:00.000Z'),
    });

    expect(validateContextSnapshot(result.data.snapshot)).toEqual({ valid: true });
    expect(result.data.snapshot).toMatchObject({
      tenantKey: 'iowacity',
      deckId,
      deckRevision: revision,
      attemptId,
      slideCount: 2,
      slideNumbers: [1, 2],
      renderDimensions: { width: 1080, height: 1350 },
      artifactUploadGrant: {
        attemptId,
        allowedMimeTypes: ['image/png', 'application/zip'],
      },
    });
    expect(mintExportToken).toHaveBeenCalledWith({}, 'iowacity', deckId, {
      jobId: job.externalJobId,
      attemptId,
    });
  });

  it('treats equivalent ISO revision strings as the same deck', async () => {
    const result = await buildCarouselExportContextSnapshot({}, {
      job: {
        externalJobId: 'job:carousel-iowacity-001',
        tenantKey: 'iowacity',
        cityKey: 'iowacity',
        implementationRevision: 'relay-worker@test',
        options: { deckId, deckRevision: '2026-09-11T19:58:00Z' },
        lease: { attemptId },
      },
      now: new Date('2026-09-11T20:05:00.000Z'),
    });
    expect(result.data.snapshot.deckRevision).toBe(revision);
    expect(mintExportToken).toHaveBeenCalled();
  });

  it('rejects a deck changed after job creation before minting grants', async () => {
    mockLean.mockResolvedValue({
      _id: deckId,
      updatedAt: new Date('2026-09-11T20:00:00.000Z'),
      slides: [{ type: 'cover' }],
    });
    await expect(buildCarouselExportContextSnapshot({}, {
      job: {
        externalJobId: 'job:carousel-iowacity-001',
        tenantKey: 'iowacity',
        cityKey: 'iowacity',
        implementationRevision: 'relay-worker@test',
        options: { deckId, deckRevision: revision },
        lease: { attemptId },
      },
    })).rejects.toMatchObject({ code: 'DECK_REVISION_MISMATCH', status: 409 });
    expect(mintExportToken).not.toHaveBeenCalled();
  });

  it('narrows the snapshot to the requested slides', async () => {
    const result = await buildCarouselExportContextSnapshot({}, {
      job: {
        externalJobId: 'job:carousel-iowacity-001',
        tenantKey: 'iowacity',
        cityKey: 'iowacity',
        implementationRevision: 'relay-worker@test',
        options: { deckId, deckRevision: revision, slideNumbers: [2] },
        lease: { attemptId },
      },
      now: new Date('2026-09-11T20:05:00.000Z'),
    });

    expect(result.data.snapshot).toMatchObject({
      slideCount: 1,
      slideNumbers: [2],
    });
  });

  it('rejects a slide that is not on the deck', async () => {
    await expect(buildCarouselExportContextSnapshot({}, {
      job: {
        externalJobId: 'job:carousel-iowacity-001',
        tenantKey: 'iowacity',
        cityKey: 'iowacity',
        implementationRevision: 'relay-worker@test',
        options: { deckId, deckRevision: revision, slideNumbers: [3] },
        lease: { attemptId },
      },
    })).rejects.toMatchObject({ code: 'CAROUSEL_SLIDE_SELECTION_INVALID', status: 422 });
  });
});
