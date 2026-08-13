import justGoCreatorCopy from '../justGoCreatorCopy';
import {
  CREATOR_PHASES,
  WORKSPACE_TAB_IDS,
  buildPublicEventUrl,
  formatTimeUntil,
  inferCreatorPhase,
  prettifyTagSlug,
  resolvePhaseRail,
  resolveWorkspaceNav,
} from './workspaceUtils';

const NOW = new Date('2026-06-15T12:00:00.000Z');

function listing(overrides = {}) {
  return {
    _id: 'evt-1',
    ingestStatus: 'published',
    start_time: '2026-06-20T19:00:00.000Z',
    end_time: '2026-06-20T22:00:00.000Z',
    ...overrides,
  };
}

describe('inferCreatorPhase', () => {
  it('puts a draft in Drafting regardless of its date', () => {
    expect(inferCreatorPhase(listing({ ingestStatus: 'draft' }), NOW)).toBe(
      CREATOR_PHASES.DRAFTING,
    );
    expect(
      inferCreatorPhase(
        listing({
          ingestStatus: 'draft',
          start_time: '2026-01-01T19:00:00.000Z',
          end_time: '2026-01-01T22:00:00.000Z',
        }),
        NOW,
      ),
    ).toBe(CREATOR_PHASES.DRAFTING);
  });

  it('puts a staged listing in Planning', () => {
    expect(inferCreatorPhase(listing({ ingestStatus: 'staged' }), NOW)).toBe(
      CREATOR_PHASES.PLANNING,
    );
  });

  it('puts a published future listing in Planning', () => {
    expect(inferCreatorPhase(listing(), NOW)).toBe(CREATOR_PHASES.PLANNING);
  });

  it('puts a published listing inside its window in Run of Show', () => {
    const during = new Date('2026-06-20T20:00:00.000Z');

    expect(inferCreatorPhase(listing(), during)).toBe(CREATOR_PHASES.RUN_OF_SHOW);
  });

  it('does not enter Run of Show for a staged listing inside its window', () => {
    const during = new Date('2026-06-20T20:00:00.000Z');

    expect(inferCreatorPhase(listing({ ingestStatus: 'staged' }), during)).toBe(
      CREATOR_PHASES.PLANNING,
    );
  });

  it('moves past the end into Post Mortem', () => {
    const after = new Date('2026-06-21T02:00:00.000Z');

    expect(inferCreatorPhase(listing(), after)).toBe(CREATOR_PHASES.POST_MORTEM);
  });

  it('falls back to the start time when there is no end', () => {
    const after = new Date('2026-06-20T20:00:00.000Z');

    expect(inferCreatorPhase(listing({ end_time: null }), after)).toBe(
      CREATOR_PHASES.POST_MORTEM,
    );
  });

  it('treats a missing listing as a draft', () => {
    expect(inferCreatorPhase(null, NOW)).toBe(CREATOR_PHASES.DRAFTING);
  });
});

describe('resolvePhaseRail', () => {
  it('marks earlier phases complete, the current one current, and the rest upcoming', () => {
    const rail = resolvePhaseRail(CREATOR_PHASES.RUN_OF_SHOW);

    expect(rail.map((step) => step.state)).toEqual([
      'complete',
      'complete',
      'current',
      'upcoming',
    ]);
    expect(rail.map((step) => step.label)).toEqual([
      'Drafting',
      'Planning',
      'Run of Show',
      'Post Mortem',
    ]);
  });

  it('has nothing complete in the first phase', () => {
    const rail = resolvePhaseRail(CREATOR_PHASES.DRAFTING);

    expect(rail.map((step) => step.state)).toEqual([
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
  });

  it('marks everything upcoming for an unknown phase', () => {
    expect(resolvePhaseRail('nonsense').every((step) => step.state === 'upcoming')).toBe(true);
  });
});

describe('resolveWorkspaceNav', () => {
  it('hides Promo and Communications while drafting', () => {
    const { visibleTabs } = resolveWorkspaceNav(CREATOR_PHASES.DRAFTING);
    const ids = visibleTabs.map((tab) => tab.id);

    expect(ids).not.toContain(WORKSPACE_TAB_IDS.PROMO);
    expect(ids).not.toContain(WORKSPACE_TAB_IDS.COMMUNICATIONS);
    expect(ids).toContain(WORKSPACE_TAB_IDS.OVERVIEW);
    expect(ids).toContain(WORKSPACE_TAB_IDS.DETAILS);
  });

  it('exposes the full v0 tab set once planning starts', () => {
    const ids = resolveWorkspaceNav(CREATOR_PHASES.PLANNING).visibleTabs.map((tab) => tab.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        WORKSPACE_TAB_IDS.OVERVIEW,
        WORKSPACE_TAB_IDS.DETAILS,
        WORKSPACE_TAB_IDS.INSIGHTS,
        WORKSPACE_TAB_IDS.INTERESTS,
        WORKSPACE_TAB_IDS.COMMUNICATIONS,
        WORKSPACE_TAB_IDS.PROMO,
      ]),
    );
  });

  it('drops Promo again after the event is over', () => {
    const ids = resolveWorkspaceNav(CREATOR_PHASES.POST_MORTEM).visibleTabs.map((tab) => tab.id);

    expect(ids).not.toContain(WORKSPACE_TAB_IDS.PROMO);
    expect(ids).toContain(WORKSPACE_TAB_IDS.INSIGHTS);
  });

  it('labels every section and tab from the copy bank', () => {
    const { sections } = resolveWorkspaceNav(CREATOR_PHASES.PLANNING);

    expect(sections.length).toBeGreaterThan(0);
    sections.forEach((section) => {
      expect(typeof section.label).toBe('string');
      expect(section.label).not.toBe('');
      expect(section.tabs.length).toBeGreaterThan(0);
      section.tabs.forEach((tab) => {
        expect(justGoCreatorCopy.workspace.tabs[tab.id]).toBe(tab.label);
      });
    });
  });

  it('never renders an empty section', () => {
    Object.values(CREATOR_PHASES).forEach((phase) => {
      resolveWorkspaceNav(phase).sections.forEach((section) => {
        expect(section.tabs.length).toBeGreaterThan(0);
      });
    });
  });

  it('lists each tab at most once per phase', () => {
    Object.values(CREATOR_PHASES).forEach((phase) => {
      const ids = resolveWorkspaceNav(phase).sections.flatMap((section) =>
        section.tabs.map((tab) => tab.id),
      );
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});

describe('buildPublicEventUrl', () => {
  it('composes the public listing page from the current origin', () => {
    expect(buildPublicEventUrl('evt-1', 'https://brooklyn.meridian.study')).toBe(
      'https://brooklyn.meridian.study/event/evt-1',
    );
  });

  it('returns null without an id', () => {
    expect(buildPublicEventUrl(null, 'https://brooklyn.meridian.study')).toBeNull();
  });
});

describe('formatTimeUntil', () => {
  it('counts down in minutes, hours, then days', () => {
    expect(formatTimeUntil('2026-06-15T12:30:00.000Z', NOW)).toBe('30 min');
    expect(formatTimeUntil('2026-06-15T17:00:00.000Z', NOW)).toBe('5 hr');
    expect(formatTimeUntil('2026-06-18T12:00:00.000Z', NOW)).toBe('3 days');
    expect(formatTimeUntil('2026-06-16T12:00:00.000Z', NOW)).toBe('1 day');
  });

  it('reports an already-started event as underway', () => {
    expect(formatTimeUntil('2026-06-15T11:00:00.000Z', NOW)).toBe(
      justGoCreatorCopy.workspace.timeUntil.started,
    );
  });

  it('returns null without a usable start', () => {
    expect(formatTimeUntil(null, NOW)).toBeNull();
    expect(formatTimeUntil('not-a-date', NOW)).toBeNull();
  });
});

describe('prettifyTagSlug', () => {
  it('turns a catalog slug back into its label wording', () => {
    expect(prettifyTagSlug('live-music')).toBe('live music');
    expect(prettifyTagSlug(undefined)).toBe('');
  });
});
