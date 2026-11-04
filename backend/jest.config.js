module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  // Keep haste maps writable when verification and judge runs use different
  // sandboxes; Jest's shared macOS temporary cache may be read-only to one run.
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',
  // supertest reaches IPv6 test servers over ::1; see the helper.
  setupFiles: ['<rootDir>/tests/helpers/supertestLoopback.js'],
  clearMocks: true,
  transform: {},
  testTimeout: 30000,
  // Events-Backend (backend/events symlink) uses backend's deps; ensure modules resolve to backend's node_modules
  modulePaths: ['<rootDir>/node_modules'],
  collectCoverageFrom: [
    'app.js',
    'routes/**/*.js',
    'utilities/**/*.js',
    'middlewares/**/*.js',
    'services/**/*.js',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
};
