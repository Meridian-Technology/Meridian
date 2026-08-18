/**
 * Shared organizer name normalizer (Task 3.1).
 *
 * Used by resolve, backfill, and the host-name cluster script.
 * Does **not** split co-hosts and does **not** strip city suffixes.
 */

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const LEGAL_SUFFIX_RE = /\s+(inc|llc|ltd)$/u;
const AMPERSAND_RE = /[\u0026\uFF06\uFE60]/g;

/**
 * Drop trailing Inc / LLC / Ltd after punctuation has already been folded.
 * Repeat a few times so "Foo Inc LLC" collapses; do not touch mid-name tokens.
 *
 * @param {string} value
 * @returns {string}
 */
function stripTrailingLegalSuffix(value) {
  let current = value;
  for (let i = 0; i < 3; i += 1) {
    const next = current.replace(LEGAL_SUFFIX_RE, '').trim();
    if (next === current) break;
    current = next;
  }
  return current;
}

/**
 * Lowercase, punctuation-fold, `&`/`and` equivalence, drop a leading "the",
 * strip trailing Inc/LLC/Ltd, collapse whitespace.
 * Does **not** split co-hosts and does **not** strip city names.
 *
 * @param {unknown} name
 * @returns {string}
 */
function normalizeOrganizerName(name) {
  const trimmed = trimString(name);
  if (!trimmed) return '';

  const folded = trimmed
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B']/g, '')
    .replace(/[\u201C\u201D\u201E\u201F"]/g, '')
    .replace(AMPERSAND_RE, ' and ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the\s+/, '');

  return stripTrailingLegalSuffix(folded);
}

function looksLikeJoinedMultiHost(name) {
  const trimmed = trimString(name);
  if (!trimmed) return false;
  return /\s+&\s+/.test(trimmed) || /\s+and\s+/i.test(trimmed);
}

/**
 * Append an observed raw host string to `aliases[]` when that exact raw
 * name is new. Same normalized form with a different raw string is kept
 * (e.g. "The Chapel" and "Chapel"). Mutates `aliases` when it is an array.
 *
 * @param {object[]|undefined} aliases
 * @param {unknown} rawName
 * @param {string} [source]
 * @returns {object[]}
 */
function upsertOrganizerAlias(aliases, rawName, source) {
  const name = trimString(rawName);
  const list = Array.isArray(aliases) ? aliases : [];
  if (!name) return list;
  if (list.some((row) => trimString(row?.name) === name)) return list;

  const normalized = normalizeOrganizerName(name);
  const row = {
    name,
    normalized: normalized || name.toLowerCase(),
  };
  if (source) row.source = source;

  if (Array.isArray(aliases)) {
    aliases.push(row);
    return aliases;
  }
  return [row];
}

module.exports = {
  normalizeOrganizerName,
  looksLikeJoinedMultiHost,
  upsertOrganizerAlias,
};
