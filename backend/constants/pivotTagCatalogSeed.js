/**
 * Canonical Pivot tag catalog seed rows (Task 8.1).
 * Slugs are lowercase kebab-case; shared by Lab, mobile onboarding, and ranker.
 */
function getPivotTagCatalogSeedRows() {
  return [
    { slug: 'live-music', label: 'live music', sortOrder: 10, active: true },
    { slug: 'board-games', label: 'board games', sortOrder: 20, active: true },
    { slug: 'food-and-drink', label: 'food & drink', sortOrder: 30, active: true },
    { slug: 'outdoors', label: 'outdoors', sortOrder: 40, active: true },
    { slug: 'art-and-culture', label: 'art & culture', sortOrder: 50, active: true },
    { slug: 'nightlife', label: 'nightlife', sortOrder: 60, active: true },
    { slug: 'fitness', label: 'fitness', sortOrder: 70, active: true },
    { slug: 'tech', label: 'tech', sortOrder: 80, active: true },
    { slug: 'comedy', label: 'comedy', sortOrder: 90, active: true },
    { slug: 'film-and-tv', label: 'film & TV', sortOrder: 100, active: true },
    { slug: 'wellness', label: 'wellness', sortOrder: 110, active: true },
    { slug: 'gaming', label: 'gaming', sortOrder: 120, active: true },
    { slug: 'dance', label: 'dance', sortOrder: 130, active: true },
    { slug: 'volunteering', label: 'volunteering', sortOrder: 140, active: true },
    { slug: 'markets-and-fairs', label: 'markets & fairs', sortOrder: 150, active: true },
    { slug: 'workshops', label: 'workshops', sortOrder: 160, active: true },
    { slug: 'family-friendly', label: 'family friendly', sortOrder: 170, active: true },
    { slug: 'social', label: 'social', sortOrder: 180, active: true },
  ];
}

module.exports = {
  getPivotTagCatalogSeedRows,
};
