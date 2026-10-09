/**
 * Development and test fixtures for the three pilot editorial accounts.
 *
 * These are *not* production records. The ids are synthetic, the tenant
 * mapping for the global retrospective account is a placeholder, and nothing
 * here creates or modifies a real carousel account. An authorized operator
 * confirms the real account and tenant ids during rollout (see the contract
 * doc's pilot section); guessing them here would be worse than leaving them
 * visibly unresolved.
 */

const SEED_SOURCE = 'fixture';

const PIVOT_CAROUSEL_EDITORIAL_SEEDS = Object.freeze([
  Object.freeze({
    seedKey: 'just-go-ic',
    accountId: '653000000000000000000101',
    displayName: 'Just Go Curation — Iowa City',
    handle: '@just.go.ic',
    format: 'city-picks',
    ownerTenantKey: 'iowacity',
    sourceTenantKeys: Object.freeze(['iowacity']),
    timezone: 'America/Chicago',
    settings: Object.freeze({}),
    tenantMappingConfirmed: false,
  }),
  Object.freeze({
    seedKey: 'just-go-sf',
    accountId: '653000000000000000000102',
    displayName: 'Just Go Curation — San Francisco',
    handle: '@just.go.sf',
    format: 'city-picks',
    ownerTenantKey: 'sf',
    sourceTenantKeys: Object.freeze(['sf']),
    timezone: 'America/Los_Angeles',
    settings: Object.freeze({}),
    tenantMappingConfirmed: false,
  }),
  Object.freeze({
    seedKey: 'sorry-u-missed-it',
    accountId: '653000000000000000000103',
    displayName: 'Sorry You Missed It',
    handle: '@sorry.u.missed.it',
    format: 'sorry-you-missed-it',
    // Placeholder owner and catalog breadth. The real global account's owner
    // tenant and permitted source tenants are an operator decision.
    ownerTenantKey: 'iowacity',
    sourceTenantKeys: Object.freeze(['iowacity', 'sf', 'chicago', 'nyc', 'oakland']),
    timezone: 'America/Chicago',
    settings: Object.freeze({}),
    tenantMappingConfirmed: false,
  }),
]);

function findEditorialSeed(seedKey) {
  return PIVOT_CAROUSEL_EDITORIAL_SEEDS.find((seed) => seed.seedKey === seedKey) || null;
}

module.exports = {
  SEED_SOURCE,
  PIVOT_CAROUSEL_EDITORIAL_SEEDS,
  findEditorialSeed,
};
