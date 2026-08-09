jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
}));

jest.mock('../../services/pivotCrewWeekStateService', () => ({
  getPivotCrewWeekProgress: jest.fn(),
}));

jest.mock('../../services/pivotIntentService', () => ({
  getWeekRecap: jest.fn(),
}));

jest.mock('../../services/pivotCrewRitualEnrichment', () => ({
  loadCrewMemberSwipeMaps: jest.fn(),
}));

jest.mock('../../services/getModelService', () => jest.fn());

const { getTenantByKey } = require('../../services/tenantConfigService');
const { getPivotCrewWeekProgress } = require('../../services/pivotCrewWeekStateService');
const { getWeekRecap } = require('../../services/pivotIntentService');
const { loadCrewMemberSwipeMaps } = require('../../services/pivotCrewRitualEnrichment');
const getModels = require('../../services/getModelService');
const { getPivotWeekRitual } = require('../../services/pivotWeekRitualService');
const {
  BATCH_WEEK,
  DROP_LIVE_NOW,
  PIVOT_CREW_RITUAL_DRY_RUN_SCENARIOS,
} = require('../../utilities/pivotCrewRitualDryRunScenarios');

describe('pivot crew ritual dry run', () => {
  const req = { school: 'nyc', user: { userId: '507f191e810c19729de860eb' } };

  const nycTenant = {
    tenantKey: 'nyc',
    tenantType: 'pivot',
    pivotPilot: true,
    pivotDropTimezone: 'America/New_York',
    pivotDropDayOfWeek: 4,
    pivotDropHour: 18,
    pivotDropMinute: 0,
  };

  beforeEach(() => {
    getTenantByKey.mockReset();
    getPivotCrewWeekProgress.mockReset();
    getWeekRecap.mockReset();
    getModels.mockReset();
    loadCrewMemberSwipeMaps.mockReset();
    getTenantByKey.mockResolvedValue(nycTenant);
    getWeekRecap.mockResolvedValue({ data: { batchWeek: BATCH_WEEK, events: [], crewPicks: [] } });
  });

  it.each(PIVOT_CREW_RITUAL_DRY_RUN_SCENARIOS)('$id — $label', async (scenario) => {
    scenario.setup({
      getPivotCrewWeekProgress,
      loadCrewMemberSwipeMaps,
      getModels,
    });

    const result = await getPivotWeekRitual(req, {
      batchWeek: BATCH_WEEK,
      now: DROP_LIVE_NOW,
    });

    expect(result.error).toBeUndefined();
    scenario.assert(result);
  });
});
