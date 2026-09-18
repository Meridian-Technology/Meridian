/**
 * Export tokens for the carousel.
 *
 * Rendering runs in a headless Chrome started fresh from a terminal, which has
 * no session cookie and cannot be given request headers by a navigation. So the
 * frame view is reached with a signed token in the URL instead.
 *
 * The token is deliberately small: one deck, read-only, minutes long. It ends up
 * in shell history, so it must be worth nothing by the time anyone reads it back
 * — it grants sight of frames whose contents are about to be posted publicly
 * anyway, and nothing else.
 */

const jwt = require('jsonwebtoken');
const getGlobalModels = require('./getGlobalModelService');
const { getTenantByKey } = require('./tenantConfigService');
const { isPivotTenant } = require('../utilities/pivotDropSchedule');
const { ZINE_SLIDE_TYPES, ZINE_ADDABLE_TYPES } = require('../constants/zineSlideTypes');
const { serializeDeck } = require('./pivotCarouselDeckService');

const PURPOSE = 'pivot-carousel-export';
const TOKEN_TTL = '10m';

function deckRevision(deck) {
  const value = deck?.updatedAt instanceof Date ? deck.updatedAt : new Date(deck?.updatedAt);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function sameDeckRevision(left, right) {
  const leftMs = Date.parse(String(left || '').trim());
  const rightMs = Date.parse(String(right || '').trim());
  return Number.isFinite(leftMs) && leftMs === rightMs;
}

async function mintExportToken(req, tenantKey, deckId, scope = {}) {
  const key = String(tenantKey || '').trim().toLowerCase();
  const tenant = await getTenantByKey(req, key);
  if (!tenant) return { error: 'Tenant not found.', status: 404 };
  if (!isPivotTenant(tenant)) {
    return { error: 'Carousels are only available for Pivot city tenants.', status: 403 };
  }

  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const deck = await PivotCarouselDeck.findOne({ _id: deckId, tenantKey: key })
    .select('slides title updatedAt')
    .lean();
  if (!deck) return { error: 'Deck not found.', status: 404, code: 'DECK_NOT_FOUND' };

  const revision = deckRevision(deck);
  const token = jwt.sign(
    {
      purpose: PURPOSE,
      tenantKey: key,
      deckId: String(deck._id),
      ...(revision ? { deckRevision: revision } : {}),
      ...(scope.jobId ? { jobId: String(scope.jobId) } : {}),
      ...(scope.attemptId ? { attemptId: String(scope.attemptId) } : {}),
    },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL },
  );

  return {
    data: {
      token,
      tenantKey: key,
      deckId: String(deck._id),
      deckRevision: revision,
      slideCount: (deck.slides || []).length,
      expiresInSeconds: 600,
      expiresAt: new Date(Date.now() + 600 * 1000).toISOString(),
    },
  };
}

/**
 * Read a deck for rendering. Verifies the token rather than the session, and
 * refuses one minted for a different deck — a token is not a general key.
 */
async function readDeckForExport(req, token, deckId) {
  if (!token) return { error: 'An export token is required.', status: 401, code: 'TOKEN_REQUIRED' };

  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return { error: 'That export token is expired or invalid.', status: 401, code: 'TOKEN_INVALID' };
  }

  if (claims.purpose !== PURPOSE) {
    return { error: 'That token is not an export token.', status: 403, code: 'TOKEN_WRONG_PURPOSE' };
  }
  if (deckId && String(deckId) !== claims.deckId) {
    return { error: 'That token is for a different deck.', status: 403, code: 'TOKEN_WRONG_DECK' };
  }

  const { PivotCarouselDeck, PivotCarouselVoice } = getGlobalModels(
    req,
    'PivotCarouselDeck',
    'PivotCarouselVoice',
  );

  const [deck, voice] = await Promise.all([
    PivotCarouselDeck.findOne({ _id: claims.deckId, tenantKey: claims.tenantKey }).lean(),
    PivotCarouselVoice.findOne({ tenantKey: claims.tenantKey }).lean(),
  ]);
  if (!deck) return { error: 'Deck not found.', status: 404, code: 'DECK_NOT_FOUND' };
  if (claims.deckRevision && !sameDeckRevision(deckRevision(deck), claims.deckRevision)) {
    return {
      error: 'That deck changed after this export was claimed.',
      status: 409,
      code: 'DECK_REVISION_MISMATCH',
    };
  }

  return {
    data: {
      deck: serializeDeck(deck),
      cityVoice: voice?.entries || {},
      manifest: { types: ZINE_SLIDE_TYPES, addable: ZINE_ADDABLE_TYPES },
    },
  };
}

module.exports = { mintExportToken, readDeckForExport, deckRevision, sameDeckRevision, PURPOSE, TOKEN_TTL };
