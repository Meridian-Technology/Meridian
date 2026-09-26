const { createApp } = require('./app');
const { startPivotCrewWeekStateScheduler } = require('./services/pivotCrewWeekStateScheduler');
const { sweepPendingAutoApplyComputeJobs } = require('./services/pivotComputeAutoApplyService');
const {
  startMeridianJobWorkerLoop,
  stopMeridianJobWorkerLoop,
} = require('./services/meridianJobWorkerLoop');

process.once('SIGTERM', () => stopMeridianJobWorkerLoop());
process.once('SIGINT', () => stopMeridianJobWorkerLoop());

// Dev and preview may override the listen port. Production must bind the platform PORT.
const PORT = process.env.NODE_ENV === 'production'
  ? (process.env.PORT || 5001)
  : (process.env.MERIDIAN_API_PORT || process.env.PORT || 5001);

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
