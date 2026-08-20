/**
 * Consumer marketing page — Just Go voice only.
 * Lowercase, action-first, no Atlas / Meridian / ClubDash language.
 *
 * Bundled strings are the first paint. A later platform pack may overlay
 * catalog keys; failures keep this object.
 */

import { createContext, useContext } from 'react';
import { landingTenantKeyFromParam } from './justGoLandingUtils';

const TOKEN_DEFAULTS = Object.freeze({
  'brand.name': 'just go',
  'brand.cta': 'go',
  'group.singular': 'circle',
  'group.plural': 'circles',
});

const justGoLandingCopy = Object.freeze({
  productName: 'just go',
  wordmarkAlt: 'just go',
  documentTitle: 'just go. this week in your city',
  metaDescription:
    "stop planning. swipe what's on in your city this week. just go.",
  proofFallback: "no plans? just go. this week in your city",
  proofPrefix: 'live in',
  navDrop: 'the drop',
  navStory: 'our story',
  countdownKicker: 'next drop',
  countdownKickerIn: 'in',
  countdownLive: "it's live",
  countdownUnitDays: 'd',
  countdownUnitHours: 'h',
  countdownUnitMinutes: 'm',
  countdownUnitSeconds: 's',
  headlineLead: 'what are you',
  headlinePop: 'doing this week?',
  cta: 'get just go',
  ctaAriaIos: 'download just go on the app store',
  ctaAriaAndroid: 'get just go on google play',
  citiesLoading: 'loading cities',
  citiesEmpty: "just go isn’t live in your area yet. check back soon",
  flyersEyebrow: 'this week',
  flyersTitle: 'the drop',
  flyersBody: 'a new week, a new deck.',
  deckEyebrow: 'this week',
  deckTitle: 'the drop',
  deckBody: 'swipe what’s on.',
  deckEmpty: "this week’s drop is still cooking. get the app",
  deckLoading: 'loading this week’s drop',
  deckHint: 'left to pass · right to save',
  deckPass: 'pass',
  deckInterested: 'interested',
  deckPassHint: 'release to skip',
  deckInterestedHint: 'release to save',
  deckDownloadTitle: 'the rest is in the app',
  deckDownloadBody: 'the full week, and the people going. get just go.',
  cityPickerLabel: 'your city',
  storyTitle: 'the movement',
  story: Object.freeze([
    'when did going out get so complicated?',
    'nowadays, plans don\'t fail at the door. they die in the group chat, in "maybes"',
    'we built a weekly drop for people who’d rather just go.',
  ]),
  stickyCta: 'get just go',
  contactLead: "don't be a stranger",
  footerStamp: 'monday drop',
  footerHost: 'hosting?',
  footerHostLink: 'put a night in the drop',
  footerNote: 'a night we missed? a bone to pick?',
  footerEmail: 'raven@meridian.study',
  footerPrivacy: 'privacy',
  footerTerms: 'terms',
  skip: 'skip to drop',
  waitlistCta: 'save my spot',
  waitlistEmailLabel: 'email',
  waitlistEmailPlaceholder: 'you@email.com',
  waitlistSubmit: 'save my spot',
  waitlistSubmitting: 'saving…',
  waitlistConsent: 'we keep your email to let you into this city. by joining you agree to our',
  waitlistCityRequired: 'pick a city first',
  waitlistEmailRequired: 'need a real email',
  waitlistDuplicate: "you're already on this city's list",
  waitlistError: "couldn't save that. try again",
  waitlistSuccessTitle: "you're on the list",
  waitlistSuccessBody: 'friends who join help you get in earlier.',
  waitlistFriendsJoined: '{count} friends joined',
  waitlistFriendsJoinedOne: '1 friend joined',
  waitlistCopyLink: 'copy link',
  waitlistCopied: 'copied',
  waitlistShare: 'share with a friend',
  waitlistShareText: 'friends who join help you get in earlier.',
  qrMissingTitle: 'that code isn’t live',
  qrMissingBody: 'this poster link doesn’t go anywhere yet. head back to just go.',
  qrBack: 'back to just go',
});

/** Field → catalog path. Nested under `landing.web` (JustGoLanding folder). */
export const JUSTGO_LANDING_COPY_KEYS = Object.freeze({
  productName: 'brand.name',
  wordmarkAlt: 'brand.name',
  documentTitle: 'landing.web.documentTitle',
  metaDescription: 'landing.web.metaDescription',
  proofFallback: 'landing.web.proofFallback',
  proofPrefix: 'landing.web.proofPrefix',
  navDrop: 'landing.web.nav.drop',
  navStory: 'landing.web.nav.story',
  countdownKicker: 'landing.web.countdown.kicker',
  countdownKickerIn: 'landing.web.countdown.kickerIn',
  countdownLive: 'landing.web.countdown.live',
  countdownUnitDays: 'landing.web.countdown.unitDays',
  countdownUnitHours: 'landing.web.countdown.unitHours',
  countdownUnitMinutes: 'landing.web.countdown.unitMinutes',
  countdownUnitSeconds: 'landing.web.countdown.unitSeconds',
  headlineLead: 'landing.web.headline.lead',
  headlinePop: 'landing.web.headline.pop',
  cta: 'landing.web.cta',
  ctaAriaIos: 'landing.web.ctaAriaIos',
  ctaAriaAndroid: 'landing.web.ctaAriaAndroid',
  citiesLoading: 'landing.web.cities.loading',
  citiesEmpty: 'landing.web.cities.empty',
  flyersEyebrow: 'landing.web.flyers.eyebrow',
  flyersTitle: 'landing.web.flyers.title',
  flyersBody: 'landing.web.flyers.body',
  deckEyebrow: 'landing.web.deck.eyebrow',
  deckTitle: 'landing.web.deck.title',
  deckBody: 'landing.web.deck.body',
  deckEmpty: 'landing.web.deck.empty',
  deckLoading: 'landing.web.deck.loading',
  deckHint: 'landing.web.deck.hint',
  deckPass: 'landing.web.deck.pass',
  deckInterested: 'landing.web.deck.interested',
  deckPassHint: 'landing.web.deck.passHint',
  deckInterestedHint: 'landing.web.deck.interestedHint',
  deckDownloadTitle: 'landing.web.deck.downloadTitle',
  deckDownloadBody: 'landing.web.deck.downloadBody',
  cityPickerLabel: 'landing.web.cityPickerLabel',
  storyTitle: 'landing.web.story.title',
  stickyCta: 'landing.web.stickyCta',
  contactLead: 'landing.web.contactLead',
  footerStamp: 'landing.web.footer.stamp',
  footerHost: 'landing.web.footer.host',
  footerHostLink: 'landing.web.footer.hostLink',
  footerNote: 'landing.web.footer.note',
  footerEmail: 'landing.web.footer.email',
  footerPrivacy: 'landing.web.footer.privacy',
  footerTerms: 'landing.web.footer.terms',
  skip: 'landing.web.skip',
  waitlistCta: 'landing.web.waitlist.cta',
  waitlistEmailLabel: 'landing.web.waitlist.emailLabel',
  waitlistEmailPlaceholder: 'landing.web.waitlist.emailPlaceholder',
  waitlistSubmit: 'landing.web.waitlist.submit',
  waitlistSubmitting: 'landing.web.waitlist.submitting',
  waitlistConsent: 'landing.web.waitlist.consent',
  waitlistCityRequired: 'landing.web.waitlist.cityRequired',
  waitlistEmailRequired: 'landing.web.waitlist.emailRequired',
  waitlistDuplicate: 'landing.web.waitlist.duplicate',
  waitlistError: 'landing.web.waitlist.error',
  waitlistSuccessTitle: 'landing.web.waitlist.successTitle',
  waitlistSuccessBody: 'landing.web.waitlist.successBody',
  waitlistFriendsJoined: 'landing.web.waitlist.friendsJoined',
  waitlistFriendsJoinedOne: 'landing.web.waitlist.friendsJoinedOne',
  waitlistCopyLink: 'landing.web.waitlist.copyLink',
  waitlistCopied: 'landing.web.waitlist.copied',
  waitlistShare: 'landing.web.waitlist.share',
  waitlistShareText: 'landing.web.waitlist.shareText',
  qrMissingTitle: 'landing.web.qr.missingTitle',
  qrMissingBody: 'landing.web.qr.missingBody',
  qrBack: 'landing.web.qr.back',
});

export const JUSTGO_LANDING_STORY_KEYS = Object.freeze([
  'landing.web.story.graf0',
  'landing.web.story.graf1',
  'landing.web.story.graf2',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeLandingTokens(overlayTokens) {
  const tokens = { ...TOKEN_DEFAULTS };
  if (isPlainObject(overlayTokens)) {
    for (const name of Object.keys(TOKEN_DEFAULTS)) {
      const value = overlayTokens[name];
      if (typeof value === 'string' && value.trim()) {
        tokens[name] = value;
      }
    }
  }
  return tokens;
}

const LANDING_COPY_RUNTIME_PLACEHOLDERS = Object.freeze(new Set(['{count}']));

function formatLandingTemplate(template, tokens) {
  let out = String(template);
  for (const [name, value] of Object.entries(tokens)) {
    out = out.split(`{${name}}`).join(value);
  }
  const leftovers = out.match(/\{[^{}]+\}/g) || [];
  if (leftovers.some((token) => !LANDING_COPY_RUNTIME_PLACEHOLDERS.has(token))) {
    return null;
  }
  if ((out.includes('{') || out.includes('}')) && leftovers.length === 0) {
    return null;
  }
  const trimmed = out.trim();
  return trimmed || null;
}

export function resolveLandingCopyField(path, pack, fallback) {
  const bundled = fallback == null ? '' : String(fallback);
  if (!path || !isPlainObject(pack)) {
    return bundled;
  }
  const entries = isPlainObject(pack.entries) ? pack.entries : {};
  const tokens = isPlainObject(pack.tokens) ? pack.tokens : {};
  let overlay = entries[path];
  if (
    (typeof overlay !== 'string' || !overlay.trim()) &&
    Object.prototype.hasOwnProperty.call(TOKEN_DEFAULTS, path)
  ) {
    overlay = tokens[path];
  }
  if (typeof overlay !== 'string' || !overlay.trim()) {
    return bundled;
  }
  return formatLandingTemplate(overlay, mergeLandingTokens(pack.tokens)) || bundled;
}

export function resolveJustGoLandingCopy(pack) {
  const next = { ...justGoLandingCopy };
  for (const [field, path] of Object.entries(JUSTGO_LANDING_COPY_KEYS)) {
    next[field] = resolveLandingCopyField(path, pack, justGoLandingCopy[field]);
  }
  next.story = justGoLandingCopy.story.map((graf, index) =>
    resolveLandingCopyField(JUSTGO_LANDING_STORY_KEYS[index], pack, graf),
  );
  return next;
}

export const JustGoLandingCopyContext = createContext(justGoLandingCopy);

export function useJustGoLandingCopy() {
  return useContext(JustGoLandingCopyContext) || justGoLandingCopy;
}

export const JUSTGO_IOS_STORE_URL =
  process.env.REACT_APP_JUSTGO_IOS_STORE_URL ||
  'https://apps.apple.com/us/app/meridian-go/id6755217537';

export const JUSTGO_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=app.justgo';

export const JUSTGO_LANDING_PATH = '/justgo';

/** Canonical public origin in production. Share/QR must not mint meridian.study/justgo. */
export const JUSTGO_PUBLIC_ORIGIN = 'https://justgo.lol';

export function justGoLandingPath(tenantKey) {
  const key = landingTenantKeyFromParam(tenantKey);
  return key ? `${JUSTGO_LANDING_PATH}/${encodeURIComponent(key)}` : JUSTGO_LANDING_PATH;
}

/** Apex path for public links: `/` or `/{city}`. `/justgo` stays a valid alias. */
export function justGoCanonicalLandingPath(tenantKey) {
  const key = landingTenantKeyFromParam(tenantKey);
  return key ? `/${encodeURIComponent(key)}` : '/';
}

/**
 * Production → https://justgo.lol.
 * Dev → window.location.origin (localhost / host override).
 * Optional override: REACT_APP_JUSTGO_PUBLIC_ORIGIN or options.origin.
 */
export function justGoPublicOrigin(options = {}) {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const override = options.origin ?? process.env.REACT_APP_JUSTGO_PUBLIC_ORIGIN;
  if (typeof override === 'string' && override.trim()) {
    return override.trim().replace(/\/+$/, '');
  }
  if (nodeEnv === 'production') {
    return JUSTGO_PUBLIC_ORIGIN;
  }
  const current =
    options.windowOrigin ||
    (typeof window !== 'undefined' && window.location && window.location.origin) ||
    '';
  return current || 'http://localhost:3000';
}

/** Absolute public URL. Pass `/troy`, `/qr/poster-night`, or `/`. */
export function justGoPublicUrl(path = '/', options) {
  const origin = justGoPublicOrigin(options);
  let next = path == null || path === '' ? '/' : String(path).trim();
  if (!next.startsWith('/')) next = `/${next}`;
  if (next === '/') return origin;
  return `${origin}${next}`;
}

export function justGoPublicLandingUrl(tenantKey, options) {
  return justGoPublicUrl(justGoCanonicalLandingPath(tenantKey), options);
}

/**
 * Canonical waitlist share link. Prefers the API `shareUrl` path (keeps `?ref=`),
 * rewritten through justGoPublicUrl so production never mints meridian.study.
 */
export function resolveWaitlistShareUrl(data = {}, options) {
  const raw = String(data.shareUrl || '').trim();
  if (raw) {
    try {
      const parsed = new URL(raw, `${justGoPublicOrigin(options)}/`);
      const path = `${parsed.pathname || '/'}${parsed.search || ''}`;
      return justGoPublicUrl(path, options);
    } catch {
      if (raw.startsWith('/')) return justGoPublicUrl(raw, options);
    }
  }
  return justGoPublicLandingUrl(data.tenantKey, options);
}

export function formatWaitlistFriendsJoined(copy, count) {
  const parsed = Math.floor(Number(count));
  const n = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const template =
    n === 1
      ? copy?.waitlistFriendsJoinedOne || '1 friend joined'
      : copy?.waitlistFriendsJoined || '{count} friends joined';
  return String(template).split('{count}').join(String(n));
}

export default justGoLandingCopy;
