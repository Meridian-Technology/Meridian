import { describeSchedule } from './notificationDefinitionCron';

export const SCHEDULE_HANDLER_LABELS = Object.freeze({
  weekly_drop: 'Weekly drop',
  ritual_crew_scan: 'Crew swipe nudge',
  ritual_crew_consensus: 'Crew confirm nudge',
  solo_swipe_reminder: 'Solo swipe reminder',
  event_discovery: 'New events',
  admin_weekly_report: 'Admin weekly report',
  scheduled_push: 'Scheduled push',
});

export const SCHEDULE_PURPOSES = Object.freeze({
  weekly_drop: 'Tells everyone this week’s drop is live.',
  ritual_crew_scan: 'Nudges crew members who still have cards to swipe.',
  ritual_crew_consensus: 'Asks crew members who have not confirmed the plan.',
  solo_swipe_reminder: 'Reminds people without a crew to finish their deck.',
  event_discovery: 'Tells people about newly published events.',
  admin_weekly_report: 'Emails the Just Go weekly report to every platform admin.',
});

const ATTRIBUTE_LABELS = Object.freeze({
  hasCrew: 'Has a crew',
  deckComplete: 'Deck complete',
  unfinishedCardCount: 'Unfinished cards',
  alreadyNotifiedThisBatchWeek: 'Already notified this week',
  quorumMet: 'Quorum met',
  activeMemberCount: 'Active members',
  unfinishedSwiperCount: 'Unfinished swipers',
  hoursSinceWeeklyDrop: 'Hours since weekly drop',
  judgementStatus: 'Judgement status',
  pastConsensusMidpoint: 'Past consensus midpoint',
  hoursSinceLastDiscoveryPush: 'Hours since last new-events push',
});

const OPERATOR_LABELS = Object.freeze({
  is: 'is',
  gt: 'is greater than',
  lt: 'is less than',
  gte: 'is at least',
  lte: 'is at most',
  one_of: 'is one of',
});

function formatRuleValue(value) {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  if (Array.isArray(value)) return value.join(', ');
  return String(value ?? '');
}

function describeRuleGroup(group) {
  return (group?.conditions || []).map((condition, index) => {
    const label = ATTRIBUTE_LABELS[condition.attribute] || condition.attribute;
    const operator = OPERATOR_LABELS[condition.operator] || condition.operator;
    const phrase = `${label} ${operator} ${formatRuleValue(condition.value)}`;
    return index === 0 ? phrase : `and ${phrase}`;
  }).join(' ');
}

export function schedulePurpose(definition) {
  const handler = definition?.handlerKey || '';
  if (handler === 'scheduled_push') {
    return definition?.copyBodyFallback
      ? `Sends “${definition.copyBodyFallback}”`
      : 'Sends a push with its own message.';
  }
  return SCHEDULE_PURPOSES[handler] || 'Sends the notification on this schedule.';
}

export function describeWhoRules(rules) {
  if (!Array.isArray(rules) || !rules.length) return '';
  const groups = rules.map(describeRuleGroup).filter(Boolean);
  if (!groups.length) return '';
  if (groups.length === 1) return `Sends when ${groups[0]}.`;
  return `Sends when ${groups.join(', or when ')}.`;
}

export function scheduleName(definition) {
  const handler = definition?.handlerKey || '';
  if (handler === 'scheduled_push' && definition?.definitionKey) return definition.definitionKey;
  return SCHEDULE_HANDLER_LABELS[handler] || definition?.definitionKey || handler || 'Schedule';
}

// Scheduled runs name their schedule; direct sends (e.g. a manual weekly drop) don't.
export function runBelongsToSchedule(definition, run) {
  if (!definition?.handlerKey || run?.type !== definition.handlerKey) return false;
  if (run?.payload?.oneTime) return false;
  const runDefinition = run?.payload?.definitionKey;
  return !runDefinition || !definition.definitionKey || runDefinition === definition.definitionKey;
}

export function scheduleCadence(definition) {
  const cadence = describeSchedule(definition?.scheduleCron);
  const scope = definition?.tenantKey ? null : 'all cities';
  return scope ? `${cadence} · ${scope}` : cadence;
}

export function lastRunForSchedule(definition, runs = []) {
  const tenant = definition?.tenantKey
    ? String(definition.tenantKey).trim().toLowerCase()
    : '';
  return runs.find((run) => {
    if (!runBelongsToSchedule(definition, run)) return false;
    if (!tenant) return true;
    return String(run.tenantKey || '').trim().toLowerCase() === tenant;
  }) || null;
}

export function sortSchedules(definitions = [], runs = []) {
  return [...definitions].sort((left, right) => {
    const leftFailed = lastRunForSchedule(left, runs)?.status === 'failed' ? 0 : 1;
    const rightFailed = lastRunForSchedule(right, runs)?.status === 'failed' ? 0 : 1;
    if (leftFailed !== rightFailed) return leftFailed - rightFailed;
    const leftPaused = left?.enabled === false ? 1 : 0;
    const rightPaused = right?.enabled === false ? 1 : 0;
    if (leftPaused !== rightPaused) return leftPaused - rightPaused;
    return scheduleName(left).localeCompare(scheduleName(right));
  });
}
