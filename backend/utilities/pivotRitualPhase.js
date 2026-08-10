/**
 * Server-owned Week phase — shared by ritual API and push copy resolution.
 */

function computeRitualPhase({
  hasCrews,
  dropPending,
  deck,
  decideQueueOrder,
}) {
  if (dropPending) {
    return 'pre_drop';
  }

  if (decideQueueOrder.length > 0) {
    return 'decide';
  }

  if (deck.complete) {
    return 'recap';
  }

  if (!hasCrews) {
    return 'solo';
  }

  if (!deck.started) {
    return 'drop_live';
  }

  return 'swiping';
}

module.exports = {
  computeRitualPhase,
};
