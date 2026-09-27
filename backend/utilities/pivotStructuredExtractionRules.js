const RULE_REASONS = Object.freeze({
  image: ['venue_logo', 'wrong_event', 'low_quality'],
  description: ['date_not_description', 'boilerplate', 'wrong_event'],
  start_time: ['wrong_date', 'section_heading', 'detail_page'],
});

function safeText(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function ruleFromCorrection({ field, reason, before, after, eventId, now = new Date() }) {
  if (!RULE_REASONS[field]?.includes(reason)) return null;
  const badValue = safeText(before, 1000);
  if (!badValue) return null;
  return {
    id: `${eventId}:${field}:${reason}`, field, reason, badValue,
    exampleId: String(eventId), before: badValue, after: safeText(after, 1000),
    status: 'proposed', createdAt: now, updatedAt: now,
  };
}

function ruleInstruction(rule) {
  if (rule.field === 'image') {
    if (rule.reason === 'venue_logo') return 'For each event, select its own banner or poster. Never reuse the venue or calendar logo as the event image.';
    return 'Select an image depicting this specific event from its card or detail page; omit an unrelated or low-quality image.';
  }
  if (rule.field === 'description') {
    if (rule.reason === 'date_not_description') return 'A date or time by itself is not an event description. Use event-specific prose, or leave description empty.';
    if (rule.reason === 'boilerplate') return 'Do not copy repeated venue or calendar boilerplate into each event description. Prefer event-specific prose.';
    return 'Use the description belonging to this event, not a neighboring event on the calendar.';
  }
  if (rule.reason === 'section_heading') return 'Apply each section date heading only to the event cards within that section.';
  if (rule.reason === 'detail_page') return 'When the listing date is ambiguous, use the event detail page date.';
  return 'Verify each event date against its own listing and detail page; do not use an unrelated date from nearby copy.';
}

function activeRuleHints(rules) {
  return (rules || []).filter((rule) => rule.status === 'active').map(ruleInstruction);
}

function isDateOnlyDescription(value) {
  const text = safeText(value, 200);
  if (!text || text.length > 90) return false;
  const hasDate = /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2})\b/i.test(text);
  if (!hasDate) return false;
  const leftover = text.replace(/\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|am|pm|at|from|to)\b/gi, '')
    .replace(/\d+/g, '').replace(/\b(?:am|pm)\b/g, '').replace(/[-/:.,·–—\s]/g, '');
  return leftover.length === 0;
}

function validImageUrl(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

function applyStructuredRules(row, rules) {
  const next = { ...row };
  const applied = [];
  for (const rule of rules || []) {
    if (rule.status !== 'active') continue;
    if (rule.field === 'image' && next.imageUrl === rule.badValue) {
      const candidates = Array.isArray(next.imageCandidates) ? next.imageCandidates : [];
      next.imageUrl = rule.reason === 'venue_logo'
        ? candidates.find((url) => validImageUrl(url) && url !== rule.badValue
          && !/\b(?:logo|avatar|favicon|icon)\b/i.test(url)) || ''
        : '';
      applied.push(rule.id);
    }
    if (rule.field === 'description' && (rule.reason === 'date_not_description'
      ? isDateOnlyDescription(next.description) || next.description === rule.badValue
      : next.description === rule.badValue)) {
      next.description = '';
      applied.push(rule.id);
    }
  }
  return { row: next, applied };
}

module.exports = { RULE_REASONS, ruleFromCorrection, ruleInstruction, activeRuleHints,
  isDateOnlyDescription, applyStructuredRules };
