/**
 * Events-Backend schemas are symlinked under backend/events. When Node loads
 * them, bare imports (e.g. mongoose) resolve from Events-Backend/, not
 * backend/node_modules. Prepend backend/node_modules via NODE_PATH before
 * requiring getModelService or ../events/schemas/*.
 */
const path = require('path');
const Module = require('module');

const backendNodeModules = path.resolve(__dirname, '..', 'node_modules');
const existing = process.env.NODE_PATH
  ? process.env.NODE_PATH.split(path.delimiter)
  : [];

if (!existing.includes(backendNodeModules)) {
  process.env.NODE_PATH = [backendNodeModules, ...existing]
    .filter(Boolean)
    .join(path.delimiter);
  Module._initPaths();
}
