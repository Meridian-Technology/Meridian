const {
  buildPreheader,
  buildWeeklyReportHtml,
  buildWeeklyReportText,
} = require('../../services/pivotWeeklyReportEmail');
const { scenarios } = require('../../examples/weeklyReportFixtures');

describe('pivotWeeklyReportEmail', () => {
  it('previews actives, their mix, and how the drop landed', () => {
    const week = { startDate: '2026-09-24', accounting: { active: 41, new: 9, resurrected: 4, retained: 28, churned: 7 } };
    expect(buildPreheader({ ...week, weeklyActive: 41, weeklyActivePrevious: 35 }))
      .toBe('41 weekly actives, up 6. 9 new, 4 back, 7 lost.');
    expect(buildPreheader({ ...week, weeklyActive: 41, weeklyActivePrevious: 35, batch: { swipes: 200, right: 56 } }))
      .toBe('41 weekly actives, up 6. 9 new, 4 back, 7 lost. 28% of swipes went right.');
    expect(buildPreheader({ startDate: '2026-09-24', weeklyActive: 1, weeklyActivePrevious: null })).toBe('1 weekly active.');
    expect(buildPreheader({ startDate: null, weeklyActive: null })).toBe('No drop week has finished yet.');
  });

  it('shows the change in actives under the number, not as a headline', () => {
    const html = buildWeeklyReportHtml(scenarios.pilot);
    expect(html).toContain('up 6 from last week');
    expect(html).not.toMatch(/font-size:28px[^>]*>up 6/);
  });

  it('reports how the drop landed', () => {
    const html = buildWeeklyReportHtml(scenarios.growing);
    expect(html).toContain('how the drop landed');
    expect(html).toContain('8,104 of 28,940');
    expect(html).toContain('28% · −1 pts');
    expect(html).toContain('Governors Ball Afterparty');
    expect(html).toContain('Timeshare Info Brunch');
    expect(html).toContain('4.2 / 5');
    const governorsBall = scenarios.growing.batch.top[0];
    expect(html).toContain(`<a href="${governorsBall.url}"`);
    expect(buildWeeklyReportText(scenarios.growing))
      .toContain(`Carried the week:\n- Governors Ball Afterparty (412 of 690) ${governorsBall.url}`);
  });

  it('puts where actives came from above how the drop landed', () => {
    const html = buildWeeklyReportHtml(scenarios.pilot);
    expect(html.indexOf('where they came from')).toBeLessThan(html.indexOf('how the drop landed'));
  });

  it('renders every preview scenario as complete email HTML and text', () => {
    Object.entries(scenarios).forEach(([name, report]) => {
      const html = buildWeeklyReportHtml(report);
      expect(html.startsWith('<!doctype html>')).toBe(true);
      expect(html).toContain('wordmark-1298.png');
      expect(html).toContain(report.preheader);
      expect(html).not.toMatch(/undefined|NaN/);
      expect(buildWeeklyReportText(report)).not.toMatch(/undefined|NaN/);
      if (name === 'first-week') {
        expect(html).not.toContain('do new people stick');
        expect(html).not.toContain('landing page');
        expect(html).not.toContain('how the drop landed');
      }
    });
  });

  it('leads with counts for small samples', () => {
    const html = buildWeeklyReportHtml(scenarios.pilot);
    expect(html).toContain('9 of 15');
    expect(html).toContain('60% · small sample');
    expect(buildWeeklyReportHtml(scenarios.growing)).not.toContain('small sample');
    expect(html).toContain('Launched cities only. Not counted yet: New York City.');
  });
});
