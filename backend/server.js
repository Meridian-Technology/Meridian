const { createApp } = require('./app');
const { startPivotCrewWeekStateScheduler } = require('./services/pivotCrewWeekStateScheduler');
const { startPivotCrewNudgeScheduler } = require('./services/pivotCrewNudgeScheduler');

const PORT = process.env.PORT || 5001;

const { server } = createApp();
server.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
  startPivotCrewWeekStateScheduler();
  startPivotCrewNudgeScheduler();
});
