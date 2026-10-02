/**
 * Stable city-dashboard identities and legacy ?page= indexes.
 * Keep indexes reserved even when a feature is disabled: bookmarks, job links,
 * and the fleet/city switcher all use these numbers.
 */
export const PIVOT_TENANT_PAGES = Object.freeze({
  overview: 0,
  // Content absorbed Curation (1), Catalog (4) and Location migration (7);
  // 4 and 7 redirect into it.
  content: 1,
  // Audience absorbed User journeys (2) and Drop deck (3); 3 redirects into it.
  audience: 2,
  dropDeck: 3,
  catalog: 4,
  voice: 5,
  // Growth absorbed Launch (6) and Analytics (11); 11 redirects into it.
  growth: 6,
  locationMigration: 7,
  carousel: 8,
  notifications: 9,
  computeJobs: 10,
  analytics: 11,
  coverLab: 12,
});

export const PIVOT_TENANT_PAGE_IDS = Object.freeze(
  Object.keys(PIVOT_TENANT_PAGES).sort(
    (left, right) => PIVOT_TENANT_PAGES[left] - PIVOT_TENANT_PAGES[right],
  ),
);

export function pivotTenantPageId(index) {
  return PIVOT_TENANT_PAGE_IDS[index] || null;
}

export function pivotTenantPageIndex(id) {
  return PIVOT_TENANT_PAGES[id] ?? null;
}
