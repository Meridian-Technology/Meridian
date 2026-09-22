/**
 * Resolve Meridian notification title/body from a merged copy pack.
 *
 * Weekly drop precedence (highest wins):
 *   1. Send-time `pushTitle` / `pushBody` (admin POST)
 *   2. Per-week `TenantConfig.pivotDropOverrides` for the batch
 *   3. Tenant `pivotDropPushTitle` / `pivotDropPushBody`
 *   4. Voice overlay at `notifications.weeklyDrop.*` via getMergedCopyPackOrEmpty
 *   5. Bundled catalog shipped strings (same as PUSH_TITLE / PUSH_BODY)
 *
 * Ritual / definition jobs use steps 4–5 (plus definition fallbacks and
 * copyTitleKey / copyBodyKey). ICU breakage falls back like resolveOverlayPushBody.
 */

const { getShippedCopyEntry } = require('./pivotCopyCatalog');
const {
  mergePushTokenParams,
  resolveOverlayPushBody,
} = require('./pivotCopyPushResolve');
const { formatPivotCopyTemplate } = require('./pivotCopyFormat');

const NOTIFICATION_COPY_KEYS = Object.freeze({
  weeklyDrop: Object.freeze({
    title: 'notifications.weeklyDrop.title',
    body: 'notifications.weeklyDrop.body',
  }),
  ritual: Object.freeze({
    swipe: Object.freeze({
      title: 'notifications.ritual.swipe.title',
      body: 'notifications.ritual.swipe.body',
    }),
    quorum_waiting: Object.freeze({
      title: 'notifications.ritual.quorumWaiting.title',
      body: 'notifications.ritual.quorumWaiting.body',
    }),
    decide: Object.freeze({
      title: 'notifications.ritual.decide.title',
      body: 'notifications.ritual.decide.body',
    }),
    decide_started: Object.freeze({
      title: 'notifications.ritual.decideStarted.title',
      body: 'notifications.ritual.decideStarted.body',
    }),
    decide_swap: Object.freeze({
      title: 'notifications.ritual.decideSwap.title',
      body: 'notifications.ritual.decideSwap.body',
    }),
    decide_pending: Object.freeze({
      title: 'notifications.ritual.decidePending.title',
      body: 'notifications.ritual.decidePending.body',
    }),
    recap: Object.freeze({
      title: 'notifications.ritual.recap.title',
      body: 'notifications.ritual.recap.body',
    }),
  }),
  definition: Object.freeze({
    title: 'notifications.definition.title',
    body: 'notifications.definition.body',
  }),
});

const WEEKLY_DROP_COPY_FALLBACKS = Object.freeze({
  title: 'just go*',
  body: 'What are you doing this week? Just go.',
});

function shippedFallback(path, fallback) {
  const shipped = getShippedCopyEntry(path);
  if (typeof shipped === 'string' && shipped.trim()) return shipped;
  return fallback == null ? null : String(fallback);
}

function formatBundledCopy(text, pack) {
  if (text == null) return null;
  const raw = String(text);
  if (!raw.trim()) return raw;
  const formatted = formatPivotCopyTemplate(raw, mergePushTokenParams(pack?.tokens));
  if (formatted.ok && formatted.text.trim()) return formatted.text;
  return raw;
}

/**
 * Overlay at `path`, else shipped catalog, else `fallback`.
 * Broken / blank overlays do not throw.
 */
function resolveNotificationCopyLine(path, pack, fallback) {
  const bundled = formatBundledCopy(shippedFallback(path, fallback), pack);
  if (!path) return bundled;
  return resolveOverlayPushBody(path, pack, bundled);
}

function clipCopy(value, maxLength) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (!maxLength) return trimmed;
  return trimmed.slice(0, maxLength);
}

function resolveNotificationCopyPair({
  pack = null,
  titleKey = null,
  bodyKey = null,
  titleFallback = null,
  bodyFallback = null,
  titleMax = 100,
  bodyMax = 240,
} = {}) {
  const titleResolved = resolveNotificationCopyLine(titleKey, pack, titleFallback);
  const bodyResolved = resolveNotificationCopyLine(bodyKey, pack, bodyFallback);
  const title = clipCopy(titleResolved, titleMax);
  const body = clipCopy(bodyResolved, bodyMax);
  const titleBundled = clipCopy(
    formatBundledCopy(shippedFallback(titleKey, titleFallback), pack),
    titleMax,
  );
  const bodyBundled = clipCopy(
    formatBundledCopy(shippedFallback(bodyKey, bodyFallback), pack),
    bodyMax,
  );
  return {
    title,
    body,
    fromOverlay: title !== titleBundled || body !== bodyBundled,
  };
}

function resolveWeeklyDropNotificationCopy(pack) {
  return resolveNotificationCopyPair({
    pack,
    titleKey: NOTIFICATION_COPY_KEYS.weeklyDrop.title,
    bodyKey: NOTIFICATION_COPY_KEYS.weeklyDrop.body,
    titleFallback: WEEKLY_DROP_COPY_FALLBACKS.title,
    bodyFallback: WEEKLY_DROP_COPY_FALLBACKS.body,
  });
}

function resolveRitualNotificationCopy(nudgeType, pack) {
  const keys = NOTIFICATION_COPY_KEYS.ritual[nudgeType];
  if (!keys) return { title: null, body: null, fromOverlay: false };
  return resolveNotificationCopyPair({
    pack,
    titleKey: keys.title,
    bodyKey: keys.body,
    titleFallback: WEEKLY_DROP_COPY_FALLBACKS.title,
    bodyFallback: null,
  });
}

function resolveDefinitionNotificationCopy({
  pack = null,
  titleKey = NOTIFICATION_COPY_KEYS.definition.title,
  bodyKey = NOTIFICATION_COPY_KEYS.definition.body,
  titleFallback = null,
  bodyFallback = null,
} = {}) {
  return resolveNotificationCopyPair({
    pack,
    titleKey: titleKey || NOTIFICATION_COPY_KEYS.definition.title,
    bodyKey: bodyKey || NOTIFICATION_COPY_KEYS.definition.body,
    titleFallback: titleFallback || WEEKLY_DROP_COPY_FALLBACKS.title,
    bodyFallback: bodyFallback || shippedFallback(
      NOTIFICATION_COPY_KEYS.definition.body,
      'open just go',
    ),
  });
}

/**
 * Apply weekly-drop steps 1–3 over pack/catalog (steps 4–5).
 * `explicitTitle` / `explicitBody` are already-trimmed send or tenant/override values.
 */
function mergeWeeklyDropPushCopy({
  pack = null,
  sendTitle = null,
  sendBody = null,
  overrideTitle = null,
  overrideBody = null,
  tenantTitle = null,
  tenantBody = null,
} = {}) {
  const packCopy = resolveWeeklyDropNotificationCopy(pack);
  const sendT = clipCopy(sendTitle, 100);
  const sendB = clipCopy(sendBody, 240);
  const overrideT = clipCopy(overrideTitle, 100);
  const overrideB = clipCopy(overrideBody, 240);
  const tenantT = clipCopy(tenantTitle, 100);
  const tenantB = clipCopy(tenantBody, 240);

  const title = sendT || overrideT || tenantT || packCopy.title;
  const body = sendB || overrideB || tenantB || packCopy.body;

  let source = 'default';
  if (sendT || sendB) source = 'send';
  else if (overrideT || overrideB) source = 'override';
  else if (tenantT || tenantB) source = 'tenant';
  else if (packCopy.fromOverlay) source = 'copy_pack';

  return { title, body, source };
}

module.exports = {
  NOTIFICATION_COPY_KEYS,
  WEEKLY_DROP_COPY_FALLBACKS,
  resolveNotificationCopyLine,
  resolveNotificationCopyPair,
  resolveWeeklyDropNotificationCopy,
  resolveRitualNotificationCopy,
  resolveDefinitionNotificationCopy,
  mergeWeeklyDropPushCopy,
};
