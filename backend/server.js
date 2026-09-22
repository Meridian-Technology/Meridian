const { createApp } = require('./app');
const { startPivotCrewWeekStateScheduler } = require('./services/pivotCrewWeekStateScheduler');
const { startPivotCrewNudgeScheduler } = require('./services/pivotCrewNudgeScheduler');
const { sweepPendingAutoApplyComputeJobs } = require('./services/pivotComputeAutoApplyService');

const PORT = process.env.PORT || 5001;

const { server } = createApp();
server.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
  startPivotCrewWeekStateScheduler();
  startPivotCrewNudgeScheduler();
  if (process.env.NODE_ENV !== 'test') {
    sweepPendingAutoApplyComputeJobs().catch((error) => {
      console.error('[pivotComputeAutoApply] startup sweep failed', error);
    });
  }
});
