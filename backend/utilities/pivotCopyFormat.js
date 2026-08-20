/**
 * Server ICU subset for overlay templates (push / landing).
 * Matches the Voice editor + mobile resolver: `{name}` interpolation,
 * plural, select. Broken templates do not throw to callers that use
 * `formatPivotCopyTemplate`.
 */

function isWs(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function skipWs(input, i, end) {
  while (i < end && isWs(input[i])) i += 1;
  return i;
}

function isNameStart(ch) {
  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_';
}

function isNamePart(ch) {
  return isNameStart(ch) || (ch >= '0' && ch <= '9') || ch === '.';
}

function lookupParam(params, name) {
  if (Object.prototype.hasOwnProperty.call(params, name)) {
    const value = params[name];
    if (typeof value === 'string' || typeof value === 'number') {
      return value;
    }
  }
  if (!name.includes('.')) return undefined;
  let current = params;
  for (const part of name.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  if (typeof current === 'string' || typeof current === 'number') {
    return current;
  }
  return undefined;
}

function readBalanced(input, start, end) {
  if (input[start] !== '{') {
    throw new Error('expected {');
  }
  let depth = 0;
  for (let i = start; i < end; i += 1) {
    const ch = input[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return { content: input.slice(start + 1, i), next: i + 1 };
      }
    }
  }
  throw new Error('unclosed brace');
}

function englishPluralCategory(n) {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.PluralRules === 'function') {
      return new Intl.PluralRules('en').select(n) === 'one' ? 'one' : 'other';
    }
  } catch {
    // Hermes / incomplete Intl
  }
  return n === 1 ? 'one' : 'other';
}

function formatPlural(name, choices, params) {
  const raw = lookupParam(params, name);
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`plural ${name} is not a number`);
  }
  const exact = `=${n}`;
  const category = englishPluralCategory(n);
  const body = choices.get(exact) ?? choices.get(category) ?? choices.get('other');
  if (body === undefined) {
    throw new Error('plural missing other');
  }
  return formatRange(body, 0, body.length, params, n);
}

function formatSelect(name, choices, params) {
  const raw = lookupParam(params, name);
  if (raw === undefined) {
    throw new Error(`missing param ${name}`);
  }
  const body = choices.get(String(raw)) ?? choices.get('other');
  if (body === undefined) {
    throw new Error('select missing other');
  }
  return formatRange(body, 0, body.length, params);
}

function parsePlaceholder(input, start, end, params) {
  let i = skipWs(input, start + 1, end);
  if (i >= end || !isNameStart(input[i])) {
    throw new Error('empty placeholder');
  }
  const nameStart = i;
  i += 1;
  while (i < end && isNamePart(input[i])) i += 1;
  const name = input.slice(nameStart, i);
  i = skipWs(input, i, end);
  if (i >= end) throw new Error('unclosed placeholder');
  if (input[i] === '}') {
    const value = lookupParam(params, name);
    if (value === undefined) throw new Error(`missing param ${name}`);
    return { text: String(value), next: i + 1 };
  }
  if (input[i] !== ',') throw new Error('invalid placeholder');
  i = skipWs(input, i + 1, end);
  const typeStart = i;
  while (i < end && isNameStart(input[i])) i += 1;
  const type = input.slice(typeStart, i);
  if (type !== 'plural' && type !== 'select') {
    throw new Error(`unsupported type ${type}`);
  }
  i = skipWs(input, i, end);
  if (i < end && input[i] === ',') i = skipWs(input, i + 1, end);
  const choices = new Map();
  while (i < end && input[i] !== '}') {
    i = skipWs(input, i, end);
    if (i < end && input[i] === '}') break;
    const selStart = i;
    while (i < end && input[i] !== '{' && !isWs(input[i])) i += 1;
    const selector = input.slice(selStart, i);
    if (!selector) throw new Error('empty selector');
    i = skipWs(input, i, end);
    if (i >= end || input[i] !== '{') throw new Error('expected { after selector');
    const body = readBalanced(input, i, end);
    choices.set(selector, body.content);
    i = body.next;
  }
  if (i >= end || input[i] !== '}') throw new Error('unclosed icu');
  const text =
    type === 'plural'
      ? formatPlural(name, choices, params)
      : formatSelect(name, choices, params);
  return { text, next: i + 1 };
}

function formatRange(input, start, end, params, pound) {
  let i = start;
  let out = '';
  while (i < end) {
    const ch = input[i];
    if (ch === '{') {
      const parsed = parsePlaceholder(input, i, end, params);
      out += parsed.text;
      i = parsed.next;
      continue;
    }
    if (ch === '}') throw new Error('unmatched }');
    if (ch === '#' && pound !== undefined) {
      out += String(pound);
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * @returns {{ ok: true, text: string } | { ok: false, error: string, text: string }}
 */
function formatPivotCopyTemplate(template, params = {}) {
  const raw = template == null ? '' : String(template);
  try {
    return { ok: true, text: formatRange(raw, 0, raw.length, params) };
  } catch (err) {
    return { ok: false, error: err.message || 'invalid template', text: raw };
  }
}

function nestedTokenParams(tokens = {}) {
  const brandName = tokens['brand.name'];
  const brandCta = tokens['brand.cta'];
  const groupSingular = tokens['group.singular'];
  const groupPlural = tokens['group.plural'];
  return {
    ...tokens,
    ...(brandName != null || brandCta != null
      ? { brand: { name: brandName, cta: brandCta } }
      : {}),
    ...(groupSingular != null || groupPlural != null
      ? { group: { singular: groupSingular, plural: groupPlural } }
      : {}),
  };
}

module.exports = {
  formatPivotCopyTemplate,
  nestedTokenParams,
};
