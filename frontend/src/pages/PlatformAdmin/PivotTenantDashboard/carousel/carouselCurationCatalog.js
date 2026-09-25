import { eventMatchesCatalogSearch } from '../curationCatalogFilters';

const PIN_RANK = {
  featured: 4,
  must_show: 3,
  strong_promote: 2,
  promote: 1,
};

const TIER_LABELS = {
  promote: 'Promote',
  strong_promote: 'Strong Promote',
  must_show: 'Must Show',
  demote: 'Demote',
  hidden: 'Hidden',
};

export function candidateToCatalogEvent(candidate) {
  const snapshot = candidate?.snapshot || {};
  return {
    _id: candidate?.ref?.eventId,
    name: snapshot.name,
    organizerName: snapshot.host,
    location: snapshot.location,
    image: snapshot.image,
    start_time: snapshot.startTime,
    tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
    featured: snapshot.featured === true,
    rankingOverride: snapshot.rankingOverride || null,
    ingestStatus: snapshot.publication,
    source: candidate?.provenance?.source || null,
  };
}

export function editorialPin(candidate) {
  if (candidate?.snapshot?.featured) return PIN_RANK.featured;
  const tier = candidate?.snapshot?.rankingOverride?.tier;
  return PIN_RANK[tier] || 0;
}

export function editorialTierLabel(event) {
  const tier = event?.rankingOverride?.tier;
  return TIER_LABELS[tier] || null;
}

export function filterCurationCandidates(candidates, keyword) {
  const needle = String(keyword || '').trim();
  if (!needle) return candidates || [];
  return (candidates || []).filter((candidate) => (
    eventMatchesCatalogSearch(candidateToCatalogEvent(candidate), needle)
  ));
}
