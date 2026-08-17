/**
 * Consumer marketing page — Just Go voice only.
 * Lowercase, action-first, no Atlas / Meridian / ClubDash language.
 */

const justGoLandingCopy = Object.freeze({
  productName: 'just go',
  wordmarkAlt: 'just go',
  documentTitle: 'just go — this week in your city',
  metaDescription:
    "stop planning. swipe what's on in your city this week. just go.",
  ticker: "no plans? just go — see what's on in your city this week",
  headlineLead: 'what are you',
  headlinePop: 'doing this week?',
  subhead: 'stop planning. swipe this week’s drop.',
  cta: 'get just go',
  ctaAriaIos: 'download just go on the app store',
  ctaAriaAndroid: 'get just go on google play',
  storeEyebrow: 'scan to install',
  citiesEyebrow: 'live in',
  citiesLoading: 'loading cities',
  citiesEmpty: "just go isn’t live in your area yet — check back soon",
  flyersEyebrow: 'this kind of week',
  flyersTitle: 'the drop looks like this',
  flyersBody: 'a new week, a new deck. swipe the nights that pull.',
  deckEyebrow: 'this week’s drop',
  deckTitle: 'swipe what’s on',
  deckBody: 'four nights from this week’s drop.',
  deckEmpty: "this week’s drop is still cooking — get the app",
  deckLoading: 'loading this week’s drop',
  deckHint: 'left to pass · right to save',
  deckPass: 'pass',
  deckInterested: 'interested',
  deckDownloadTitle: 'the rest is in the app',
  deckDownloadBody: 'the full week, and the people going. get just go.',
  cityPickerLabel: 'your city',
  loopEyebrow: 'the whole app',
  loop: Object.freeze([
    Object.freeze({
      chip: 'swipe first',
      body: 'see what’s on this week. no calendar tetris.',
    }),
    Object.freeze({
      chip: 'save what pulls',
      body: 'keep the nights that feel right. that’s your week.',
    }),
    Object.freeze({
      chip: 'just go',
      body: 'thursday drop. your city. your people. go.',
    }),
  ]),
  stampLabel: 'this week',
  stickyCta: 'get just go',
  footerHost: 'hosting?',
  footerHostLink: 'put a night in the drop',
  footerNote: 'questions or a night we missed —',
  footerEmail: 'raven@meridian.study',
  footerPrivacy: 'privacy',
  footerTerms: 'terms',
  skip: 'skip to drop',
});

export const JUSTGO_IOS_STORE_URL =
  process.env.REACT_APP_JUSTGO_IOS_STORE_URL ||
  'https://apps.apple.com/us/app/meridian-go/id6755217537';

export const JUSTGO_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=app.justgo';

export const JUSTGO_LANDING_PATH = '/justgo';

export default justGoLandingCopy;
