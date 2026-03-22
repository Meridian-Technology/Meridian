module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  clearMocks: true,
  transform: {},
  testTimeout: 30000,
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
