/**
 * Mobile analytics event names behind the journey funnel and path explorer.
 * Those two views still read analytics_events; journey KPIs come from domain records.
 */

/** Plan aliases → real mobile analytics event names (MVP Task 4.2). */
const FUNNEL_STEP_ALIASES = {
  deck_open: 'pivot_card_view',
  card_view: 'pivot_card_view',
  card_interested: 'pivot_card_interested',
  interested: 'pivot_card_interested',
  external_open: 'pivot_external_open',
  registered: 'pivot_confirm_registered',
  confirm_registered: 'pivot_confirm_registered',
};

const DEFAULT_FUNNEL_STEPS = [
  'deck_open',
  'card_interested',
  'external_open',
  'registered',
];

const PIVOT_ANALYTICS_EVENTS = [
  'pivot_card_view',
  'pivot_card_pass',
  'pivot_card_interested',
  'pivot_external_open',
  'pivot_confirm_registered',
  'pivot_feedback_submit',
  'pivot_calendar_add',
  'pivot_invite_share',
  'pivot_invite_copy',
];

module.exports = {
  FUNNEL_STEP_ALIASES,
  DEFAULT_FUNNEL_STEPS,
  PIVOT_ANALYTICS_EVENTS,
};
