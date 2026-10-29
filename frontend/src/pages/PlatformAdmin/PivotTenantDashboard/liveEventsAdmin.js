/**
 * Pivot admin → Live: the card a Just Go Live night runs on, as a form. The
 * server checks it again (`services/justGoLive/liveEventDefinition`); these
 * helpers only shape it. Match and corner ids are made once and never
 * change, so editing a name mid-night keeps every pick attached.
 */

export const LIVE_EVENTS_PATH = '/admin/pivot/live-events';

export function liveEventPaths(eventId) {
  const base = `${LIVE_EVENTS_PATH}/${encodeURIComponent(eventId)}`;
  return {
    event: base,
    reset: `${base}/reset`,
    image: `${base}/image`,
    close: `${base}/close`,
    unlockSpotter: `${base}/unlock-spotter`,
  };
}

export const LIVE_EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** The app's drawn fighters, for cards without photos. */
export const LIVE_DRAWN_FIGHTERS = Object.freeze(['rex', 'vega', 'ace', 'vex', 'chaos']);
const DRAWN_PREFIX = 'justgo-art://wrestler/';

export function drawnFighterUrl(name) {
  return `${DRAWN_PREFIX}${name}`;
}

/** `justgo-art://wrestler/vega` → `vega`; anything else → ''. */
export function drawnFighterName(url) {
  return typeof url === 'string' && url.startsWith(DRAWN_PREFIX) ? url.slice(DRAWN_PREFIX.length) : '';
}

/** Corner colours in order, as the app picks them when none is set. */
export const LIVE_SIDE_COLORS = Object.freeze(['#FF4F1F', '#4AB5FF', '#FFD23F', '#5FD068']);

export const LIVE_INTRO_LAYOUTS = Object.freeze([
  { value: 'card', label: 'Card: banner, details, tonight’s matches' },
  { value: 'poster', label: 'Poster: one image fills the screen' },
  { value: 'backdrop', label: 'Backdrop: image on top, details under it' },
]);

export function validateLiveEventId(eventId) {
  const id = String(eventId || '').trim();
  if (!id) return 'Give the event an id. It goes in the QR code, so it can’t change later.';
  if (!LIVE_EVENT_ID_PATTERN.test(id)) return 'Use letters, numbers, - and _ only (64 at most).';
  if (id === 'demo') return '"demo" is the app’s on-device demo.';
  return '';
}

function nextMatchId(matches) {
  const taken = new Set(matches.map((match) => match.id));
  let n = matches.length + 1;
  while (taken.has(`m${n}`)) n += 1;
  return `m${n}`;
}

function nextSideId(match) {
  const taken = new Set(match.sides.map((side) => side.id));
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    const id = `${match.id}-${letter}`;
    if (!taken.has(id)) return id;
  }
  return `${match.id}-${Date.now().toString(36)}`;
}

export function blankLiveSide(match) {
  return {
    id: nextSideId(match),
    name: '',
    detail: '',
    color: LIVE_SIDE_COLORS[match.sides.length % LIVE_SIDE_COLORS.length],
    imageUrl: '',
    imageCutout: false,
    badge: '',
  };
}

export function blankLiveMatch(matches) {
  const match = { id: nextMatchId(matches), title: '', kicker: '', callPrompt: '', sides: [] };
  match.sides.push(blankLiveSide(match));
  match.sides.push(blankLiveSide(match));
  return match;
}

export function blankLiveCard() {
  return {
    title: '',
    kicker: '',
    accent: '#FF4F1F',
    intro: blankIntro(),
    matches: [blankLiveMatch([])],
  };
}

function blankIntro() {
  return {
    layout: 'card',
    imageUrl: '',
    imageEnd: 0.6,
    align: 'start',
    color: '',
    presenterName: '',
    presenterLabel: '',
    kicker: '',
    title: '',
    body: '',
    facts: [],
    cta: 'step in',
    showCard: true,
  };
}

const text = (value) => (typeof value === 'string' ? value : '');

/** A stored card → the form. */
export function liveCardFromDefinition(definition = {}) {
  const intro = definition.intro || {};
  return {
    title: text(definition.title),
    kicker: text(definition.kicker),
    accent: text(definition.accent) || '#FF4F1F',
    intro: {
      ...blankIntro(),
      layout: intro.layout || 'card',
      imageUrl: text(intro.imageUrl),
      imageEnd: typeof intro.imageEnd === 'number' ? intro.imageEnd : 0.6,
      align: intro.align || 'start',
      color: text(intro.color),
      presenterName: text(intro.presenter?.name),
      presenterLabel: text(intro.presenter?.label),
      kicker: text(intro.kicker),
      title: text(intro.title),
      body: text(intro.body),
      facts: (intro.facts || []).map((fact) => ({ label: text(fact.label), value: text(fact.value) })),
      cta: text(intro.cta),
      showCard: intro.showCard !== false,
    },
    matches: (definition.matches || []).map((match) => ({
      id: match.id,
      title: text(match.title),
      kicker: text(match.kicker),
      callPrompt: text(match.callPrompt),
      sides: (match.sides || []).map((side) => ({
        id: side.id,
        name: text(side.name),
        detail: text(side.detail),
        color: text(side.color),
        imageUrl: text(side.imageUrl),
        imageCutout: side.imageCutout === true,
        badge: text(side.badge),
      })),
    })),
  };
}

/** Drops empty strings so the server sees only what was filled in. */
function compact(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== '' && value !== undefined && value !== null),
  );
}

const trim = (value) => String(value ?? '').trim();

/** The form → the card the server stores. */
export function liveDefinitionFromCard(card) {
  const intro = card.intro || blankIntro();
  const facts = (intro.facts || [])
    .map((fact) => ({ label: trim(fact.label), value: trim(fact.value) }))
    .filter((fact) => fact.label && fact.value);
  const presenterName = trim(intro.presenterName);
  return compact({
    title: trim(card.title),
    kicker: trim(card.kicker),
    accent: trim(card.accent),
    intro: compact({
      layout: intro.layout,
      imageUrl: trim(intro.imageUrl),
      imageEnd: intro.layout === 'backdrop' && trim(intro.imageUrl) ? Number(intro.imageEnd) : undefined,
      align: intro.align === 'center' ? 'center' : undefined,
      color: trim(intro.color),
      presenter: presenterName ? compact({ name: presenterName, label: trim(intro.presenterLabel) }) : undefined,
      kicker: trim(intro.kicker),
      title: trim(intro.title),
      body: trim(intro.body),
      facts: facts.length ? facts : undefined,
      showCard: intro.layout === 'card' && intro.showCard === false ? false : undefined,
      cta: trim(intro.cta),
    }),
    matches: (card.matches || []).map((match) => compact({
      id: match.id,
      title: trim(match.title),
      kicker: trim(match.kicker),
      callPrompt: trim(match.callPrompt),
      sides: match.sides.map((side) => compact({
        id: side.id,
        name: trim(side.name),
        detail: trim(side.detail),
        color: trim(side.color),
        imageUrl: trim(side.imageUrl),
        imageCutout: side.imageCutout && trim(side.imageUrl) && !drawnFighterName(side.imageUrl) ? true : undefined,
        badge: trim(side.badge),
      })),
    })),
  });
}

/** What fans scan: the App Clip for a city, joining this event. */
export function liveFanLink({ city = 'ic', eventId, source = '' }) {
  const params = new URLSearchParams({ live: eventId });
  const src = trim(source).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (src) params.set('src', src);
  return `https://justgo.lol/clip/${encodeURIComponent(city)}?${params.toString()}`;
}

/** The spotter's console, on the same server as this admin. */
export function liveSpotterLink(eventId, origin = typeof window !== 'undefined' ? window.location.origin : '') {
  return `${origin}/pivot/live/${encodeURIComponent(eventId)}/spot`;
}

/** A date as a `datetime-local` value, in this browser's time zone. */
export function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The night's hours from the two inputs, for the server. Empty closes the night. */
export function liveHoursFromInputs({ opens = '', closes = '' } = {}) {
  const iso = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };
  return { opensAt: iso(opens), closesAt: iso(closes) };
}

export function liveHoursInputs(hours) {
  return { opens: toLocalInput(hours?.opensAt), closes: toLocalInput(hours?.closesAt) };
}

/** Where a night's hours stand, in a few words: `{label, tone}`. */
export function liveHoursStatus(hours, now = Date.now()) {
  const opens = hours?.opensAt ? Date.parse(hours.opensAt) : NaN;
  const closes = hours?.closesAt ? Date.parse(hours.closesAt) : NaN;
  if (Number.isNaN(opens) || Number.isNaN(closes) || closes <= now) return { label: 'Closed to phones', tone: 'muted' };
  const when = (time) => new Date(time).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  if (opens > now) return { label: `Opens to phones ${when(opens)}`, tone: 'info' };
  return { label: `Open to phones until ${when(closes)}`, tone: 'ok' };
}

export function moveItem(list, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}
