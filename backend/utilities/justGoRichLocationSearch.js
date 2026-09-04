const {
  projectPublicRichLocation,
} = require('../events/services/richLocationProjectionService');

const MAX_PUBLIC_ALIAS_LENGTH = 500;
const MAX_PUBLIC_ALIASES = 100;

function normalizeSearchText(value, maxLength) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (!normalized || normalized.length > maxLength) return undefined;
  return normalized;
}

function searchTokens(value) {
  return value.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) || [];
}

/**
 * Build the rich-location portion of the Explore text index from public-safe data.
 *
 * The public projection is the authority for labels and geography. Aliases are
 * additionally searchable only for public physical locations and only when the
 * alias contains only words already present in approved public labels/addresses.
 * This permits harmless reordered and shortened names without treating the
 * restricted alias collection as an independent source of public data. Approximate
 * and registration-gated aliases may encode a hidden venue/address and therefore
 * never enter the index.
 */
function collectPublicRichLocationSearchTerms(source) {
  const location = projectPublicRichLocation(source);
  if (!location) return [];

  const terms = [
    location.publicDisplayLabel,
    location.venueName,
    location.formattedAddress,
    location.approximateLabel,
    location.neighborhood,
    location.city,
  ];

  if (location.mode === 'physical' && Array.isArray(source.aliases)) {
    const approvedTokens = new Set(searchTokens(terms.filter(Boolean).join(' ')));
    terms.push(...source.aliases
      .slice(0, MAX_PUBLIC_ALIASES)
      .map((alias) => normalizeSearchText(alias, MAX_PUBLIC_ALIAS_LENGTH))
      .filter((alias) => {
        if (!alias) return false;
        const aliasTokens = searchTokens(alias);
        return aliasTokens.length > 0
          && aliasTokens.every((token) => approvedTokens.has(token));
      }));
  }

  return [...new Set(terms.filter(Boolean))];
}

function collectPublicRichLocationSearchText(source) {
  return collectPublicRichLocationSearchTerms(source).join(' ');
}

module.exports = {
  collectPublicRichLocationSearchTerms,
  collectPublicRichLocationSearchText,
};
