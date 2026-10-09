const { createHash } = require('crypto');
const {
  CAROUSEL_COMPOSE_LIMITS,
  COVER_ASSET_PROVIDERS,
  MAGAZINE_FORMATS,
} = require('./pivotAdminComputeJobContract');

/**
 * Per-editorial-account policy for the carousel composition job.
 *
 * Three things are kept deliberately apart:
 *
 * - `confirmed` is what the pipeline actually enforces. Every value here is
 *   effective immediately.
 * - `proposed` carries the subset of those values that are a Relay default
 *   rather than a decision a human made. Shipping a working default is not the
 *   same as the user having chosen it, and the agent, the editor UI and the
 *   rollout checklist all need to be able to tell the difference.
 * - `openChoices` is the human-readable checklist an admin has to work through
 *   before a production schedule may be enabled.
 *
 * Hard limits that are not negotiable per account — the fourteen-day
 * publication-relative horizon and the prohibition on one-event issues — are
 * enforced in code below, not only described to a prompt.
 */

/** Curation can never reach further than this from the proposed publication time. */
const MAX_PUBLICATION_HORIZON_DAYS = 14;
/** A retrospective can never reach further back than this. */
const MAX_RETROSPECTIVE_DAYS = 14;
/** No issue is ever a single event, whatever an account is configured to allow. */
const ABSOLUTE_MIN_EVENTS = 2;
const ABSOLUTE_MAX_EVENTS = CAROUSEL_COMPOSE_LIMITS.maxEventSlides;

const COVER_VARIATION_PREFERENCES = Object.freeze(['prefer-different', 'none']);

/**
 * Effective defaults. Automation is off, posting is manual, paid fallback is
 * refused, and browsing is unavailable until someone turns each one on.
 */
const CONFIRMED_DEFAULTS = Object.freeze({
  minEvents: 3,
  maxEvents: 5,
  twoEventExceptionEnabled: false,
  horizonDays: MAX_PUBLICATION_HORIZON_DAYS,
  retrospectiveDays: 7,
  allowSingleCityRetrospective: true,
  sameDayAllowed: true,
  weeklyTargetEnabled: true,
  targetCadenceDays: 7,
  minSpacingDays: 5,
  silenceAlertDays: 14,
  preferredPublicationSlot: Object.freeze({ weekday: 1, hour: 18, minute: 0 }),
  offHoursWindow: Object.freeze({ startHour: 1, endHour: 5 }),
  coverAssetProviders: Object.freeze(['event-poster', 'unsplash']),
  eventSlideAssetProviders: Object.freeze(['event-poster']),
  coverVariationPreference: 'prefer-different',
  allowCrossMagazineReuse: true,
  withinAccountEventCooldownDays: 30,
  closingSlideEnabled: false,
  browsingEnabled: false,
  manualPostingOnly: true,
  schedulingEnabled: false,
  paidFallbackEnabled: false,
  maxRepairPasses: 2,
  maxSchemaRepairAttempts: 2,
  maxAttempts: 3,
  captionPolicy: Object.freeze({
    maxCharacters: 1200,
    maxHashtags: 5,
    maxEmoji: 3,
    requireCallToAction: true,
  }),
  reviewOwner: null,
  notes: Object.freeze([]),
});

/**
 * Keys whose default value above is a proposal awaiting an explicit decision.
 * Everything else in CONFIRMED_DEFAULTS reflects a decision the user already
 * made in the editorial brief.
 */
const PROPOSED_KEYS = Object.freeze([
  'retrospectiveDays',
  'allowSingleCityRetrospective',
  'twoEventExceptionEnabled',
  'silenceAlertDays',
  'minSpacingDays',
  'preferredPublicationSlot',
  'offHoursWindow',
  'withinAccountEventCooldownDays',
  'eventSlideAssetProviders',
  'browsingEnabled',
  'captionPolicy',
  'reviewOwner',
]);

const OPEN_CHOICES = Object.freeze([
  Object.freeze({
    key: 'retrospectiveWindow',
    question: 'How far back may Sorry You Missed It reach, and may it extend to fourteen days?',
    defaultApplied: 'rolling 7 days, expandable to 14',
    options: Object.freeze(['7 days', 'up to 14 days']),
  }),
  Object.freeze({
    key: 'singleCityRetrospective',
    question: 'May the strongest retrospective angle come from a single city in the global catalog?',
    defaultApplied: 'allowed',
    options: Object.freeze(['allowed', 'multi-city only']),
  }),
  Object.freeze({
    key: 'twoEventException',
    question: 'May an exceptional two-event issue run with a written explanation?',
    defaultApplied: 'disabled; three events minimum',
    options: Object.freeze(['disabled', 'allowed with explanation']),
  }),
  Object.freeze({
    key: 'silenceAlert',
    question: 'After how many days without a post should an editorial alert be raised?',
    defaultApplied: '14 days, alert only; never a quality relaxation',
  }),
  Object.freeze({
    key: 'authorizedBrowsing',
    question: 'May the agent use authorized organizer/web/social lookups for enrichment and cancellation checks?',
    defaultApplied: 'disabled; catalog and authorized asset data only',
    options: Object.freeze(['disabled', 'enabled with recorded sources']),
  }),
  Object.freeze({
    key: 'captionConventions',
    question: 'What hashtag, emoji, length and call-to-action conventions should captions follow?',
    defaultApplied: 'restrained: <=1200 chars, <=5 hashtags, <=3 emoji, short CTA',
  }),
  Object.freeze({
    key: 'eventSlideAssets',
    question: 'May event slides substitute a non-poster image when the poster is weak?',
    defaultApplied: 'existing event posters only',
    options: Object.freeze(['posters only', 'posters or Unsplash']),
  }),
  Object.freeze({
    key: 'offHoursWindow',
    question: 'Which local off-hours window and timezone should each account run in?',
    defaultApplied: '01:00-05:00 account local time',
  }),
  Object.freeze({
    key: 'reviewOwner',
    question: 'Who reviews generated unapproved drafts for this account?',
    defaultApplied: 'unassigned',
  }),
  Object.freeze({
    key: 'withinAccountCooldown',
    question: 'How long before the same event may appear again on this account?',
    defaultApplied: '30 days',
  }),
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isIanaTimezone(value) {
  return typeof value === 'string'
    && /^[A-Za-z][A-Za-z0-9+_-]*(?:\/[A-Za-z0-9+_-]+){0,2}$/.test(value)
    && value.length <= 64;
}

function integerInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Policy versions are content addresses. The agent, the stored decision record
 * and the apply check all compare the same string, so a policy edit during an
 * in-flight job is visible rather than silently applied.
 */
function computePolicyVersion(settings, accountId = '') {
  const digest = createHash('sha256')
    .update(`${accountId}:${stableStringify(settings)}`)
    .digest('hex')
    .slice(0, 32);
  return `pol:carousel.${digest}`;
}

function validateCaptionPolicy(raw, errors, trail) {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    errors.push(`${trail} must be an object`);
    return undefined;
  }
  const allowed = ['maxCharacters', 'maxHashtags', 'maxEmoji', 'requireCallToAction'];
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) errors.push(`${trail}.${key} is not a caption policy field`);
  }
  const caption = { ...CONFIRMED_DEFAULTS.captionPolicy, ...raw };
  if (!integerInRange(caption.maxCharacters, 40, 2200)) errors.push(`${trail}.maxCharacters must be 40-2200`);
  if (!integerInRange(caption.maxHashtags, 0, 30)) errors.push(`${trail}.maxHashtags must be 0-30`);
  if (!integerInRange(caption.maxEmoji, 0, 10)) errors.push(`${trail}.maxEmoji must be 0-10`);
  if (typeof caption.requireCallToAction !== 'boolean') errors.push(`${trail}.requireCallToAction must be a boolean`);
  return caption;
}

function validateSlot(raw, errors, trail) {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    errors.push(`${trail} must be an object`);
    return undefined;
  }
  const slot = { ...CONFIRMED_DEFAULTS.preferredPublicationSlot, ...raw };
  for (const key of Object.keys(raw)) {
    if (!['weekday', 'hour', 'minute'].includes(key)) errors.push(`${trail}.${key} is not a slot field`);
  }
  if (!integerInRange(slot.weekday, 0, 6)) errors.push(`${trail}.weekday must be 0-6`);
  if (!integerInRange(slot.hour, 0, 23)) errors.push(`${trail}.hour must be 0-23`);
  if (!integerInRange(slot.minute, 0, 59)) errors.push(`${trail}.minute must be 0-59`);
  return slot;
}

function validateOffHours(raw, errors, trail) {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    errors.push(`${trail} must be an object`);
    return undefined;
  }
  const window = { ...CONFIRMED_DEFAULTS.offHoursWindow, ...raw };
  for (const key of Object.keys(raw)) {
    if (!['startHour', 'endHour'].includes(key)) errors.push(`${trail}.${key} is not an off-hours field`);
  }
  if (!integerInRange(window.startHour, 0, 23)) errors.push(`${trail}.startHour must be 0-23`);
  if (!integerInRange(window.endHour, 0, 23)) errors.push(`${trail}.endHour must be 0-23`);
  return window;
}

function validateProviders(raw, errors, trail) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > COVER_ASSET_PROVIDERS.length) {
    errors.push(`${trail} must list 1-${COVER_ASSET_PROVIDERS.length} asset providers`);
    return undefined;
  }
  const unknown = raw.find((provider) => !COVER_ASSET_PROVIDERS.includes(provider));
  if (unknown) errors.push(`${trail} contains unsupported provider ${unknown}`);
  if (new Set(raw).size !== raw.length) errors.push(`${trail} must not repeat a provider`);
  return [...raw];
}

/**
 * Builds the effective policy for one editorial account. Unknown keys are
 * rejected rather than ignored: a misspelled setting that silently keeps the
 * default is the kind of mistake that only shows up in a published issue.
 */
function normalizeEditorialPolicy(input = {}) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { valid: false, errors: ['policy must be an object'] };
  }

  const accountId = typeof input.accountId === 'string' ? input.accountId : '';
  if (accountId && !/^[0-9a-f]{24}$/.test(accountId)) errors.push('accountId must be a 24-character hex id');

  const format = input.format ?? 'city-picks';
  if (!MAGAZINE_FORMATS.includes(format)) {
    errors.push(`format must be one of ${MAGAZINE_FORMATS.join(', ')}`);
  }

  const sourceTenantKeys = input.sourceTenantKeys ?? [];
  if (!Array.isArray(sourceTenantKeys)
    || sourceTenantKeys.length < 1
    || sourceTenantKeys.length > CAROUSEL_COMPOSE_LIMITS.maxSourceTenants) {
    errors.push(`sourceTenantKeys must list 1-${CAROUSEL_COMPOSE_LIMITS.maxSourceTenants} tenants`);
  } else if (sourceTenantKeys.some((key) => !/^[a-z0-9][a-z0-9-]{0,62}$/.test(key))) {
    errors.push('sourceTenantKeys must be lowercase tenant slugs');
  }

  const timezone = input.timezone ?? 'UTC';
  if (!isIanaTimezone(timezone)) errors.push('timezone must be an IANA timezone name');

  const overrides = input.settings ?? {};
  if (!isPlainObject(overrides)) {
    return { valid: false, errors: [...errors, 'settings must be an object'] };
  }
  const known = Object.keys(CONFIRMED_DEFAULTS);
  for (const key of Object.keys(overrides)) {
    if (!known.includes(key)) errors.push(`settings.${key} is not a known editorial policy setting`);
  }

  const settings = { ...clone(CONFIRMED_DEFAULTS), ...clone(overrides) };
  if (overrides.captionPolicy !== undefined) {
    settings.captionPolicy = validateCaptionPolicy(overrides.captionPolicy, errors, 'settings.captionPolicy')
      ?? clone(CONFIRMED_DEFAULTS.captionPolicy);
  }
  if (overrides.preferredPublicationSlot !== undefined) {
    settings.preferredPublicationSlot = validateSlot(overrides.preferredPublicationSlot, errors, 'settings.preferredPublicationSlot')
      ?? clone(CONFIRMED_DEFAULTS.preferredPublicationSlot);
  }
  if (overrides.offHoursWindow !== undefined) {
    settings.offHoursWindow = validateOffHours(overrides.offHoursWindow, errors, 'settings.offHoursWindow')
      ?? clone(CONFIRMED_DEFAULTS.offHoursWindow);
  }
  if (overrides.coverAssetProviders !== undefined) {
    settings.coverAssetProviders = validateProviders(overrides.coverAssetProviders, errors, 'settings.coverAssetProviders')
      ?? clone(CONFIRMED_DEFAULTS.coverAssetProviders);
  }
  if (overrides.eventSlideAssetProviders !== undefined) {
    settings.eventSlideAssetProviders = validateProviders(overrides.eventSlideAssetProviders, errors, 'settings.eventSlideAssetProviders')
      ?? clone(CONFIRMED_DEFAULTS.eventSlideAssetProviders);
  }

  if (!integerInRange(settings.minEvents, ABSOLUTE_MIN_EVENTS, ABSOLUTE_MAX_EVENTS)) {
    errors.push(`settings.minEvents must be ${ABSOLUTE_MIN_EVENTS}-${ABSOLUTE_MAX_EVENTS}; single-event issues are never allowed`);
  }
  if (!integerInRange(settings.maxEvents, ABSOLUTE_MIN_EVENTS, ABSOLUTE_MAX_EVENTS)) {
    errors.push(`settings.maxEvents must be ${ABSOLUTE_MIN_EVENTS}-${ABSOLUTE_MAX_EVENTS}`);
  }
  if (Number.isInteger(settings.minEvents) && Number.isInteger(settings.maxEvents)
    && settings.minEvents > settings.maxEvents) {
    errors.push('settings.minEvents must not exceed settings.maxEvents');
  }
  if (!integerInRange(settings.horizonDays, 1, MAX_PUBLICATION_HORIZON_DAYS)) {
    errors.push(`settings.horizonDays must be 1-${MAX_PUBLICATION_HORIZON_DAYS}`);
  }
  if (!integerInRange(settings.retrospectiveDays, 1, MAX_RETROSPECTIVE_DAYS)) {
    errors.push(`settings.retrospectiveDays must be 1-${MAX_RETROSPECTIVE_DAYS}`);
  }
  if (!integerInRange(settings.targetCadenceDays, 1, 60)) errors.push('settings.targetCadenceDays must be 1-60');
  if (!integerInRange(settings.minSpacingDays, 0, 60)) errors.push('settings.minSpacingDays must be 0-60');
  if (!integerInRange(settings.silenceAlertDays, 1, 120)) errors.push('settings.silenceAlertDays must be 1-120');
  if (!integerInRange(settings.withinAccountEventCooldownDays, 0, 365)) {
    errors.push('settings.withinAccountEventCooldownDays must be 0-365');
  }
  if (!integerInRange(settings.maxRepairPasses, 0, CAROUSEL_COMPOSE_LIMITS.maxRepairPasses)) {
    errors.push(`settings.maxRepairPasses must be 0-${CAROUSEL_COMPOSE_LIMITS.maxRepairPasses}`);
  }
  if (!integerInRange(settings.maxSchemaRepairAttempts, 0, 5)) errors.push('settings.maxSchemaRepairAttempts must be 0-5');
  if (!integerInRange(settings.maxAttempts, 1, 10)) errors.push('settings.maxAttempts must be 1-10');
  if (!COVER_VARIATION_PREFERENCES.includes(settings.coverVariationPreference)) {
    errors.push(`settings.coverVariationPreference must be one of ${COVER_VARIATION_PREFERENCES.join(', ')}`);
  }
  for (const key of [
    'twoEventExceptionEnabled',
    'allowSingleCityRetrospective',
    'sameDayAllowed',
    'weeklyTargetEnabled',
    'allowCrossMagazineReuse',
    'closingSlideEnabled',
    'browsingEnabled',
    'manualPostingOnly',
    'schedulingEnabled',
    'paidFallbackEnabled',
  ]) {
    if (typeof settings[key] !== 'boolean') errors.push(`settings.${key} must be a boolean`);
  }
  if (settings.reviewOwner != null && (typeof settings.reviewOwner !== 'string' || settings.reviewOwner.length > 256)) {
    errors.push('settings.reviewOwner must be a string of at most 256 characters or null');
  }
  if (!Array.isArray(settings.notes) || settings.notes.length > 20) {
    errors.push('settings.notes must be an array of at most 20 strings');
  }

  // Posting stays manual and paid execution stays refused until the user says
  // otherwise. Neither is something a per-account override should be able to
  // flip on quietly while this feature is still being built.
  if (settings.manualPostingOnly !== true) {
    errors.push('settings.manualPostingOnly cannot be disabled: posting is a human action');
  }
  if (settings.paidFallbackEnabled !== false) {
    errors.push('settings.paidFallbackEnabled cannot be enabled: paid API fallback is out of scope');
  }

  if (errors.length) return { valid: false, errors };

  const confirmed = settings;
  const proposed = Object.fromEntries(
    PROPOSED_KEYS
      .filter((key) => overrides[key] === undefined)
      .map((key) => [key, clone(confirmed[key])]),
  );
  const openChoices = OPEN_CHOICES.map((choice) => clone(choice));

  return {
    valid: true,
    policy: {
      accountId: accountId || null,
      format,
      sourceTenantKeys: [...sourceTenantKeys],
      timezone,
      policyVersion: computePolicyVersion(confirmed, accountId),
      confirmed,
      proposed,
      openChoices,
    },
  };
}

function toMillis(value) {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The publication-relative temporal rule, in code.
 *
 * Curation looks forward from the proposed publication time: same-day is fine,
 * already-started is not actionable, and fourteen days is the hard ceiling no
 * account configuration can raise. A retrospective looks backward over the
 * configured window and refuses anything that has not finished yet.
 */
function checkEventEligibility({
  format,
  policy,
  eventStart,
  eventEnd = null,
  publicationAt,
  cancelled = false,
}) {
  const settings = policy?.confirmed ?? policy ?? {};
  const start = toMillis(eventStart);
  const end = eventEnd == null ? null : toMillis(eventEnd);
  const publication = toMillis(publicationAt);
  if (start == null || publication == null) {
    return { eligible: false, code: 'INVALID_TIME', message: 'Event or publication time is not a valid timestamp' };
  }
  if (cancelled) {
    return { eligible: false, code: 'EVENT_CANCELLED', message: 'Event is cancelled' };
  }

  if (format === 'sorry-you-missed-it') {
    const windowDays = Math.min(settings.retrospectiveDays ?? 7, MAX_RETROSPECTIVE_DAYS);
    const finished = end ?? start;
    if (finished >= publication) {
      return {
        eligible: false,
        code: 'EVENT_NOT_PAST',
        message: 'A retrospective issue cannot include an event that has not finished by publication',
      };
    }
    if (publication - finished > windowDays * DAY_MS) {
      return {
        eligible: false,
        code: 'OUTSIDE_RETROSPECTIVE_WINDOW',
        message: `Event finished more than ${windowDays} days before publication`,
      };
    }
    return { eligible: true };
  }

  const horizonDays = Math.min(settings.horizonDays ?? MAX_PUBLICATION_HORIZON_DAYS, MAX_PUBLICATION_HORIZON_DAYS);
  const latestUsable = end ?? start;
  if (latestUsable < publication) {
    return {
      eligible: false,
      code: 'EVENT_ALREADY_PASSED',
      message: 'Event is over by the proposed publication time and is no longer actionable',
    };
  }
  if (start - publication > horizonDays * DAY_MS) {
    return {
      eligible: false,
      code: 'BEYOND_PUBLICATION_HORIZON',
      message: `Event starts more than ${horizonDays} days after the proposed publication time`,
    };
  }
  if (settings.sameDayAllowed === false && start - publication < DAY_MS) {
    return {
      eligible: false,
      code: 'SAME_DAY_NOT_ALLOWED',
      message: 'Same-day events are not allowed for this account',
    };
  }
  return { eligible: true };
}

/**
 * Selection-count policy. Three to five is the target; two needs an explicitly
 * enabled exception and a written explanation; one is never allowed.
 */
function checkSelectionCount(count, policy, { exceptionReason = null } = {}) {
  const settings = policy?.confirmed ?? policy ?? {};
  const errors = [];
  if (!Number.isInteger(count) || count < ABSOLUTE_MIN_EVENTS) {
    errors.push('An issue needs at least two events; single-event issues are not allowed');
    return { valid: false, errors };
  }
  const minEvents = settings.minEvents ?? CONFIRMED_DEFAULTS.minEvents;
  const maxEvents = settings.maxEvents ?? CONFIRMED_DEFAULTS.maxEvents;
  if (count > maxEvents) {
    errors.push(`An issue may contain at most ${maxEvents} events`);
  }
  if (count < minEvents) {
    if (count === 2 && settings.twoEventExceptionEnabled) {
      if (!exceptionReason || String(exceptionReason).trim().length < 10) {
        errors.push('A two-event issue requires a written explanation for admin review');
      }
    } else {
      errors.push(`An issue needs at least ${minEvents} events`);
    }
  }
  return errors.length ? { valid: false, errors } : { valid: true };
}

/**
 * Policy-level checks for a compose proposal. The contract module already
 * rejected structurally impossible results; this answers whether this account
 * would accept the editorial decision.
 */
function validateComposeProposalAgainstPolicy(result, policy) {
  const errors = [];
  const settings = policy?.confirmed ?? {};
  const proposal = result?.proposal ?? null;
  const disposition = result?.decision?.disposition;

  if (result?.decision?.basedOnPolicyVersion
    && policy?.policyVersion
    && result.decision.basedOnPolicyVersion !== policy.policyVersion) {
    errors.push('decision.basedOnPolicyVersion is stale for this account');
  }

  if (!proposal) {
    if (disposition === 'ready-for-review') errors.push('A ready-for-review decision requires a proposal');
    return errors.length ? { valid: false, errors } : { valid: true };
  }

  const count = proposal.eventSlides.length;
  const selection = checkSelectionCount(count, policy, {
    exceptionReason: proposal.cover?.repeatReason ?? result?.decision?.briefReasons?.[0] ?? null,
  });
  if (!selection.valid) errors.push(...selection.errors);

  const coverProviders = settings.coverAssetProviders ?? CONFIRMED_DEFAULTS.coverAssetProviders;
  if (!coverProviders.includes(proposal.cover?.asset?.provider)) {
    errors.push(`Cover images must come from: ${coverProviders.join(', ')}`);
  }
  const slideProviders = settings.eventSlideAssetProviders ?? CONFIRMED_DEFAULTS.eventSlideAssetProviders;
  const strayProvider = proposal.eventSlides
    .map((slide) => slide.asset?.provider)
    .find((provider) => !slideProviders.includes(provider));
  if (strayProvider) {
    errors.push(`Event slide images must come from: ${slideProviders.join(', ')}`);
  }

  if (settings.closingSlideEnabled === false && proposal.closingSlide) {
    errors.push('Closing slides are not enabled for this account');
  }

  const caption = settings.captionPolicy ?? CONFIRMED_DEFAULTS.captionPolicy;
  if (typeof proposal.socialCaption === 'string' && proposal.socialCaption.length > caption.maxCharacters) {
    errors.push(`Social caption exceeds ${caption.maxCharacters} characters`);
  }
  const hashtags = (proposal.socialCaption?.match(/#[^\s#]+/g) || []).length;
  if (hashtags > caption.maxHashtags) {
    errors.push(`Social caption uses ${hashtags} hashtags; this account allows ${caption.maxHashtags}`);
  }

  return errors.length ? { valid: false, errors } : { valid: true };
}

/**
 * Which open choices this account has not answered yet. A key disappears from
 * the list once the account configures it explicitly, which is what moves it
 * out of `proposed`.
 */
const OPEN_CHOICE_SETTING_KEYS = Object.freeze({
  retrospectiveWindow: 'retrospectiveDays',
  singleCityRetrospective: 'allowSingleCityRetrospective',
  twoEventException: 'twoEventExceptionEnabled',
  silenceAlert: 'silenceAlertDays',
  authorizedBrowsing: 'browsingEnabled',
  captionConventions: 'captionPolicy',
  eventSlideAssets: 'eventSlideAssetProviders',
  offHoursWindow: 'offHoursWindow',
  reviewOwner: 'reviewOwner',
  withinAccountCooldown: 'withinAccountEventCooldownDays',
});

function unresolvedPolicyChoices(policy) {
  const proposed = policy?.proposed ?? {};
  return OPEN_CHOICES
    .filter((choice) => {
      const settingKey = OPEN_CHOICE_SETTING_KEYS[choice.key];
      if (!settingKey) return true;
      if (settingKey === 'reviewOwner') return policy?.confirmed?.reviewOwner == null;
      return Object.prototype.hasOwnProperty.call(proposed, settingKey);
    })
    .map((choice) => clone(choice));
}

function canEnableSchedule(policy) {
  const blockers = [];
  if (policy?.confirmed?.schedulingEnabled !== true) blockers.push('schedulingEnabled is off');
  if (policy?.confirmed?.reviewOwner == null) blockers.push('no review owner is assigned');
  if (Object.keys(policy?.proposed ?? {}).length) {
    blockers.push(`unconfirmed proposals remain: ${Object.keys(policy.proposed).sort().join(', ')}`);
  }
  return { allowed: blockers.length === 0, blockers };
}

module.exports = {
  MAX_PUBLICATION_HORIZON_DAYS,
  MAX_RETROSPECTIVE_DAYS,
  ABSOLUTE_MIN_EVENTS,
  ABSOLUTE_MAX_EVENTS,
  COVER_VARIATION_PREFERENCES,
  CONFIRMED_DEFAULTS,
  PROPOSED_KEYS,
  OPEN_CHOICES,
  OPEN_CHOICE_SETTING_KEYS,
  computePolicyVersion,
  normalizeEditorialPolicy,
  checkEventEligibility,
  checkSelectionCount,
  validateComposeProposalAgainstPolicy,
  unresolvedPolicyChoices,
  canEnableSchedule,
};
