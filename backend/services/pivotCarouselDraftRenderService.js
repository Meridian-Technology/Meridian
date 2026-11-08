/**
 * Draft renders for the compose agent's review pass. The worker sends one
 * composition from a running compose or revise job; Meridian builds it with the
 * same generators an applied composition uses, keeps it for half an hour, and
 * returns an export token for it. The worker renders the slides through the
 * export page and shows them to the agent. Nothing here creates an issue.
 */
const jwt = require('jsonwebtoken');
const getGlobalModels = require('./getGlobalModelService');
const { buildCompositionDocument } = require('./pivotCarouselCompositionService');
const { validateDocument } = require('./pivotCarouselIssueService');
const { PURPOSE } = require('./pivotCarouselExportService');
const { SCHEMAS, collectSchemaErrors } = require('../utilities/pivotAdminComputeJobContract');

const DRAFT_TTL_SECONDS = 30 * 60;
const DRAFT_DECK_PREFIX = 'draft-';

function draftError(message, code, status = 422) {
  const error = new Error(message); error.code = code; error.status = status; return error;
}

/** The composition shape this job returns: an option for compose, a bare composition for revise. */
function compositionErrors(kind, composition) {
  const root = SCHEMAS.executionResult;
  const definition = kind === 'carousel-revise' ? 'composeComposition' : 'composeOption';
  return collectSchemaErrors(composition, root.$defs[definition], root, '$.composition');
}

async function createDraftRender(req, { job, composition, renderUrlBase, now = new Date() }) {
  if (job.kind !== 'carousel-compose' && job.kind !== 'carousel-revise') {
    throw draftError('Draft renders are for compose and revise jobs.', 'DRAFT_RENDER_KIND', 409);
  }
  if (!composition || typeof composition !== 'object' || Array.isArray(composition)) {
    throw draftError('A composition is required.', 'DRAFT_RENDER_INVALID');
  }
  const errors = compositionErrors(job.kind, composition);
  if (errors.length) throw draftError(`The composition does not match the contract: ${errors.slice(0, 5).join('; ')}`, 'DRAFT_RENDER_INVALID');

  const { PivotComputeJob, PivotCarouselDraftRender } = getGlobalModels(req, 'PivotComputeJob', 'PivotCarouselDraftRender');
  const stored = await PivotComputeJob.findOne({ externalJobId: job.externalJobId }).select('composeContext reviseContext tenantKey').lean();
  const context = job.kind === 'carousel-revise' ? stored?.reviseContext : stored?.composeContext;
  if (!context?.candidates) throw draftError('This job has no stored context to build from.', 'DRAFT_RENDER_CONTEXT_MISSING', 409);

  let document;
  try {
    document = buildCompositionDocument(composition, { ...context, lastPostedIssues: context.lastPostedIssues || [] });
  } catch (error) {
    throw draftError(error.message, error.code || 'DRAFT_RENDER_INVALID');
  }
  const invalid = validateDocument(document);
  if (invalid) throw draftError(invalid.error, invalid.code || 'DRAFT_RENDER_INVALID');

  const tenantKey = String(stored.tenantKey || job.tenantKey || job.cityKey || '').toLowerCase();
  const expiresAt = new Date(now.getTime() + DRAFT_TTL_SECONDS * 1000);
  const draft = await PivotCarouselDraftRender.create({ externalJobId: job.externalJobId, tenantKey, document, expiresAt });
  const deckId = `${DRAFT_DECK_PREFIX}${draft._id}`;
  const renderToken = jwt.sign(
    { purpose: PURPOSE, tenantKey, deckId, draftRenderId: String(draft._id), schemaVersion: 2 },
    process.env.JWT_SECRET,
    { expiresIn: DRAFT_TTL_SECONDS },
  );
  return {
    deckId,
    renderToken,
    renderUrlBase,
    slideCount: document.slides.length,
    width: document.width,
    height: document.height,
    expiresAt: expiresAt.toISOString(),
  };
}

/** The export page's read of a draft, for a token minted above. */
async function readDraftForExport(req, claims) {
  const { PivotCarouselDraftRender } = getGlobalModels(req, 'PivotCarouselDraftRender');
  const draft = await PivotCarouselDraftRender.findOne({ _id: claims.draftRenderId, tenantKey: claims.tenantKey }).lean();
  if (!draft || new Date(draft.expiresAt).getTime() <= Date.now()) {
    return { error: 'That draft render has expired.', status: 404, code: 'DRAFT_RENDER_NOT_FOUND' };
  }
  return {
    data: {
      deck: { id: claims.deckId, tenantKey: draft.tenantKey, title: 'Draft', schemaVersion: 2, document: draft.document, slides: [] },
      cityVoice: {},
      manifest: { types: [], addable: [] },
    },
  };
}

module.exports = { createDraftRender, readDraftForExport, DRAFT_TTL_SECONDS, DRAFT_DECK_PREFIX };
