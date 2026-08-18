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

export const JUSTGO_IOS_STORE_URL =
  process.env.REACT_APP_JUSTGO_IOS_STORE_URL ||
  'https://apps.apple.com/us/app/meridian-go/id6755217537';

export const JUSTGO_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=app.justgo';

export const JUSTGO_LANDING_PATH = '/justgo';

export default justGoLandingCopy;
