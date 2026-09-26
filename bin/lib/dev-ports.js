const fs = require('fs');
const path = require('path');

const DEV_ENV_NAME = '.env.development.local';

function devEnvPath(meridianPath) {
  return path.join(meridianPath, 'frontend', DEV_ENV_NAME);
}

function parsePort(value, label) {
  if (!/^[0-9]+$/.test(String(value || ''))) {
    throw new Error(`${label} must be a port number`);
  }
  const port = Number(value);
  if (port < 1 || port > 65535) {
    throw new Error(`${label} must be between 1 and 65535`);
  }
  return port;
}

function readDevPorts(meridianPath) {
  const file = devEnvPath(meridianPath);
  if (!fs.existsSync(file)) {
    return { apiPort: null, webPort: null, file };
  }
  const text = fs.readFileSync(file, 'utf8');
  const api = text.match(/^MERIDIAN_API_PORT=(\d+)$/m);
  const web = text.match(/^PORT=(\d+)$/m);
  return {
    apiPort: api ? Number(api[1]) : null,
    webPort: web ? Number(web[1]) : null,
    file,
  };
}

function renderDevEnv({ apiPort, webPort }) {
  const lines = [
    '# Development only. Create React App ignores this file in production builds.',
    `MERIDIAN_API_PORT=${apiPort}`,
    `REACT_APP_API_URL=http://127.0.0.1:${apiPort}`,
  ];
  if (webPort) lines.push(`PORT=${webPort}`);
  lines.push('');
  return lines.join('\n');
}

function writeDevPorts(meridianPath, { apiPort, webPort }) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('refusing to write frontend ports when NODE_ENV=production');
  }
  const api = parsePort(apiPort, 'API port');
  const web = webPort == null || webPort === '' ? null : parsePort(webPort, 'Web port');
  const file = devEnvPath(meridianPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, renderDevEnv({ apiPort: api, webPort: web }));
  return { apiPort: api, webPort: web, file };
}

function clearDevPorts(meridianPath) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('refusing to write frontend ports when NODE_ENV=production');
  }
  const file = devEnvPath(meridianPath);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return { file };
}

module.exports = {
  DEV_ENV_NAME,
  devEnvPath,
  readDevPorts,
  writeDevPorts,
  clearDevPorts,
  renderDevEnv,
};
