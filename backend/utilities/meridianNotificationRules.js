const { PIVOT_CREW_JUDGEMENT_STATUSES } = require('../schemas/pivotCrewWeekState');

const SOLO_SWIPE_REMINDER = 'solo_swipe_reminder';
const RITUAL_CREW_SCAN = 'ritual_crew_scan';
const RITUAL_CREW_CONSENSUS = 'ritual_crew_consensus';
const EVENT_DISCOVERY = 'event_discovery';

const DEFAULT_CREW_MIN_ACTIVE_MEMBERS = 2;
const DEFAULT_UNFINISHED_SWIPE_HOURS = 12;
const DEFAULT_DISCOVERY_DEBOUNCE_HOURS = 24;

const OPERATORS = Object.freeze({
  boolean: Object.freeze([
    Object.freeze({ key: 'is', label: 'is' }),
  ]),
  number: Object.freeze([
    Object.freeze({ key: 'is', label: 'is' }),
    Object.freeze({ key: 'gt', label: 'is greater than' }),
    Object.freeze({ key: 'lt', label: 'is less than' }),
    Object.freeze({ key: 'gte', label: 'is at least' }),
    Object.freeze({ key: 'lte', label: 'is at most' }),
  ]),
  enum: Object.freeze([
    Object.freeze({ key: 'is', label: 'is' }),
    Object.freeze({ key: 'one_of', label: 'is one of' }),
  ]),
});

const JUDGEMENT_OPTIONS = Object.freeze(
  PIVOT_CREW_JUDGEMENT_STATUSES.map((value) => Object.freeze({ value, label: value })),
);

function attribute(key, label, type, options = null) {
  return Object.freeze({
    key,
    label,
    type,
    ...(options ? { options } : {}),
  });
}

const CATALOG = Object.freeze({
  [SOLO_SWIPE_REMINDER]: Object.freeze({
    outcomes: Object.freeze(['send']),
    attributes: Object.freeze([
      attribute('hasCrew', 'Has a crew', 'boolean'),
      attribute('deckComplete', 'Deck complete', 'boolean'),
      attribute('unfinishedCardCount', 'Unfinished cards', 'number'),
      attribute('alreadyNotifiedThisBatchWeek', 'Already notified this week', 'boolean'),
    ]),
  }),
  [RITUAL_CREW_SCAN]: Object.freeze({
    outcomes: Object.freeze(['send']),
    attributes: Object.freeze([
      attribute('quorumMet', 'Quorum met', 'boolean'),
      attribute('activeMemberCount', 'Active members', 'number'),
      attribute('unfinishedSwiperCount', 'Unfinished swipers', 'number'),
      attribute('hoursSinceWeeklyDrop', 'Hours since weekly drop', 'number'),
      attribute('alreadyNotifiedThisBatchWeek', 'Already notified this week', 'boolean'),
    ]),
  }),
  [RITUAL_CREW_CONSENSUS]: Object.freeze({
    outcomes: Object.freeze(['send']),
    attributes: Object.freeze([
      attribute('judgementStatus', 'Judgement status', 'enum', JUDGEMENT_OPTIONS),
      attribute('pastConsensusMidpoint', 'Past consensus midpoint', 'boolean'),
      attribute('alreadyNotifiedThisBatchWeek', 'Already notified this week', 'boolean'),
    ]),
  }),
  [EVENT_DISCOVERY]: Object.freeze({
    outcomes: Object.freeze(['send']),
    attributes: Object.freeze([
      attribute('hoursSinceLastDiscoveryPush', 'Hours since last new-events push', 'number'),
    ]),
  }),
});

function cloneRules(rules) {
  return JSON.parse(JSON.stringify(rules));
}

function catalogFor(handlerKey) {
  return CATALOG[String(handlerKey || '').trim()] || null;
}

function operatorsForType(type) {
  return OPERATORS[type] || [];
}

function defaultNotificationRules(handlerKey) {
  const key = String(handlerKey || '').trim();
  if (key === SOLO_SWIPE_REMINDER) {
    return [{
      outcome: 'send',
      conditions: [
        { attribute: 'hasCrew', operator: 'is', value: false },
        { attribute: 'deckComplete', operator: 'is', value: false },
        { attribute: 'alreadyNotifiedThisBatchWeek', operator: 'is', value: false },
      ],
    }];
  }
  if (key === RITUAL_CREW_SCAN) {
    return [{
      outcome: 'send',
      conditions: [
        { attribute: 'quorumMet', operator: 'is', value: false },
        { attribute: 'activeMemberCount', operator: 'gte', value: DEFAULT_CREW_MIN_ACTIVE_MEMBERS },
        { attribute: 'unfinishedSwiperCount', operator: 'gte', value: 1 },
        { attribute: 'hoursSinceWeeklyDrop', operator: 'gte', value: DEFAULT_UNFINISHED_SWIPE_HOURS },
        { attribute: 'alreadyNotifiedThisBatchWeek', operator: 'is', value: false },
      ],
    }];
  }
  if (key === RITUAL_CREW_CONSENSUS) {
    return [{
      outcome: 'send',
      conditions: [
        { attribute: 'judgementStatus', operator: 'is', value: 'deciding' },
        { attribute: 'pastConsensusMidpoint', operator: 'is', value: true },
        { attribute: 'alreadyNotifiedThisBatchWeek', operator: 'is', value: false },
      ],
    }];
  }
  if (key === EVENT_DISCOVERY) {
    return [{
      outcome: 'send',
      conditions: [
        {
          attribute: 'hoursSinceLastDiscoveryPush',
          operator: 'gte',
          value: DEFAULT_DISCOVERY_DEBOUNCE_HOURS,
        },
      ],
    }];
  }
  return [];
}

function withoutAttribute(conditions, attributeKey) {
  return conditions.filter((condition) => condition.attribute !== attributeKey);
}

/**
 * Legacy triggerConfig flags become who-rules. Omitted flags keep today's defaults.
 * Quiet hours and discovery `on` stay on triggerConfig.
 */
function rulesFromLegacyTriggerConfig(handlerKey, triggerConfig = {}) {
  const config = triggerConfig && typeof triggerConfig === 'object' && !Array.isArray(triggerConfig)
    ? triggerConfig
    : {};
  const key = String(handlerKey || '').trim();
  if (key === SOLO_SWIPE_REMINDER) {
    let conditions = defaultNotificationRules(key)[0].conditions;
    if (config.requireNoCrew === false) conditions = withoutAttribute(conditions, 'hasCrew');
    if (config.requireIncompleteDeck === false) conditions = withoutAttribute(conditions, 'deckComplete');
    if (config.oncePerBatchWeek === false) {
      conditions = withoutAttribute(conditions, 'alreadyNotifiedThisBatchWeek');
    }
    return conditions.length ? [{ outcome: 'send', conditions }] : [];
  }
  if (key === RITUAL_CREW_SCAN) {
    if (config.nudgeUnfinishedSwipes === false) return [];
    const [swipe] = defaultNotificationRules(key);
    const conditions = config.oncePerCrewPerWeek === false
      ? withoutAttribute(swipe.conditions, 'alreadyNotifiedThisBatchWeek')
      : swipe.conditions;
    return [{ outcome: 'send', conditions }];
  }
  if (key === RITUAL_CREW_CONSENSUS) {
    if (config.nudgeConsensus === false) return [];
    return defaultNotificationRules(key);
  }
  if (key === EVENT_DISCOVERY) return defaultNotificationRules(key);
  return [];
}

function groupBelongsToHandler(handlerKey, outcome) {
  if (handlerKey === RITUAL_CREW_SCAN && outcome === 'consensus') return false;
  if (handlerKey === RITUAL_CREW_CONSENSUS && outcome === 'unfinished_swipe') return false;
  return true;
}

function normalizeStoredRules(handlerKey, rules) {
  const spec = catalogFor(handlerKey);
  if (!spec || !Array.isArray(rules)) return [];
  const allowed = new Set(spec.attributes.map((row) => row.key));
  return rules.flatMap((group) => {
    const outcome = group?.outcome || 'send';
    if (!groupBelongsToHandler(handlerKey, outcome)) return [];
    const conditions = (Array.isArray(group?.conditions) ? group.conditions : [])
      .filter((condition) => allowed.has(condition?.attribute));
    if (!conditions.length) return [];
    return [{ outcome: 'send', conditions }];
  });
}

function resolveNotificationRules(handlerKey, source = {}) {
  if (Array.isArray(source?.rules)) {
    return { rules: normalizeStoredRules(handlerKey, source.rules), migrated: false };
  }
  return {
    rules: rulesFromLegacyTriggerConfig(handlerKey, source?.triggerConfig),
    migrated: true,
  };
}

function rulesReference(rules, attributeKey) {
  return (Array.isArray(rules) ? rules : []).some((group) => (
    Array.isArray(group?.conditions)
    && group.conditions.some((condition) => condition.attribute === attributeKey)
  ));
}

function conditionMatches(facts, condition) {
  if (!facts || !Object.prototype.hasOwnProperty.call(facts, condition.attribute)) return false;
  const actual = facts[condition.attribute];
  const expected = condition.value;
  if (condition.operator === 'is') return actual === expected;
  if (condition.operator === 'one_of') {
    return Array.isArray(expected) && expected.includes(actual);
  }
  if (typeof actual !== 'number' || Number.isNaN(actual)) return false;
  if (condition.operator === 'gt') return actual > expected;
  if (condition.operator === 'lt') return actual < expected;
  if (condition.operator === 'gte') return actual >= expected;
  if (condition.operator === 'lte') return actual <= expected;
  return false;
}

function evaluateRuleGroups(facts, groups) {
  if (!Array.isArray(groups) || groups.length === 0) return [];
  const matched = [];
  for (const group of groups) {
    const conditions = Array.isArray(group?.conditions) ? group.conditions : [];
    if (!conditions.length) continue;
    if (conditions.every((condition) => conditionMatches(facts, condition))) {
      matched.push(group.outcome || 'send');
    }
  }
  return matched;
}

function notificationRuleCatalog(handlerKey) {
  const key = String(handlerKey || '').trim();
  const spec = catalogFor(key);
  return {
    handlerKey: key,
    attributes: spec ? spec.attributes.map((row) => ({ ...row, options: row.options ? [...row.options] : undefined })) : [],
    operators: {
      boolean: OPERATORS.boolean.map((row) => ({ ...row })),
      number: OPERATORS.number.map((row) => ({ ...row })),
      enum: OPERATORS.enum.map((row) => ({ ...row })),
    },
    outcomes: spec ? [...spec.outcomes] : ['send'],
    defaultRules: defaultNotificationRules(key),
  };
}

function normalizeConditionValue(attributeDef, operator, value) {
  if (attributeDef.type === 'boolean') {
    if (value === true || value === false) return { value };
    return { error: `${attributeDef.key} must be true or false` };
  }
  if (attributeDef.type === 'number') {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) return { error: `${attributeDef.key} must be a number` };
    return { value: number };
  }
  const allowed = new Set((attributeDef.options || []).map((option) => option.value));
  if (operator === 'one_of') {
    const list = Array.isArray(value) ? value : [value];
    const picked = list.map((entry) => String(entry || '').trim()).filter(Boolean);
    if (!picked.length || picked.some((entry) => !allowed.has(entry))) {
      return { error: `${attributeDef.key} must be one of the listed values` };
    }
    return { value: picked };
  }
  const picked = String(value || '').trim();
  if (!allowed.has(picked)) return { error: `${attributeDef.key} must be one of the listed values` };
  return { value: picked };
}

function validateRules(handlerKey, rules) {
  const key = String(handlerKey || '').trim();
  if (!Array.isArray(rules)) return { error: 'rules must be an array' };
  if (rules.length > 8) return { error: 'rules cannot have more than 8 groups' };
  const spec = catalogFor(key);
  if (!spec) {
    if (rules.length === 0) return { rules: [] };
    return { error: `${key || 'handler'} has no who-rules` };
  }
  const attributes = new Map(spec.attributes.map((row) => [row.key, row]));
  const outcomes = new Set(spec.outcomes);
  const normalized = [];
  for (const group of rules) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      return { error: 'each rule group must be an object' };
    }
    const rawOutcome = group.outcome || 'send';
    if (!['send', 'unfinished_swipe', 'consensus'].includes(rawOutcome)) {
      return { error: `unknown outcome ${rawOutcome}` };
    }
    if (!groupBelongsToHandler(key, rawOutcome)) continue;
    const outcome = 'send';
    if (!outcomes.has(outcome)) return { error: `unknown outcome ${outcome}` };
    const conditions = Array.isArray(group.conditions) ? group.conditions : null;
    if (!conditions || !conditions.length) return { error: 'each rule group needs a condition' };
    if (conditions.length > 12) return { error: 'a rule group cannot have more than 12 conditions' };
    const nextConditions = [];
    for (const condition of conditions) {
      const attributeDef = attributes.get(condition?.attribute);
      if (!attributeDef) return { error: `unknown attribute ${condition?.attribute || ''}` };
      const operatorDef = operatorsForType(attributeDef.type).find((row) => row.key === condition.operator);
      if (!operatorDef) return { error: `invalid operator for ${attributeDef.key}` };
      const value = normalizeConditionValue(attributeDef, condition.operator, condition.value);
      if (value.error) return { error: value.error };
      nextConditions.push({
        attribute: attributeDef.key,
        operator: condition.operator,
        value: value.value,
      });
    }
    normalized.push({ outcome, conditions: nextConditions });
  }
  return { rules: normalized };
}

module.exports = {
  SOLO_SWIPE_REMINDER,
  RITUAL_CREW_SCAN,
  RITUAL_CREW_CONSENSUS,
  EVENT_DISCOVERY,
  DEFAULT_CREW_MIN_ACTIVE_MEMBERS,
  DEFAULT_UNFINISHED_SWIPE_HOURS,
  DEFAULT_DISCOVERY_DEBOUNCE_HOURS,
  defaultNotificationRules,
  rulesFromLegacyTriggerConfig,
  resolveNotificationRules,
  rulesReference,
  evaluateRuleGroups,
  validateRules,
  notificationRuleCatalog,
};
