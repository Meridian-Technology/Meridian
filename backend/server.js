const { createApp } = require('./app');
const { startPivotCrewWeekStateScheduler } = require('./services/pivotCrewWeekStateScheduler');
const { sweepPendingAutoApplyComputeJobs } = require('./services/pivotComputeAutoApplyService');
const {
  startMeridianJobWorkerLoop,
  stopMeridianJobWorkerLoop,
} = require('./services/meridianJobWorkerLoop');

process.once('SIGTERM', () => stopMeridianJobWorkerLoop());
process.once('SIGINT', () => stopMeridianJobWorkerLoop());

const PORT = process.env.MERIDIAN_API_PORT || process.env.PORT || 5001;

const { server } = createApp();
server.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
  startPivotCrewWeekStateScheduler();
  if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_MERIDIAN_JOB_WORKER !== 'true') {
    startMeridianJobWorkerLoop();
  }
  if (process.env.NODE_ENV !== 'test') {
    sweepPendingAutoApplyComputeJobs().catch((error) => {
      console.error('[pivotComputeAutoApply] startup sweep failed', error);
    });
  }
});
