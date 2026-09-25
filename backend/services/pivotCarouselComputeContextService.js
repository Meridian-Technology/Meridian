const { createHash, randomUUID } = require('crypto');
const jwt = require('jsonwebtoken');
const getGlobalModels = require('./getGlobalModelService');
const { mintExportToken, deckRevision, sameDeckRevision } = require('./pivotCarouselExportService');
const {
  CONTRACT_VERSION,
  CAROUSEL_EXPORT_LIMITS,
  resolveCarouselExportSlideNumbers,
  validateContextSnapshot,
} = require('../utilities/pivotAdminComputeJobContract');

const UPLOAD_PURPOSE = 'pivot-carousel-artifact-upload';
const GRANT_TTL_SECONDS = 10 * 60;
const RENDER_WIDTH = 1080;
const RENDER_HEIGHT = 1350;

function serviceError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function renderUrlBase(req) {
  const configured = String(process.env.PIVOT_CAROUSEL_RENDER_URL_BASE || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  const frontendUrl = String(process.env.FRONTEND_URL || '').trim();
  if (frontendUrl) return `${frontendUrl.replace(/\/$/, '')}/carousel-export`;
  const host = typeof req.get === 'function' ? req.get('host') : null;
  if (host) return `${req.protocol || 'https'}://${host}/carousel-export`;
  return 'http://localhost:3000/carousel-export';
}

function contextVersionFor(job, revision, attemptId, slideNumbers) {
  const digest = createHash('sha256')
    .update([job.tenantKey, job.externalJobId, attemptId, revision, slideNumbers.join(',')].join(':'))
    .digest('hex')
    .slice(0, 32);
  return `ctx:carousel.${digest}`;
}

async function buildCarouselExportContextSnapshot(req, { job, now = new Date() }) {
  const deckId = String(job.options?.deckId || '').trim().toLowerCase();
  const expectedRevision = String(job.options?.deckRevision || '').trim();
  const attemptId = String(job.lease?.attemptId || '').trim().toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(deckId) || !expectedRevision || !/^[0-9a-f]{24}$/.test(attemptId)) {
    throw serviceError('Carousel export claim is missing its deck revision or attempt binding', 'INVALID_CAROUSEL_EXPORT_CLAIM');
  }

  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const deck = await PivotCarouselDeck.findOne({ _id: deckId, tenantKey: job.tenantKey })
    .select('slides updatedAt schemaVersion accountId')
    .lean();
  if (!deck) throw serviceError('Carousel deck not found', 'DECK_NOT_FOUND', 404);

  let pin = null;
  if ((deck.schemaVersion || 1) === 2) {
    pin = await require('./pivotCarouselRevisionService').findExportPin(req, deck._id, expectedRevision);
    if (!pin) throw serviceError('Carousel export pin was not found for this revision', 'DECK_REVISION_MISMATCH', 409);
  } else {
    const revision = deckRevision(deck);
    if (!sameDeckRevision(revision, expectedRevision)) {
      throw serviceError('Carousel deck changed after the export was requested', 'DECK_REVISION_MISMATCH', 409);
    }
  }
  const revision = pin ? expectedRevision : deckRevision(deck);
  const deckSlideCount = pin ? (pin.document?.slides || []).length : (deck.slides || []).length;
  if (deckSlideCount < 1 || deckSlideCount > CAROUSEL_EXPORT_LIMITS.maxSlideCount) {
    throw serviceError('Carousel slide count is outside the export limits', 'CAROUSEL_SLIDE_COUNT_INVALID', 422);
  }
  const slideNumbers = resolveCarouselExportSlideNumbers(job.options, deckSlideCount);
  if (!slideNumbers.length) {
    throw serviceError('Carousel slide selection is outside the export limits', 'CAROUSEL_SLIDE_SELECTION_INVALID', 422);
  }
  const slideCount = slideNumbers.length;

  const renderGrant = await mintExportToken(req, job.tenantKey, deckId, {
    jobId: job.externalJobId,
    attemptId,
    ...(pin ? { revisionId: String(pin._id), sourceRevision: expectedRevision } : {}),
  });
  if (renderGrant.error) {
    throw serviceError(renderGrant.error, renderGrant.code || 'CAROUSEL_RENDER_TOKEN_FAILED', renderGrant.status || 500);
  }

  const grantId = `grant:${randomUUID()}`;
  const expiresAt = new Date(now.getTime() + GRANT_TTL_SECONDS * 1000).toISOString();
  const uploadToken = jwt.sign({
    purpose: UPLOAD_PURPOSE,
    grantId,
    tenantKey: job.tenantKey,
    cityKey: job.cityKey,
    jobId: job.externalJobId,
    attemptId,
    deckId,
    deckRevision: revision,
  }, process.env.JWT_SECRET, { expiresIn: GRANT_TTL_SECONDS });

  const snapshot = {
    contractVersion: CONTRACT_VERSION,
    jobId: job.externalJobId,
    scheduleOccurrenceId: null,
    kind: 'carousel-export',
    tenantKey: job.tenantKey,
    cityKey: job.cityKey,
    implementationRevision: job.implementationRevision,
    contextVersion: contextVersionFor(job, revision, attemptId, slideNumbers),
    snapshotAt: now.toISOString(),
    attemptId,
    deckId,
    deckRevision: revision,
    slideCount,
    slideNumbers,
    renderDimensions: { width: RENDER_WIDTH, height: RENDER_HEIGHT },
    renderUrlBase: renderUrlBase(req),
    renderToken: renderGrant.data.token,
    renderTokenExpiresAt: renderGrant.data.expiresAt,
    artifactUploadGrant: {
      grantId,
      token: uploadToken,
      attemptId,
      expiresAt,
      allowedMimeTypes: [...CAROUSEL_EXPORT_LIMITS.allowedMimeTypes],
      limits: {
        maxArtifactCount: CAROUSEL_EXPORT_LIMITS.maxArtifactCount,
        maxBytesPerArtifact: CAROUSEL_EXPORT_LIMITS.maxBytesPerArtifact,
        maxTotalBytes: CAROUSEL_EXPORT_LIMITS.maxTotalBytes,
      },
    },
  };
  const validation = validateContextSnapshot(snapshot);
  if (!validation.valid) {
    throw serviceError(`Invalid carousel context: ${validation.errors.join(', ')}`, 'INVALID_CAROUSEL_EXPORT_CONTEXT', 500);
  }
  return { data: { snapshot } };
}

module.exports = {
  buildCarouselExportContextSnapshot,
  contextVersionFor,
  renderUrlBase,
  UPLOAD_PURPOSE,
  GRANT_TTL_SECONDS,
  RENDER_WIDTH,
  RENDER_HEIGHT,
};
