/**
 * File-explorer selection for the curation catalog.
 * Click replaces; meta/ctrl toggles; shift or click-drag extends a range.
 */
export function rangeIds(events, fromIndex, toIndex) {
  if (!Array.isArray(events) || !events.length) return [];
  const last = events.length - 1;
  const start = Math.max(0, Math.min(fromIndex, toIndex, last));
  const end = Math.max(0, Math.min(Math.max(fromIndex, toIndex), last));
  const ids = [];
  for (let i = start; i <= end; i += 1) {
    const id = events[i]?._id;
    if (id != null) ids.push(id);
  }
  return ids;
}

function idKey(value) {
  return value == null ? '' : String(value);
}

export function sameIdSet(left, right) {
  const a = left instanceof Set ? left : new Set(left || []);
  const b = right instanceof Set ? right : new Set(right || []);
  if (a.size !== b.size) return false;
  const bKeys = new Set([...b].map(idKey));
  for (const id of a) {
    if (!bKeys.has(idKey(id))) return false;
  }
  return true;
}

/** First remaining row after `lostId`, else the previous remaining row. */
export function nextVisibleIndex(prevEvents, nextEvents, lostId) {
  if (!Array.isArray(nextEvents) || !nextEvents.length) return 0;
  const lost = idKey(lostId);
  const prev = Array.isArray(prevEvents) ? prevEvents : [];
  const indexOf = (id) => nextEvents.findIndex((event) => idKey(event._id) === idKey(id));
  const prevIndex = prev.findIndex((event) => idKey(event._id) === lost);
  if (prevIndex >= 0) {
    for (let i = prevIndex + 1; i < prev.length; i += 1) {
      const idx = indexOf(prev[i]?._id);
      if (idx >= 0) return idx;
    }
    for (let i = prevIndex - 1; i >= 0; i -= 1) {
      const idx = indexOf(prev[i]?._id);
      if (idx >= 0) return idx;
    }
  }
  return 0;
}

/**
 * Keep the focused row through catalog refreshes. If it left the filtered list,
 * land on the next remaining neighbor and select it when the lost row was selected.
 */
export function reconcileCatalogAnchor({
  prevEvents = [],
  nextEvents = [],
  focusId,
  selectedIds,
  anchorActive = true,
} = {}) {
  if (!nextEvents.length) {
    return { focusIndex: 0, focusId: null, selectedIds: new Set() };
  }

  const visible = new Set(nextEvents.map((event) => idKey(event._id)));
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const surviving = new Set([...selected].filter((id) => visible.has(idKey(id))));
  const focusWasSelected = [...selected].some((id) => idKey(id) === idKey(focusId));
  const focusedIndex = nextEvents.findIndex((event) => idKey(event._id) === idKey(focusId));

  if (focusedIndex >= 0) {
    const event = nextEvents[focusedIndex];
    return {
      focusIndex: focusedIndex,
      focusId: event._id,
      selectedIds: surviving,
    };
  }

  if (!prevEvents.length) {
    return {
      focusIndex: 0,
      focusId: nextEvents[0]._id,
      selectedIds: surviving,
    };
  }

  const focusIndex = nextVisibleIndex(prevEvents, nextEvents, focusId);
  const event = nextEvents[focusIndex];
  let nextSelected = surviving;
  if (anchorActive && focusWasSelected && nextSelected.size === 0 && event) {
    nextSelected = new Set([event._id]);
  }
  return {
    focusIndex,
    focusId: event?._id ?? null,
    selectedIds: nextSelected,
  };
}

export function nextSelection(prev, { id, index, events, additive = false, rangeFrom = null } = {}) {
  const current = prev instanceof Set ? prev : new Set(prev || []);

  if (rangeFrom != null && Number.isInteger(index)) {
    const ids = rangeIds(events, rangeFrom, index);
    if (additive) {
      const next = new Set(current);
      ids.forEach((entry) => next.add(entry));
      return next;
    }
    return new Set(ids);
  }

  if (additive) {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  return new Set(id == null ? [] : [id]);
}

/** Contiguous range from a click-and-drag, optionally unioned with a snapshot. */
export function dragRangeSelection(events, fromIndex, toIndex, baseSelection = null) {
  const ids = rangeIds(events, fromIndex, toIndex);
  if (!baseSelection) return new Set(ids);
  const next = new Set(baseSelection);
  ids.forEach((id) => next.add(id));
  return next;
}
