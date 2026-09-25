/**
 * Decide what the carousel page shows. Opening the page stays on the issue
 * list. A missing deck id never falls through to the latest issue.
 */
export function librarySelection(decks, requestedId) {
  if (!requestedId) return { mode: 'list' };
  const match = (decks || []).find((deck) => String(deck._id) === String(requestedId));
  if (!match) return { mode: 'missing', requestedId: String(requestedId) };
  return { mode: 'open', deckId: String(match._id) };
}

export function issueName(issue) {
  return issue?.name || issue?.title || 'Untitled carousel';
}

export function issueId(issue) {
  return String(issue?._id || issue?.id || '');
}

function updatedAtMs(issue) {
  const time = new Date(issue?.updatedAt || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Active issues for this city, newest first. */
export function listPastIssues(issues) {
  return (issues || [])
    .filter((issue) => (issue.status || 'active') !== 'archived')
    .slice()
    .sort((a, b) => updatedAtMs(b) - updatedAtMs(a));
}

/** The issue Continue previous should open. Never chosen implicitly on load. */
export function latestIssue(issues) {
  return listPastIssues(issues)[0] || null;
}
