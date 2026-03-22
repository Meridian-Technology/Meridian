module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
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
  coverageReporters: ['text', 'lcov'],
};
