/**
 * "Sorry u missed it" carousel — slide type manifest.
 *
 * The one place a template's data contract is declared. Adding a type is an
 * entry here plus a matching frame component and its CSS on the frontend; no
 * schema change, no endpoint change, and nothing in the editor to teach.
 *
 * The manifest is the data half of a slide type. The rendering half is the
 * component registry in the frontend's carousel/zineFrames.jsx. They are joined
 * only by the type key, which is why this file can live on the server and be
 * served to the editor rather than duplicated into it.
 *
 * Static or dynamic — the rule the whole editor hangs off:
 *
 *   A field carrying a `voice` key is STATIC house copy. It reads the same in
 *   every issue ("dispatch", "meanwhile", "you, not here", the whole back
 *   cover), it is edited only in the carousel voice panel, and it is never
 *   typable on the slide.
 *
 *   Everything else is DYNAMIC — event names, venues, times, tags, the run of
 *   show, the scene, the counterpoint, the issue number and dateline. It
 *   changes every week and is typed directly on the slide.
 *
 * A slide type whose fields are all voice-keyed has nothing to edit on the
 * slide at all. The back cover is exactly that, on purpose.
 *
 * Field kinds:
 *   line      — one line of text, `max` characters
 *   paragraph — prose, `max` characters
 *   number    — digits kept as a string, so leading zeros survive
 *   tags      — up to `max` short strings
 *   rows      — up to `max` records, each with the keys in `of`
 *   enum      — one of `values`
 *   boolean   — on or off
 *
 * Every `max` is load-bearing rather than defensive. The frames are fixed 4:5
 * boxes with no scroll, so copy that overruns its slot does not wrap out of
 * view — it collides with the next block. These caps are what keep authored
 * copy inside the geometry.
 */

/** Longest a single `rows` record's text may run. */
const ROW_TEXT_MAX = 64;

const ZINE_SLIDE_TYPES = Object.freeze({
  cover: {
    label: 'cover',
    blurb: 'the week’s cover line, over last night’s lead photo',
    fixed: 'first',
    // One optional slot, for the lead photograph only. A cross-slide reference
    // would dangle the moment its source slide was deleted; a slot of its own
    // is uniform with every other type and cannot break.
    events: { min: 0, max: 1 },
    photo: 'flier|upload',
    options: [
      { key: 'stamp', kind: 'boolean', default: true, label: 'missed stamp' },
      /*
       * Type sitting directly on a photograph. `auto` follows the edition —
       * light on night, dark on newsprint — which is right until a picture is
       * unusually bright or dark in the corner the type lands in. Setting it
       * also flips the scrim, because light type over a pale wash is not a
       * choice anyone means to make.
       */
      { key: 'photoText', kind: 'enum', values: ['auto', 'light', 'dark'], default: 'auto', label: 'text over photo' },
      // The line naming what the cover photograph is. Off when the picture is
      // doing the work on its own and does not want a label.
      { key: 'photoCredit', kind: 'boolean', default: true, label: 'name the photo' },
    ],
    fields: [
      { key: 'name', kind: 'line', max: 32, voice: 'zine.cover.name', shipped: 'sorry u missed it' },
      { key: 'tagline', kind: 'line', max: 52, voice: 'zine.cover.tagline', shipped: 'everything that happened while you were home' },
            /*
       * Derived until written. The cover line is built from the deck's own
       * records so a new week rewrites its own cover, but it is an ordinary
       * dynamic slot: type over it and the deck keeps what you typed.
       */
      { key: 'coverLine', kind: 'line', max: 72, optional: true, derived: 'coverLead' },
      /*
       * The line under the cover line: the curation claim, in numbers. A
       * template rather than a string, because the figures come from the deck
       * and only the wording around them is anyone's to choose.
       *
       * Two of them, because a deck that has not recorded how many listings it
       * read cannot say it read them. One key with an ICU select would spare a
       * row in the panel and cost anyone editing it a fight with the syntax.
       */
      {
        key: 'sub',
        kind: 'template',
        max: 160,
        voice: 'zine.cover.sub',
        params: ['scanned', 'kept'],
        // The editor previews a template against these, so it shows a sentence
        // rather than a row of empty braces.
        sampleArgs: { scanned: '214', kept: '6' },
        shipped: 'we read {scanned} listings this week and kept {kept}. you made none of them.',
      },
      {
        key: 'subUncounted',
        kind: 'template',
        max: 160,
        voice: 'zine.cover.subUncounted',
        params: ['kept'],
        sampleArgs: { kept: '6' },
        shipped: 'we kept {kept} of everything on this week. you made none of them.',
      },
    ],
  },

  wall: {
    label: 'the wall',
    blurb: 'three or four postings, struck through',
    events: { min: 3, max: 4 },
    photo: 'flier',
    /*
     * Postings are the smallest thing in the issue and four of them share one
     * frame, so they carry a name and a time by default. Venue and tags are
     * available but they overflow the plate on anything but short records.
     */
    options: [
      { key: 'detail', kind: 'enum', values: ['minimal', 'full'], default: 'minimal', label: 'posting detail' },
    ],
    fields: [
      { key: 'title', kind: 'line', max: 18, voice: 'zine.wall.title', shipped: 'the wall' },
      { key: 'kicker', kind: 'line', max: 48, optional: true },
    ],
    perEvent: [
      { key: 'tags', kind: 'tags', max: 2, itemMax: 22, optional: true },
    ],
  },

  card: {
    label: 'the card',
    blurb: 'photo is the frame, the listing sits on it',
    events: { exactly: 1 },
    photo: 'flier|upload',
    options: [
      { key: 'stamp', kind: 'boolean', default: true, label: 'missed stamp' },
      /*
       * Type sitting directly on a photograph. `auto` follows the edition —
       * light on night, dark on newsprint — which is right until a picture is
       * unusually bright or dark in the corner the type lands in. Setting it
       * also flips the scrim, because light type over a pale wash is not a
       * choice anyone means to make.
       */
      { key: 'photoText', kind: 'enum', values: ['auto', 'light', 'dark'], default: 'auto', label: 'text over photo' },
    ],
    fields: [
      { key: 'slug', kind: 'line', max: 20, voice: 'zine.card.slug', shipped: 'last night' },
    ],
    perEvent: [
      { key: 'tags', kind: 'tags', max: 3, itemMax: 22, optional: true },
      { key: 'note', kind: 'line', max: 84, optional: true },
    ],
  },

  notice: {
    label: 'the notice',
    blurb: 'one event, one knockout',
    events: { exactly: 1 },
    photo: 'flier|upload',
    fields: [
      { key: 'slug', kind: 'line', max: 20, voice: 'zine.notice.slug', shipped: 'in absentia' },
      { key: 'cut', kind: 'line', max: 24, voice: 'zine.notice.cut', shipped: 'you, not here' },
    ],
    options: [
      { key: 'knockoutShape', kind: 'enum', values: [0, 1, 2], default: 0, label: 'cut shape' },
      // The caption inside the cut sits on the photograph, so it needs the same
      // control the cover and the card have.
      { key: 'photoText', kind: 'enum', values: ['auto', 'light', 'dark'], default: 'auto', label: 'text over photo' },
    ],
    perEvent: [
      { key: 'tags', kind: 'tags', max: 3, itemMax: 22, optional: true },
      { key: 'note', kind: 'line', max: 84, optional: true },
    ],
  },

  dispatch: {
    label: 'the dispatch',
    blurb: 'when it turned, what it sounded like',
    events: { exactly: 1 },
    photo: 'flier|upload',
    fields: [
      { key: 'slug', kind: 'line', max: 20, voice: 'zine.dispatch.slug', shipped: 'dispatch' },
      { key: 'insteadLabel', kind: 'line', max: 16, voice: 'zine.dispatch.instead', shipped: 'meanwhile' },
    ],
    perEvent: [
      { key: 'tags', kind: 'tags', max: 3, itemMax: 22, optional: true },
      { key: 'runOfShow', kind: 'rows', of: ['t', 'what'], max: 4, itemMax: ROW_TEXT_MAX, optional: true },
      { key: 'scene', kind: 'paragraph', max: 300, optional: true },
      { key: 'instead', kind: 'line', max: 80, optional: true },
    ],
  },

  receipt: {
    label: 'the receipt',
    blurb: 'the whole issue, in figures',
    // Derived: the lines come from the other slides in deck order, so this
    // template has no picker of its own.
    events: 'derived',
    photo: 'none',
    fields: [
      { key: 'footer', kind: 'line', max: 48, voice: 'zine.receipt.footer', shipped: 'no refunds. it already happened.' },
      { key: 'stamp', kind: 'line', max: 18, voice: 'zine.receipt.stamp', shipped: '0 attended' },
    ],
  },

  back: {
    label: 'back cover',
    blurb: 'the wordmark, at full size, on its own',
    fixed: 'last',
    events: { min: 0, max: 0 },
    photo: 'none',
    fields: [
      { key: 'kicker', kind: 'line', max: 44, voice: 'zine.back.kicker', shipped: 'this took ninety seconds to read' },
      { key: 'line', kind: 'line', max: 52, voice: 'zine.back.line', shipped: 'next thursday you find out on monday' },
      { key: 'sub', kind: 'line', max: 120, voice: 'zine.back.sub', shipped: 'just go tells you what is on this week, before it is last night.' },
      { key: 'url', kind: 'line', max: 32, voice: 'zine.back.url', shipped: 'justgo.lol' },
    ],
  },
});

const ZINE_SLIDE_TYPE_KEYS = Object.freeze(Object.keys(ZINE_SLIDE_TYPES));

/** Types a person can add or remove. The fixed pair open and close every deck. */
const ZINE_ADDABLE_TYPES = Object.freeze(
  ZINE_SLIDE_TYPE_KEYS.filter((key) => !ZINE_SLIDE_TYPES[key].fixed),
);

function slideTypeFor(type) {
  return ZINE_SLIDE_TYPES[type] || null;
}

/** How many event slots a type takes. `derived` types take none of their own. */
function eventSlotRange(type) {
  const spec = slideTypeFor(type);
  if (!spec || spec.events === 'derived') return { min: 0, max: 0, derived: true };
  const { events } = spec;
  if (typeof events?.exactly === 'number') {
    return { min: events.exactly, max: events.exactly, derived: false };
  }
  return { min: events?.min || 0, max: events?.max || 0, derived: false };
}

/**
 * Every voice key the manifest declares, in the order they appear. This is the
 * carousel voice panel's catalog — there is no second registry to keep in sync.
 */
function zineVoiceKeys() {
  const keys = [];
  for (const type of ZINE_SLIDE_TYPE_KEYS) {
    for (const field of ZINE_SLIDE_TYPES[type].fields || []) {
      if (!field.voice) continue;
      keys.push({
        path: field.voice,
        type,
        field: field.key,
        max: field.max,
        shipped: field.shipped ?? '',
        // A template's params drive the editor's interpolator affordance and
        // its preview; a plain string has none.
        kind: field.kind === 'template' ? 'template' : 'string',
        params: field.params || [],
        sampleArgs: field.sampleArgs || undefined,
      });
    }
  }
  return keys;
}

/** A slide of `type` with nothing filled in. */
function emptySlideOf(type) {
  const spec = slideTypeFor(type);
  if (!spec) return null;

  const options = {};
  for (const option of spec.options || []) {
    if (option.default !== undefined) options[option.key] = option.default;
  }

  const range = eventSlotRange(type);
  const events = Array.from({ length: range.min }, () => ({
    eventId: null,
    label: null,
    snapshot: null,
    imageOverride: null,
    values: {},
  }));

  return { type, values: {}, options, events };
}

function textOf(value) {
  return typeof value === 'string' ? value : '';
}

/** Trim a value to the manifest's shape. Returns the coerced value, never throws. */
function coerceField(field, raw) {
  switch (field.kind) {
    case 'number':
      return textOf(raw).replace(/[^0-9]/g, '').slice(0, field.max);

    case 'tags':
      return (Array.isArray(raw) ? raw : [])
        .map((tag) => textOf(tag).trim().slice(0, field.itemMax || 24))
        .filter(Boolean)
        .slice(0, field.max);

    case 'rows':
      return (Array.isArray(raw) ? raw : [])
        .slice(0, field.max)
        .map((row) => {
          const out = {};
          for (const key of field.of) {
            out[key] = textOf(row?.[key]).trim().slice(0, field.itemMax || ROW_TEXT_MAX);
          }
          return out;
        })
        .filter((row) => field.of.some((key) => row[key]));

    case 'boolean':
      return typeof raw === 'boolean' ? raw : field.default;

    case 'enum':
      return field.values.includes(raw) ? raw : field.default;

    case 'line':
    case 'paragraph':
    default:
      return textOf(raw).slice(0, field.max);
  }
}

/**
 * Coerce one slide against the manifest: unknown keys are dropped, every value
 * is capped, and the event list is held inside the type's slot range. Returns
 * `{ slide, notes }` — notes name what was changed, for the caller to surface.
 */
function coerceSlide(raw) {
  if (raw && (Number(raw.schemaVersion) >= 2 || (raw.kind && !raw.type) || (Array.isArray(raw.elements) && !raw.type))) {
    return {
      error: 'A schemaVersion 2 document cannot be trimmed into a legacy slide.',
      code: 'SCHEMA_VERSION_UNSUPPORTED',
    };
  }
  const spec = slideTypeFor(raw?.type);
  if (!spec) return { error: `Unknown slide type: ${raw?.type}` };

  const notes = [];
  const values = {};
  for (const field of spec.fields || []) {
    if (raw?.values?.[field.key] === undefined) continue;
    const coerced = coerceField(field, raw.values[field.key]);
    if (typeof coerced === 'string' && coerced.length < textOf(raw.values[field.key]).length) {
      notes.push(`${raw.type}.${field.key} trimmed to ${field.max}`);
    }
    values[field.key] = coerced;
  }

  const options = {};
  for (const option of spec.options || []) {
    options[option.key] = coerceField(option, raw?.options?.[option.key]);
  }

  const range = eventSlotRange(raw.type);
  const incoming = Array.isArray(raw?.events) ? raw.events : [];
  if (incoming.length > range.max) {
    notes.push(`${raw.type} takes at most ${range.max} event(s)`);
  }

  const events = incoming.slice(0, range.max).map((entry) => {
    const eventValues = {};
    for (const field of spec.perEvent || []) {
      if (entry?.values?.[field.key] === undefined) continue;
      eventValues[field.key] = coerceField(field, entry.values[field.key]);
    }
    return {
      eventId: entry?.eventId || null,
      label: entry?.label ? textOf(entry.label).slice(0, 40) : null,
      snapshot: entry?.snapshot || null,
      imageOverride: entry?.imageOverride || null,
      values: eventValues,
    };
  });

  return {
    slide: { _id: raw?._id, type: raw.type, values, options, events },
    notes,
  };
}

/** Slots a slide still needs before it is worth exporting. */
function slideGaps(slide) {
  const spec = slideTypeFor(slide?.type);
  if (!spec) return ['unknown type'];

  const gaps = [];
  for (const field of spec.fields || []) {
    if (field.optional || field.derived) continue;
    if (!textOf(slide?.values?.[field.key]).trim()) gaps.push(field.key);
  }

  const range = eventSlotRange(slide.type);
  const filled = (slide?.events || []).filter((entry) => entry?.snapshot?.name).length;
  if (filled < range.min) gaps.push(`${range.min - filled} more event(s)`);

  return gaps;
}

module.exports = {
  ZINE_SLIDE_TYPES,
  ZINE_SLIDE_TYPE_KEYS,
  ZINE_ADDABLE_TYPES,
  slideTypeFor,
  eventSlotRange,
  zineVoiceKeys,
  emptySlideOf,
  coerceSlide,
  slideGaps,
};
