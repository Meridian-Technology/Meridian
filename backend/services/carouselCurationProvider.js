/**
 * Versioned candidate-provider seam for carousel curation.
 *
 * Catalog search is implemented now. Vector group proposals are reserved for
 * Phase 7 and must fail closed so a missing embedding plane cannot change
 * Explore, Drop, or manual curation.
 */

const CATALOG_PROVIDER_ID = 'catalog';
const VECTOR_PROVIDER_ID = 'vector';
const PROVIDER_VERSION = 1;

const PROVIDER_IDS = Object.freeze([CATALOG_PROVIDER_ID, VECTOR_PROVIDER_ID]);

function fail(error, status, code, extra = {}) {
  return { error, status, code, ...extra };
}

function catalogProvider(search) {
  return Object.freeze({
    id: CATALOG_PROVIDER_ID,
    version: PROVIDER_VERSION,
    search,
  });
}

const VECTOR_PROVIDER = Object.freeze({
  id: VECTOR_PROVIDER_ID,
  version: PROVIDER_VERSION,
  async search() {
    return fail(
      'Vector group proposals are not available yet.',
      501,
      'PROVIDER_UNAVAILABLE',
    );
  },
});

function resolveCurationProvider(id, catalogSearch) {
  const key = String(id || CATALOG_PROVIDER_ID).trim();
  if (key === VECTOR_PROVIDER_ID) return VECTOR_PROVIDER;
  if (key === CATALOG_PROVIDER_ID) return catalogProvider(catalogSearch);
  return null;
}

module.exports = {
  CATALOG_PROVIDER_ID,
  VECTOR_PROVIDER_ID,
  PROVIDER_VERSION,
  PROVIDER_IDS,
  resolveCurationProvider,
};
