/**
 * Consumer marketing page — Just Go voice only.
 * Lowercase, action-first, no Atlas / Meridian / ClubDash language.
 *
 * Bundled strings are the first paint. A later platform pack may overlay
 * catalog keys; failures keep this object.
 */

import { createContext, useContext } from 'react';

const TOKEN_DEFAULTS = Object.freeze({
  'brand.name': 'just go',
  'brand.cta': 'go',
  'group.singular': 'circle',
  'group.plural': 'circles',
});

const justGoLandingCopy = Object.freeze({
  productName: 'just go',
  wordmarkAlt: 'just go',
  documentTitle: 'just go — this week in your city',
  metaDescription:
    "stop planning. swipe what's on in your city this week. just go.",
  proofFallback: "no plans? just go — this week in your city",
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
  citiesEmpty: "just go isn’t live in your area yet — check back soon",
  flyersEyebrow: 'this week',
  flyersTitle: 'the drop',
  flyersBody: 'a new week, a new deck.',
  deckEyebrow: 'this week',
  deckTitle: 'the drop',
  deckBody: 'swipe what’s on.',
  deckEmpty: "this week’s drop is still cooking — get the app",
  deckLoading: 'loading this week’s drop',
  deckHint: 'left to pass · right to save',
  deckPass: 'pass',
  deckInterested: 'interested',
  deckPassHint: 'release to skip',
  deckInterestedHint: 'release to save',
  deckDownloadTitle: 'the rest is in the app',
  deckDownloadBody: 'the full week, and the people going. get just go.',
  cityPickerLabel: 'your city',
  storyEyebrow: 'why just go',
  storyTitle: 'our story',
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
  footerNote: 'a night we missed? a bone to pick? —',
  footerEmail: 'raven@meridian.study',
  footerPrivacy: 'privacy',
  footerTerms: 'terms',
  skip: 'skip to drop',
});

/** Field → catalog path. `story` is `landing.story0`…`landing.story2`. */
export const JUSTGO_LANDING_COPY_KEYS = Object.freeze({
  productName: 'brand.name',
  wordmarkAlt: 'brand.name',
  documentTitle: 'landing.documentTitle',
  metaDescription: 'landing.metaDescription',
  proofFallback: 'landing.proofFallback',
  proofPrefix: 'landing.proofPrefix',
  navDrop: 'landing.navDrop',
  navStory: 'landing.navStory',
  countdownKicker: 'landing.countdownKicker',
  countdownKickerIn: 'landing.countdownKickerIn',
  countdownLive: 'landing.countdownLive',
  countdownUnitDays: 'landing.countdownUnitDays',
  countdownUnitHours: 'landing.countdownUnitHours',
  countdownUnitMinutes: 'landing.countdownUnitMinutes',
  countdownUnitSeconds: 'landing.countdownUnitSeconds',
  headlineLead: 'landing.headlineLead',
  headlinePop: 'landing.headlinePop',
  cta: 'landing.cta',
  ctaAriaIos: 'landing.ctaAriaIos',
  ctaAriaAndroid: 'landing.ctaAriaAndroid',
  citiesLoading: 'landing.citiesLoading',
  citiesEmpty: 'landing.citiesEmpty',
  flyersEyebrow: 'landing.flyersEyebrow',
  flyersTitle: 'landing.flyersTitle',
  flyersBody: 'landing.flyersBody',
  deckEyebrow: 'landing.deckEyebrow',
  deckTitle: 'landing.deckTitle',
  deckBody: 'landing.deckBody',
  deckEmpty: 'landing.deckEmpty',
  deckLoading: 'landing.deckLoading',
  deckHint: 'landing.deckHint',
  deckPass: 'landing.deckPass',
  deckInterested: 'landing.deckInterested',
  deckPassHint: 'landing.deckPassHint',
  deckInterestedHint: 'landing.deckInterestedHint',
  deckDownloadTitle: 'landing.deckDownloadTitle',
  deckDownloadBody: 'landing.deckDownloadBody',
  cityPickerLabel: 'landing.cityPickerLabel',
  storyEyebrow: 'landing.storyEyebrow',
  storyTitle: 'landing.storyTitle',
  stickyCta: 'landing.stickyCta',
  contactLead: 'landing.contactLead',
  footerStamp: 'landing.footerStamp',
  footerHost: 'landing.footerHost',
  footerHostLink: 'landing.footerHostLink',
  footerNote: 'landing.footerNote',
  footerEmail: 'landing.footerEmail',
  footerPrivacy: 'landing.footerPrivacy',
  footerTerms: 'landing.footerTerms',
  skip: 'landing.skip',
});

export const JUSTGO_LANDING_STORY_KEYS = Object.freeze([
  'landing.story0',
  'landing.story1',
  'landing.story2',
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

function formatLandingTemplate(template, tokens) {
  let out = String(template);
  for (const [name, value] of Object.entries(tokens)) {
    out = out.split(`{${name}}`).join(value);
  }
  if (out.includes('{') || out.includes('}')) {
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

export default justGoLandingCopy;
