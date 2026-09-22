const {
  isCatalogCopyKey,
  isRemoteCopyKey,
} = require('../../utilities/pivotCopyCatalog');
const {
  NOTIFICATION_COPY_KEYS,
  WEEKLY_DROP_COPY_FALLBACKS,
  mergeWeeklyDropPushCopy,
  resolveWeeklyDropNotificationCopy,
  resolveRitualNotificationCopy,
  resolveDefinitionNotificationCopy,
  resolveNotificationCopyLine,
} = require('../../utilities/meridianJobCopyResolve');

describe('meridianJobCopyResolve', () => {
  it('catalogs notifications keys as remote overlay paths', () => {
    expect(isRemoteCopyKey(NOTIFICATION_COPY_KEYS.weeklyDrop.title)).toBe(true);
    expect(isRemoteCopyKey(NOTIFICATION_COPY_KEYS.weeklyDrop.body)).toBe(true);
    expect(isRemoteCopyKey(NOTIFICATION_COPY_KEYS.ritual.swipe.body)).toBe(true);
    expect(isRemoteCopyKey(NOTIFICATION_COPY_KEYS.ritual.quorum_waiting.body)).toBe(true);
    expect(isRemoteCopyKey(NOTIFICATION_COPY_KEYS.definition.title)).toBe(true);
    expect(isCatalogCopyKey(NOTIFICATION_COPY_KEYS.weeklyDrop.title)).toBe(true);
    expect(isCatalogCopyKey(NOTIFICATION_COPY_KEYS.definition.body)).toBe(true);
  });

  it('uses shipped catalog when the pack is empty', () => {
    const resolved = resolveWeeklyDropNotificationCopy({ entries: {}, tokens: {} });
    expect(resolved).toEqual({
      title: WEEKLY_DROP_COPY_FALLBACKS.title,
      body: WEEKLY_DROP_COPY_FALLBACKS.body,
      fromOverlay: false,
    });
  });

  it('formats overlay templates with shipped tokens; ICU breakage falls back', () => {
    expect(
      resolveNotificationCopyLine(
        NOTIFICATION_COPY_KEYS.weeklyDrop.body,
        {
          entries: {
            [NOTIFICATION_COPY_KEYS.weeklyDrop.body]: 'this week in {brand.name}',
          },
        },
        WEEKLY_DROP_COPY_FALLBACKS.body,
      ),
    ).toBe('this week in just go');

    expect(
      resolveNotificationCopyLine(
        NOTIFICATION_COPY_KEYS.weeklyDrop.body,
        {
          entries: {
            [NOTIFICATION_COPY_KEYS.weeklyDrop.body]: 'broken {missing}',
          },
        },
        WEEKLY_DROP_COPY_FALLBACKS.body,
      ),
    ).toBe(WEEKLY_DROP_COPY_FALLBACKS.body);
  });

  it('weekly drop precedence: send > week override > tenant > copy pack > bundled', () => {
    const pack = {
      entries: {
        [NOTIFICATION_COPY_KEYS.weeklyDrop.title]: 'pack title',
        [NOTIFICATION_COPY_KEYS.weeklyDrop.body]: 'pack body',
      },
    };

    expect(mergeWeeklyDropPushCopy({ pack })).toEqual({
      title: 'pack title',
      body: 'pack body',
      source: 'copy_pack',
    });

    expect(
      mergeWeeklyDropPushCopy({
        pack,
        tenantTitle: 'NYC drop',
        tenantBody: 'Swipe the week',
      }),
    ).toEqual({
      title: 'NYC drop',
      body: 'Swipe the week',
      source: 'tenant',
    });

    expect(
      mergeWeeklyDropPushCopy({
        pack,
        tenantTitle: 'NYC drop',
        tenantBody: 'Swipe the week',
        overrideTitle: 'W23 special',
        overrideBody: 'Only this week',
      }),
    ).toEqual({
      title: 'W23 special',
      body: 'Only this week',
      source: 'override',
    });

    expect(
      mergeWeeklyDropPushCopy({
        pack,
        tenantTitle: 'NYC drop',
        overrideTitle: 'W23 special',
        sendTitle: 'One-off',
        sendBody: 'Tonight only',
      }),
    ).toEqual({
      title: 'One-off',
      body: 'Tonight only',
      source: 'send',
    });
  });

  it('resolves ritual and definition templates from the pack', () => {
    const pack = {
      entries: {
        [NOTIFICATION_COPY_KEYS.ritual.swipe.body]:
          'finish swiping for your {group.plural}',
        [NOTIFICATION_COPY_KEYS.definition.body]: 'open {brand.name} tonight',
      },
      tokens: { 'group.plural': 'blocks' },
    };

    expect(resolveRitualNotificationCopy('swipe', pack).body).toBe(
      'finish swiping for your blocks',
    );
    expect(resolveDefinitionNotificationCopy({ pack }).body).toBe(
      'open just go tonight',
    );
    expect(resolveDefinitionNotificationCopy({ pack: { entries: {} } }).body).toBe(
      'open just go',
    );
  });
});
