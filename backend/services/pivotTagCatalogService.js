const getGlobalModels = require('./getGlobalModelService');
const { PIVOT_TAG_SLUG_PATTERN } = require('../schemas/pivotTagCatalog');
const { getPivotTagCatalogSeedRows } = require('../constants/pivotTagCatalogSeed');

const MAX_PIVOT_INTEREST_TAGS = 8;

function normalizePivotTagSlugs(rawTags) {
  if (!Array.isArray(rawTags)) return [];

  const seen = new Set();
  const normalized = [];

  for (const raw of rawTags) {
    const slug = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    normalized.push(slug);
  }

  return normalized;
}

async function loadCatalogSlugSet(req, options = {}) {
  const includeInactive = options.includeInactive !== false;
  const { PivotTagCatalog } = getGlobalModels(req, 'PivotTagCatalog');
  const query = includeInactive ? {} : { active: true };
  const rows = await PivotTagCatalog.find(query).select('slug').lean();
  return new Set(rows.map((row) => row.slug));
}

async function validatePivotEventTags(req, rawTags, options = {}) {
  const { required = true, activeOnly = true } = options;
  const tags = normalizePivotTagSlugs(rawTags);

  if (required && tags.length === 0) {
    return {
      error: 'At least one catalog tag is required.',
      status: 400,
      code: 'TAGS_REQUIRED',
    };
  }

  if (tags.length === 0) {
    return { tags: [] };
  }

  for (const slug of tags) {
    if (!PIVOT_TAG_SLUG_PATTERN.test(slug)) {
      return {
        error: `Invalid tag slug: ${slug}`,
        status: 400,
        code: 'INVALID_TAG',
      };
    }
  }

  const slugSet = await loadCatalogSlugSet(req, { includeInactive: !activeOnly });
  const unknown = tags.filter((slug) => !slugSet.has(slug));
  if (unknown.length) {
    return {
      error: `Unknown catalog tag(s): ${unknown.join(', ')}`,
      status: 400,
      code: 'INVALID_TAG',
    };
  }

  return { tags };
}

async function validatePivotInterestTags(req, rawTags) {
  if (!req.globalDb) {
    return { error: 'Global database context required.', status: 500 };
  }

  if (!Array.isArray(rawTags)) {
    return {
      error: 'interestTags must be an array.',
      status: 400,
      code: 'VALIDATION_ERROR',
    };
  }

  const tags = normalizePivotTagSlugs(rawTags);

  if (tags.length > MAX_PIVOT_INTEREST_TAGS) {
    return {
      error: `At most ${MAX_PIVOT_INTEREST_TAGS} interest tags allowed.`,
      status: 400,
      code: 'INTEREST_TAGS_LIMIT',
    };
  }

  if (tags.length === 0) {
    return { tags: [] };
  }

  for (const slug of tags) {
    if (!PIVOT_TAG_SLUG_PATTERN.test(slug)) {
      return {
        error: `Invalid tag slug: ${slug}`,
        status: 400,
        code: 'INVALID_TAG',
      };
    }
  }

  const slugSet = await loadCatalogSlugSet(req, { includeInactive: false });
  const unknown = tags.filter((slug) => !slugSet.has(slug));
  if (unknown.length) {
    return {
      error: `Unknown catalog tag(s): ${unknown.join(', ')}`,
      status: 400,
      code: 'INVALID_TAG',
    };
  }

  return { tags };
}

async function listPivotTags(req, options = {}) {
  if (!req.globalDb) {
    return { error: 'Global database context required.', status: 500 };
  }

  const { PivotTagCatalog } = getGlobalModels(req, 'PivotTagCatalog');
  const includeInactive = options.includeInactive === true;

  const query = includeInactive ? {} : { active: true };
  const rows = await PivotTagCatalog.find(query)
    .sort({ sortOrder: 1, slug: 1 })
    .select('slug label active sortOrder')
    .lean();

  return {
    data: {
      tags: rows.map((row) => ({
        slug: row.slug,
        label: row.label,
      })),
    },
  };
}

async function seedPivotTagCatalog(req) {
  if (!req.globalDb) {
    return { error: 'Global database context required.', status: 500 };
  }

  const rows = getPivotTagCatalogSeedRows();
  const seedSlugs = new Set(rows.map((row) => row.slug));
  const { PivotTagCatalog } = getGlobalModels(req, 'PivotTagCatalog');

  let upserted = 0;
  for (const row of rows) {
    await PivotTagCatalog.findOneAndUpdate(
      { slug: row.slug },
      { $set: row },
      { upsert: true, new: true, runValidators: true },
    );
    upserted += 1;
  }

  const [activeCount, totalCount, legacyNotInSeed] = await Promise.all([
    PivotTagCatalog.countDocuments({ active: true }),
    PivotTagCatalog.countDocuments({}),
    PivotTagCatalog.countDocuments({ slug: { $nin: [...seedSlugs] } }),
  ]);

  return {
    data: {
      upserted,
      activeCount,
      totalCount,
      legacyNotInSeed,
      tags: rows.map((row) => ({ slug: row.slug, label: row.label })),
    },
  };
}

module.exports = {
  listPivotTags,
  seedPivotTagCatalog,
  normalizePivotTagSlugs,
  validatePivotEventTags,
  validatePivotInterestTags,
  loadCatalogSlugSet,
  MAX_PIVOT_INTEREST_TAGS,
};
