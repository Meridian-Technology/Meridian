export const JUSTGO_PUBLIC_EVENT_COPY = Object.freeze({
  loading: 'loading event',
  unavailableTitle: 'this event isn’t available',
  unavailableBody: 'it may have moved or is no longer public. find something else in just go.',
  retry: 'try again',
  ended: 'ended',
  ongoing: 'happening now',
  registerCta: 'get the app to register',
  openAppCta: 'open in just go',
  downloadPrompt: 'get just go to find more events in your city',
  appStore: 'app store',
  googlePlay: 'google play',
  storeChoicesLabel: 'download options',
  openAppA11y: 'open this event in just go',
  registerA11y: 'open just go to register for this event',
  share: 'share event',
  shareA11y: 'share this event',
  dateSeparator: 'to',
  timezoneLabel: 'times shown in',
  venueLabel: 'where',
  organizerLabel: 'hosted by',
  imageAlt: 'event image',
  missingImageAlt: 'event image unavailable',
  cityMismatch: 'this event isn’t available in your current city',
});

export const JUSTGO_PUBLIC_EVENT_COPY_KEYS = Object.freeze(
  Object.fromEntries(Object.keys(JUSTGO_PUBLIC_EVENT_COPY).map((field) => [
    field,
    `landing.web.event.${field}`,
  ])),
);

function applyTokens(value, tokens = {}) {
  let resolved = String(value);
  for (const [name, replacement] of Object.entries(tokens)) {
    if (typeof replacement === 'string' && replacement.trim()) {
      resolved = resolved.split(`{${name}}`).join(replacement);
    }
  }
  return /[{}]/.test(resolved) ? null : resolved.trim() || null;
}

export function resolvePublicEventCopy(language) {
  const entries = language?.entries || {};
  const tokens = {
    'brand.name': 'just go',
    'brand.cta': 'go',
    ...(language?.tokens || {}),
  };
  const resolvedEntries = Object.fromEntries(Object.entries(JUSTGO_PUBLIC_EVENT_COPY).map(([field, fallback]) => {
    const path = JUSTGO_PUBLIC_EVENT_COPY_KEYS[field];
    const resolved = applyTokens(entries[path] ?? fallback, tokens)
      || applyTokens(fallback, { 'brand.name': 'just go', 'brand.cta': 'go' })
      || fallback;
    return [field, resolved];
  }));
  return { ...resolvedEntries, productName: tokens['brand.name'] };
}
