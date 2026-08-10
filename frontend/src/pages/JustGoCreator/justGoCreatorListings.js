import justGoCreatorCopy from './justGoCreatorCopy';

/**
 * Filter buckets for the list, in display order. `null` = no filter.
 *
 * `draft` / `staged` / `published` are the only ingest values the creator write path produces
 * (see `pivotCreatorListingService`) — ops own every transition, so these are read-only labels.
 */
export const CREATOR_LIST_FILTERS = Object.freeze([
  Object.freeze({ id: 'all', ingestStatus: null, label: justGoCreatorCopy.filters.all }),
  Object.freeze({
    id: 'draft',
    ingestStatus: 'draft',
    label: justGoCreatorCopy.status.draft,
  }),
  Object.freeze({
    id: 'staged',
    ingestStatus: 'staged',
    label: justGoCreatorCopy.status.staged,
  }),
  Object.freeze({
    id: 'published',
    ingestStatus: 'published',
    label: justGoCreatorCopy.status.published,
  }),
]);

/**
 * Status pill for a listing. Tones stay inside the reskin register — ink and accent only,
 * no ticker / pop / burst in dense rows.
 *
 * @returns {{ label: string, tone: 'draft'|'staged'|'published'|'unknown', help: string|null }}
 */
export function describeIngestStatus(ingestStatus) {
  switch (ingestStatus) {
    case 'draft':
      return {
        label: justGoCreatorCopy.status.draft,
        tone: 'draft',
        help: justGoCreatorCopy.statusHelp.draft,
      };
    case 'staged':
      return {
        label: justGoCreatorCopy.status.staged,
        tone: 'staged',
        help: justGoCreatorCopy.statusHelp.staged,
      };
    case 'published':
      return {
        label: justGoCreatorCopy.status.published,
        tone: 'published',
        help: justGoCreatorCopy.statusHelp.published,
      };
    default:
      return { label: justGoCreatorCopy.status.unknown, tone: 'unknown', help: null };
  }
}

export function countListingsByStatus(events) {
  const counts = { all: 0, draft: 0, staged: 0, published: 0 };
  (events || []).forEach((event) => {
    counts.all += 1;
    if (Object.prototype.hasOwnProperty.call(counts, event?.ingestStatus)) {
      counts[event.ingestStatus] += 1;
    }
  });
  return counts;
}

const WHEN_FORMAT = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

/** Row date line, e.g. `Sat, Aug 15, 8:00 PM`. Falls back to empty string on bad input. */
export function formatListingWhen(startTime) {
  if (!startTime) return '';
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return '';
  const options = date.getFullYear() === new Date().getFullYear()
    ? WHEN_FORMAT
    : { ...WHEN_FORMAT, year: 'numeric' };
  return new Intl.DateTimeFormat(undefined, options).format(date);
}
