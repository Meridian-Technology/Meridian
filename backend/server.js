const { createApp } = require('./app');
const { startDemoTenantJobs } = require('./jobs/demoTenantJobs');

const PORT = process.env.PORT || 5001;

const { server } = createApp();
startDemoTenantJobs();
server.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});
