const {
  defaultNotificationRules,
  rulesFromLegacyTriggerConfig,
  resolveNotificationRules,
  evaluateRuleGroups,
  validateRules,
} = require('../../utilities/meridianNotificationRules');

describe('meridian notification rules', () => {
  it('matches a group only when every condition matches, and any group can match', () => {
    const rules = [
      {
        outcome: 'send',
        conditions: [
          { attribute: 'quorumMet', operator: 'is', value: false },
          { attribute: 'unfinishedSwiperCount', operator: 'gte', value: 1 },
        ],
      },
      {
        outcome: 'send',
        conditions: [
          { attribute: 'hoursSinceWeeklyDrop', operator: 'gte', value: 12 },
        ],
      },
    ];

    expect(evaluateRuleGroups({
      quorumMet: false,
      unfinishedSwiperCount: 0,
      hoursSinceWeeklyDrop: 1,
    }, rules)).toEqual([]);

    expect(evaluateRuleGroups({
      quorumMet: false,
      unfinishedSwiperCount: 2,
      hoursSinceWeeklyDrop: 1,
    }, rules)).toEqual(['send']);

    expect(evaluateRuleGroups({
      quorumMet: true,
      unfinishedSwiperCount: 0,
      hoursSinceWeeklyDrop: 20,
    }, rules)).toEqual(['send']);
  });

  it('sends nothing when who-rules are empty', () => {
    expect(evaluateRuleGroups({ hasCrew: false }, [])).toEqual([]);
  });

  it('rejects an attribute the notification type cannot compute', () => {
    const invalid = validateRules('solo_swipe_reminder', [{
      outcome: 'send',
      conditions: [{ attribute: 'judgementStatus', operator: 'is', value: 'deciding' }],
    }]);
    expect(invalid.error).toMatch(/unknown attribute/);
  });

  it('migrates each current definition from triggerConfig flags', () => {
    expect(rulesFromLegacyTriggerConfig('solo_swipe_reminder', { scan: 'solo_unfinished_deck' }))
      .toEqual(defaultNotificationRules('solo_swipe_reminder'));

    const soloOptOut = rulesFromLegacyTriggerConfig('solo_swipe_reminder', { requireNoCrew: false });
    expect(soloOptOut[0].conditions.map((condition) => condition.attribute)).toEqual([
      'deckComplete',
      'alreadyNotifiedThisBatchWeek',
    ]);

    expect(rulesFromLegacyTriggerConfig('ritual_crew_scan', {
      scan: 'unfinished_swipe_and_consensus_pending',
    })).toEqual(defaultNotificationRules('ritual_crew_scan'));

    expect(rulesFromLegacyTriggerConfig('ritual_crew_scan', { nudgeUnfinishedSwipes: false }))
      .toEqual([]);

    expect(rulesFromLegacyTriggerConfig('ritual_crew_consensus', {}))
      .toEqual(defaultNotificationRules('ritual_crew_consensus'));

    expect(resolveNotificationRules('ritual_crew_scan', {
      rules: [
        ...defaultNotificationRules('ritual_crew_scan'),
        {
          outcome: 'consensus',
          conditions: [{ attribute: 'judgementStatus', operator: 'is', value: 'deciding' }],
        },
      ],
    }).rules).toEqual(defaultNotificationRules('ritual_crew_scan'));

    expect(rulesFromLegacyTriggerConfig('event_discovery', {
      on: 'catalog_publish',
      debounce: 'user_day',
    })).toEqual([{
      outcome: 'send',
      conditions: [{
        attribute: 'hoursSinceLastDiscoveryPush',
        operator: 'gte',
        value: 24,
      }],
    }]);
  });

  it('keeps stored rules and migrates only when rules were never saved', () => {
    const stored = [{ outcome: 'send', conditions: [{ attribute: 'hasCrew', operator: 'is', value: true }] }];
    expect(resolveNotificationRules('solo_swipe_reminder', { rules: stored, triggerConfig: {} }).migrated)
      .toBe(false);
    expect(resolveNotificationRules('solo_swipe_reminder', { triggerConfig: { requireNoCrew: false } }).migrated)
      .toBe(true);
    expect(resolveNotificationRules('weekly_drop', {}).rules).toEqual([]);
  });
});
