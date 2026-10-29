/**
 * A Just Go Live night's card, as an organizer hands it over: the event's
 * look, its opening screen, and its matches in order. Loaded from JSON with
 * `scripts/justGoLiveEvent.js`, checked here, and stored on the event.
 *
 * Unknown keys are dropped; the phones' own parsers are just as strict, so a
 * card that passes here renders.
 */

const EVENT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ITEM_ID = /^[A-Za-z0-9_-]{1,40}$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const COPY_KEY = /^[a-z]+\.[A-Za-z0-9]+$/;

const MAX_MATCHES = 24;
const MIN_SIDES = 2;
const MAX_SIDES = 4;

function str(value, max) {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text ? text.slice(0, max) : undefined;
}

/** `https://` only, or the app's built-in art (`justgo-art://wrestler/…`). */
function imageUrl(value) {
  const text = str(value, 2048);
  if (!text) return undefined;
  return /^https:\/\//i.test(text) || /^justgo-art:\/\//.test(text) ? text : undefined;
}

function link(value) {
  if (!value || typeof value !== 'object') return undefined;
  const label = str(value.label, 40);
  const url = str(value.url, 2048);
  return label && url && /^https:\/\//i.test(url) ? { label, url } : undefined;
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function parseSide(value, errors, where) {
  if (!value || typeof value !== 'object') {
    errors.push(`${where}: not an object`);
    return null;
  }
  const id = str(value.id, 40);
  const name = str(value.name, 80);
  if (!id || !ITEM_ID.test(id)) errors.push(`${where}: id must be letters, numbers, - or _`);
  if (!name) errors.push(`${where}: name is required`);
  if (value.color !== undefined && !COLOR.test(String(value.color))) {
    errors.push(`${where}: color must be #RRGGBB`);
  }
  const stats = Array.isArray(value.stats)
    ? value.stats
      .map((stat) => compact({ label: str(stat?.label, 24), value: str(stat?.value, 24) }))
      .filter((stat) => stat.label && stat.value)
      .slice(0, 4)
    : undefined;
  const members = Array.isArray(value.members)
    ? value.members
      .map((member) => compact({ name: str(member?.name, 80), imageUrl: imageUrl(member?.imageUrl) }))
      .filter((member) => member.name)
      .slice(0, 6)
    : undefined;
  return compact({
    id,
    name,
    detail: str(value.detail, 80),
    color: COLOR.test(String(value.color)) ? String(value.color) : undefined,
    imageUrl: imageUrl(value.imageUrl),
    imageCutout: value.imageCutout === true ? true : undefined,
    heroUrl: imageUrl(value.heroUrl),
    badge: str(value.badge, 24),
    stats: stats?.length ? stats : undefined,
    members: members?.length ? members : undefined,
  });
}

function parseMatch(value, index, errors) {
  const where = `matches[${index}]`;
  if (!value || typeof value !== 'object') {
    errors.push(`${where}: not an object`);
    return null;
  }
  const id = str(value.id, 40);
  const title = str(value.title, 120);
  if (!id || !ITEM_ID.test(id)) errors.push(`${where}: id must be letters, numbers, - or _`);
  if (!title) errors.push(`${where}: title is required`);
  const rawSides = Array.isArray(value.sides) ? value.sides : [];
  if (rawSides.length < MIN_SIDES || rawSides.length > MAX_SIDES) {
    errors.push(`${where}: needs ${MIN_SIDES} to ${MAX_SIDES} sides`);
  }
  const sides = rawSides
    .slice(0, MAX_SIDES)
    .map((side, sideIndex) => parseSide(side, errors, `${where}.sides[${sideIndex}]`))
    .filter(Boolean);
  const sideIds = new Set(sides.map((side) => side.id));
  if (sideIds.size !== sides.length) errors.push(`${where}: side ids must be unique`);
  return compact({
    id,
    title,
    kicker: str(value.kicker, 80),
    detail: str(value.detail, 200),
    callPrompt: str(value.callPrompt, 80),
    sides,
  });
}

/** Passed through to the phones as is; they parse it again. */
function parseIntro(value) {
  if (!value || typeof value !== 'object') return undefined;
  const facts = Array.isArray(value.facts)
    ? value.facts
      .map((fact) => compact({ label: str(fact?.label, 24), value: str(fact?.value, 60) }))
      .filter((fact) => fact.label && fact.value)
      .slice(0, 6)
    : undefined;
  const presenter = value.presenter && str(value.presenter.name, 80)
    ? compact({
      name: str(value.presenter.name, 80),
      logoUrl: imageUrl(value.presenter.logoUrl),
      label: str(value.presenter.label, 40),
    })
    : undefined;
  const imageEnd = Number(value.imageEnd);
  return compact({
    layout: ['card', 'poster', 'backdrop'].includes(value.layout) ? value.layout : undefined,
    imageUrl: imageUrl(value.imageUrl),
    imageEnd: Number.isFinite(imageEnd) && imageEnd >= 0 && imageEnd <= 1 ? imageEnd : undefined,
    presenter,
    align: ['start', 'center'].includes(value.align) ? value.align : undefined,
    kicker: str(value.kicker, 80),
    title: str(value.title, 120),
    body: str(value.body, 400),
    facts: facts?.length ? facts : undefined,
    showCard: typeof value.showCard === 'boolean' ? value.showCard : undefined,
    color: COLOR.test(String(value.color)) ? String(value.color) : undefined,
    cta: str(value.cta, 40),
    link: link(value.link),
  });
}

function parseCopy(value) {
  if (!value || typeof value !== 'object') return undefined;
  const entries = Object.entries(value)
    .filter(([key, text]) => COPY_KEY.test(key) && str(text, 160))
    .slice(0, 80)
    .map(([key, text]) => [key, str(text, 160)]);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/**
 * Checks and trims a card. Returns `{definition}` or `{errors}`; nothing is
 * stored unless the whole card is usable.
 */
function parseLiveEventDefinition(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return { errors: ['the card must be a JSON object'] };
  const eventId = str(value.eventId, 64);
  if (!eventId || !EVENT_ID.test(eventId)) errors.push('eventId must be letters, numbers, - or _ (64 at most)');
  if (eventId === 'demo') errors.push('eventId "demo" is the app\'s on-device demo');
  const title = str(value.title, 120);
  if (!title) errors.push('title is required');
  if (value.accent !== undefined && !COLOR.test(String(value.accent))) errors.push('accent must be #RRGGBB');
  const rawMatches = Array.isArray(value.matches) ? value.matches : [];
  if (!rawMatches.length) errors.push('matches: at least one');
  if (rawMatches.length > MAX_MATCHES) errors.push(`matches: ${MAX_MATCHES} at most`);
  const matches = rawMatches
    .slice(0, MAX_MATCHES)
    .map((match, index) => parseMatch(match, index, errors))
    .filter(Boolean);
  const matchIds = new Set(matches.map((match) => match.id));
  if (matchIds.size !== matches.length) errors.push('match ids must be unique');
  if (errors.length) return { errors };
  return {
    definition: compact({
      eventId,
      title,
      kicker: str(value.kicker, 80),
      detail: str(value.detail, 200),
      accent: COLOR.test(String(value.accent)) ? String(value.accent) : undefined,
      intro: parseIntro(value.intro),
      copy: parseCopy(value.copy),
      matches,
    }),
  };
}

module.exports = { parseLiveEventDefinition, EVENT_ID };
