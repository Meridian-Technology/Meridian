/** Fixed publishing identities. These keys are handles without the leading @. */
const EDITORIAL_ACCOUNTS = Object.freeze([
  Object.freeze({
    key: 'just.go.ic', displayName: 'Just Go Curation Iowa City', handle: '@just.go.ic',
    format: 'city-picks', ownerTenantKey: 'ic', sourceTenantKeys: Object.freeze(['ic']),
    timezone: 'America/Chicago', window: 'upcoming', days: 14,
  }),
  Object.freeze({
    key: 'just.go.sf', displayName: 'Just Go Curation San Francisco', handle: '@just.go.sf',
    format: 'city-picks', ownerTenantKey: 'sf', sourceTenantKeys: Object.freeze(['sf']),
    timezone: 'America/Los_Angeles', window: 'upcoming', days: 14,
  }),
  Object.freeze({
    key: 'sorry.u.missed.it', displayName: 'Sorry You Missed It', handle: '@sorry.u.missed.it',
    format: 'sorry-you-missed-it', ownerTenantKey: null, sourceTenantKeys: 'all',
    // A global account keeps its existing owner's local publication timezone.
    timezone: null, window: 'past', days: 7,
  }),
]);

const COMPOSE_POLICY = Object.freeze({
  minEvents: 3, maxEvents: 5, skipPostedOnSameAccount: true,
  crossAccountReuse: true, singleCityThemeAllowed: true,
  coverImageKinds: Object.freeze(['event-poster', 'unsplash']),
  eventImageKind: 'event-poster', preferDifferentCover: true,
  repeatedCoverNeedsReason: true, captionRequired: true, browsingAllowed: false,
  // Staged events are queued for the next batch release; drafts never qualify.
  catalogIngestStatuses: Object.freeze(['published', 'staged']),
});

function editorialAccountFor(key) {
  return EDITORIAL_ACCOUNTS.find(account => account.key === key) || null;
}

module.exports = { EDITORIAL_ACCOUNTS, COMPOSE_POLICY, editorialAccountFor };
