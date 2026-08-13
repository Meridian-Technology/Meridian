import {
  DEMO_PRIMARY_EVENT_ID,
  buildDemoListingResponse,
  buildDemoListingsResponse,
  isDemoEventId,
} from './justGoCreatorDemoData';
import { buildIntentFunnel, totalViewCount } from '../workspace/insightsUtils';
import { CREATOR_PHASES, inferCreatorPhase, resolveWorkspaceNav } from '../workspace/workspaceUtils';

const NOW = new Date('2026-08-09T18:30:00.000Z');

describe('demo listings response', () => {
  it('matches the list endpoint shape', () => {
    const response = buildDemoListingsResponse(NOW);

    expect(response.data.tenantKey).toBe('nyc');
    expect(response.data.events.length).toBeGreaterThan(1);
    response.data.events.forEach((event) => {
      expect(typeof event._id).toBe('string');
      expect(typeof event.name).toBe('string');
      expect(event.source).toBe('justgo');
      expect(event.platformManaged).toBe(false);
      expect(event.batchWeek).toMatch(/^\d{4}-W\d{2}$/);
      expect(event.intentStats).toEqual(
        expect.objectContaining({
          interested: expect.any(Number),
          registered: expect.any(Number),
          externalOpenUsers: expect.any(Number),
        }),
      );
    });
  });

  it('covers every lifecycle phase so the rail and tab gating can be reviewed', () => {
    const phases = buildDemoListingsResponse(NOW).data.events.map((event) =>
      inferCreatorPhase(event, NOW),
    );

    expect(new Set(phases)).toEqual(
      new Set([
        CREATOR_PHASES.DRAFTING,
        CREATOR_PHASES.PLANNING,
        CREATOR_PHASES.RUN_OF_SHOW,
        CREATOR_PHASES.POST_MORTEM,
      ]),
    );
  });
});

describe('demo listing detail', () => {
  it('matches the detail endpoint shape', () => {
    const { data } = buildDemoListingResponse(DEMO_PRIMARY_EVENT_ID, NOW);

    expect(data.event._id).toBe(DEMO_PRIMARY_EVENT_ID);
    expect(data.stats.intents).toEqual(
      expect.objectContaining({
        interested: expect.any(Number),
        registered: expect.any(Number),
        passed: expect.any(Number),
        externalOpens: expect.any(Number),
        externalOpenUsers: expect.any(Number),
      }),
    );
    expect(data.stats.analytics).toEqual(
      expect.objectContaining({
        views: expect.any(Number),
        uniqueViews: expect.any(Number),
        anonymousViews: expect.any(Number),
        uniqueAnonymousViews: expect.any(Number),
        registrations: expect.any(Number),
        uniqueRegistrations: expect.any(Number),
      }),
    );
  });

  it('returns a 14-day UTC series ending today, matching buildDailyWindow', () => {
    const { daily } = buildDemoListingResponse(DEMO_PRIMARY_EVENT_ID, NOW).data.stats;

    expect(daily).toHaveLength(14);
    expect(daily[0].date).toBe('2026-07-27');
    expect(daily[13].date).toBe('2026-08-09');
    daily.forEach((day) => {
      expect(day).toEqual(
        expect.objectContaining({
          date: expect.any(String),
          views: expect.any(Number),
          interested: expect.any(Number),
          registered: expect.any(Number),
        }),
      );
    });
  });

  it('is deterministic, so reloading does not reshuffle the charts', () => {
    const first = buildDemoListingResponse(DEMO_PRIMARY_EVENT_ID, NOW);
    const second = buildDemoListingResponse(DEMO_PRIMARY_EVENT_ID, NOW);

    expect(second).toEqual(first);
  });

  it('unknown ids resolve to null so real ids still hit the API', () => {
    expect(buildDemoListingResponse('66b0f1f2c9a1b2c3d4e5f6a7', NOW)).toBeNull();
    expect(isDemoEventId('66b0f1f2c9a1b2c3d4e5f6a7')).toBe(false);
    expect(isDemoEventId(DEMO_PRIMARY_EVENT_ID)).toBe(true);
  });
});

describe('internal coherence', () => {
  it('keeps all-time aggregates at or above the 14-day window sums', () => {
    const { stats } = buildDemoListingResponse(DEMO_PRIMARY_EVENT_ID, NOW).data;
    const windowRegistered = stats.daily.reduce((total, day) => total + day.registered, 0);

    expect(stats.intents.registered).toBeGreaterThanOrEqual(windowRegistered);
    expect(stats.analytics.views).toBeGreaterThanOrEqual(
      stats.daily.reduce((total, day) => total + day.views, 0),
    );
  });

  it('produces a monotonic funnel, so the Insights bars read top to bottom', () => {
    const { stats } = buildDemoListingResponse(DEMO_PRIMARY_EVENT_ID, NOW).data;
    const values = buildIntentFunnel(stats).map((step) => step.value);

    expect(values[0]).toBeGreaterThan(0);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeLessThanOrEqual(values[index - 1]);
    }
  });

  it('gives the primary demo listing enough signal to populate every tab', () => {
    const { event, stats } = buildDemoListingResponse(DEMO_PRIMARY_EVENT_ID, NOW).data;
    const { visibleTabs } = resolveWorkspaceNav(inferCreatorPhase(event, NOW));

    expect(visibleTabs).toHaveLength(6);
    expect(totalViewCount(stats.analytics)).toBeGreaterThan(100);
    expect(stats.intents.interested).toBeGreaterThan(0);
    expect(stats.daily.some((day) => day.views > 0)).toBe(true);
  });

  it('leaves the unpublished draft with no audience data', () => {
    const { event, stats } = buildDemoListingResponse('demo-draft', NOW).data;

    expect(event.ingestStatus).toBe('draft');
    expect(totalViewCount(stats.analytics)).toBe(0);
    expect(stats.intents.interested).toBe(0);
    expect(stats.daily.every((day) => day.views === 0)).toBe(true);
  });
});
