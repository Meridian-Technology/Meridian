/**
 * Decide what the carousel page shows. A missing deck id never falls through
 * to whichever issue was edited last.
 */
export function librarySelection(decks, requestedId) {
  if (!requestedId) return { mode: 'library' };
  const match = (decks || []).find((deck) => String(deck._id) === String(requestedId));
  if (!match) return { mode: 'missing', requestedId: String(requestedId) };
  return { mode: 'open', deckId: String(match._id) };
}

export function filterIssues(issues, { q = '', format = 'all', status = 'all' } = {}) {
  const needle = q.trim().toLowerCase();
  return (issues || []).filter((issue) => {
    if (status !== 'all' && issue.status !== status) return false;
    if (format !== 'all' && issue.format !== format) return false;
    if (!needle) return true;
    return `${issue.name || ''} ${issue.title || ''}`.toLowerCase().includes(needle);
  });
}
