/**
 * Replay phone + card geometry. Keep in lockstep with
 * Meridian-Mobile `PivotCardStack` + `PivotDeckFocusOverlay` chrome.
 *
 * iPhone 17 logical points (6.3" Super Retina, 1206×2622 @3x).
 */
export const IPHONE_17_LOGICAL = {
  width: 402,
  height: 874,
};

export const PIVOT_DECK_LAYOUT = {
  cardWidthFraction: 0.9,
  stageInsetV: 16,
  heroFraction: 0.6,
  actionBarHeight: 52,
  actionBarGap: 12,
  progressHeight: 3,
  safeTop: 59,
  safeBottom: 34,
  chromePadTop: 10,
  chromePadBottom: 10,
  chromeRow: 48,
};

export function resolvePivotDeckReplayLayout(
  windowSize = IPHONE_17_LOGICAL,
) {
  const width = windowSize.width;
  const height = windowSize.height;
  const actionBarTotal =
    PIVOT_DECK_LAYOUT.actionBarHeight
    + PIVOT_DECK_LAYOUT.actionBarGap
    + PIVOT_DECK_LAYOUT.safeBottom;
  const chromeHeight =
    PIVOT_DECK_LAYOUT.safeTop
    + PIVOT_DECK_LAYOUT.chromePadTop
    + PIVOT_DECK_LAYOUT.chromeRow
    + PIVOT_DECK_LAYOUT.chromePadBottom;
  const stackHostHeight = height - PIVOT_DECK_LAYOUT.progressHeight - chromeHeight;
  const slotHeight = stackHostHeight - actionBarTotal;
  const cardWidth = Math.round(width * PIVOT_DECK_LAYOUT.cardWidthFraction);
  const cardHeight = Math.round(slotHeight - PIVOT_DECK_LAYOUT.stageInsetV * 2);
  const cardLeft = Math.max(0, Math.round((width - cardWidth) / 2));
  const heroHeight = Math.round(cardHeight * PIVOT_DECK_LAYOUT.heroFraction);

  const compactHeight =
    PIVOT_DECK_LAYOUT.progressHeight
    + PIVOT_DECK_LAYOUT.stageInsetV * 2
    + cardHeight;

  return {
    width,
    height: compactHeight,
    windowHeight: height,
    actionBarTotal,
    chromeHeight,
    stackHostHeight,
    slotHeight,
    cardWidth,
    cardHeight,
    cardLeft,
    heroHeight,
    bodyHeight: cardHeight - heroHeight,
    stageInsetV: PIVOT_DECK_LAYOUT.stageInsetV,
    progressHeight: PIVOT_DECK_LAYOUT.progressHeight,
    actionBarHeight: PIVOT_DECK_LAYOUT.actionBarHeight,
    actionBarGap: PIVOT_DECK_LAYOUT.actionBarGap,
    safeBottom: PIVOT_DECK_LAYOUT.safeBottom,
  };
}

export function pivotDeckReplayPhoneVars(layout = resolvePivotDeckReplayLayout()) {
  return {
    '--replay-screen-width': `${layout.width}px`,
    '--replay-screen-height': `${layout.height}px`,
    '--replay-card-width': `${layout.cardWidth}px`,
    '--replay-card-height': `${layout.cardHeight}px`,
    '--replay-card-left': `${layout.cardLeft}px`,
    '--replay-hero-height': `${layout.heroHeight}px`,
    '--replay-stage-inset': `${layout.stageInsetV}px`,
    '--replay-progress-height': `${layout.progressHeight}px`,
    '--replay-chrome-height': `${layout.chromeHeight}px`,
    '--replay-action-total': `${layout.actionBarTotal}px`,
    '--replay-action-height': `${layout.actionBarHeight}px`,
    '--replay-action-gap': `${layout.actionBarGap}px`,
    '--replay-safe-bottom': `${layout.safeBottom}px`,
  };
}
