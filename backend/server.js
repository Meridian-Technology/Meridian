const { createApp } = require('./app');

const PORT = process.env.PORT || 5001;

const { server } = createApp();
server.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});
