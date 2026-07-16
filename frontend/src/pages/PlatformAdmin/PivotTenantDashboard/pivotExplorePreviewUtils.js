export const EXPLORE_RAIL_MAX_ITEMS = 8;

const NIGHT_SHORTCUTS = ['thu', 'fri', 'sat', 'sun'];

export function eventHasFriendActivity(event) {
  return (event.friendsInterestedCount ?? 0) > 0 || (event.friendsGoingCount ?? 0) > 0;
}

export function eventHasTag(event, tagSlug) {
  const tags = event.tags;
  if (!Array.isArray(tags) || !tags.length) return false;
  const normalized = String(tagSlug || '').trim().toLowerCase();
  return tags.some((tag) => String(tag).trim().toLowerCase() === normalized);
}

export function buildExploreFilterChips(rails = []) {
  const chips = [
    { id: 'all', label: 'all' },
    { id: 'friends', label: 'friends' },
  ];
  if (rails.some((rail) => rail.id === 'tonight')) {
    chips.push({ id: 'tonight', label: 'tonight' });
  }
  for (const night of NIGHT_SHORTCUTS) {
    chips.push({ id: night, label: night });
  }
  for (const rail of rails) {
    if (rail.id?.startsWith('tag:')) {
      chips.push({ id: rail.id, label: rail.title || rail.id.slice(4) });
    }
  }
  return chips;
}

export function exploreChipToFetchParams(chipId, q = '', excludePassed = true) {
  const params = { excludePassed: excludePassed ? 'true' : 'false' };
  const trimmed = String(q || '').trim();
  if (trimmed) params.q = trimmed;

  if (chipId === 'friends') {
    params.friendsOnly = 'true';
  } else if (chipId === 'tonight') {
    params.night = new Date().toISOString().slice(0, 10);
  } else if (NIGHT_SHORTCUTS.includes(chipId)) {
    params.night = chipId;
  } else if (typeof chipId === 'string' && chipId.startsWith('tag:')) {
    params.tags = chipId.slice(4);
  }

  return params;
}

export function shouldShowExploreRails(chipId, q) {
  return chipId === 'all' && !String(q || '').trim();
}

export function buildExploreRailSections(events = [], rails = [], maxPerRail = EXPLORE_RAIL_MAX_ITEMS) {
  const sections = [];
  const friendsRail = rails.find((rail) => rail.id === 'friends');
  if (friendsRail) {
    const friendsEvents = events.filter(eventHasFriendActivity).slice(0, maxPerRail);
    if (friendsEvents.length) {
      sections.push({
        id: friendsRail.id,
        title: friendsRail.title || 'friends going',
        events: friendsEvents,
      });
    }
  }

  for (const rail of rails) {
    if (!rail.id?.startsWith('tag:')) continue;
    const tagSlug = rail.id.slice(4);
    const tagEvents = events.filter((event) => eventHasTag(event, tagSlug)).slice(0, maxPerRail);
    if (!tagEvents.length) continue;
    sections.push({
      id: rail.id,
      title: rail.title || tagSlug,
      events: tagEvents,
    });
  }

  return sections;
}
