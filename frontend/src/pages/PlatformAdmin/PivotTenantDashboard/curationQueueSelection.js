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
