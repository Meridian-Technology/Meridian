/**
 * Resolve a push body from a merged copy pack. Empty / missing overlay
 * returns the bundled fallback so send paths never depend on the catalog.
 */

const {
  CATALOG_SHIPPED_TOKENS,
  PIVOT_COPY_TOKEN_NAMES,
} = require('./pivotCopyCatalog');
const { formatPivotCopyTemplate, nestedTokenParams } = require('./pivotCopyFormat');

const EMPTY_PUSH_COPY_PACK = Object.freeze({
  tokens: Object.freeze({}),
  entries: Object.freeze({}),
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergePushTokenParams(overlayTokens) {
  const tokens = { ...CATALOG_SHIPPED_TOKENS };
  if (isPlainObject(overlayTokens)) {
    for (const name of PIVOT_COPY_TOKEN_NAMES) {
      const value = overlayTokens[name];
      if (typeof value === 'string' && value.trim()) {
        tokens[name] = value;
      }
    }
  }
  return nestedTokenParams(tokens);
}

/**
 * Overlay template for `path`, formatted with shipped tokens ∪ pack tokens.
 * Missing / blank / broken templates return `fallback` unchanged.
 */
function resolveOverlayPushBody(path, pack, fallback) {
  const bundled = fallback == null ? null : String(fallback);
  if (!path || !isPlainObject(pack)) {
    return bundled;
  }
  const entries = pack.entries;
  if (!isPlainObject(entries)) {
    return bundled;
  }
  const overlay = entries[path];
  if (typeof overlay !== 'string' || !overlay.trim()) {
    return bundled;
  }
  const formatted = formatPivotCopyTemplate(
    overlay,
    mergePushTokenParams(pack.tokens),
  );
  if (!formatted.ok || !formatted.text.trim()) {
    return bundled;
  }
  return formatted.text;
}

module.exports = {
  EMPTY_PUSH_COPY_PACK,
  mergePushTokenParams,
  resolveOverlayPushBody,
};
