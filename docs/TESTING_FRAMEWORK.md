# Meridian Testing Framework

This repository now uses a three-layer automated testing framework:

- **Backend**: Jest + Supertest (`backend/tests`)
- **Backend Route Outcomes**: Supertest + in-memory MongoDB (`mongodb-memory-server`) for real request/response + persistence behavior
- **Frontend**: Jest + React Testing Library (`frontend/src/**/__tests__`)

The CI workflow runs both suites on every PR and push to `main`.

## Goals

- Keep test runs deterministic and CI-friendly.
- Catch regressions in backend business logic and API behavior.
- Catch regressions in frontend utilities/components.
- Produce coverage artifacts for both packages.

## Commands

Run from repository root:

- `npm run test:backend` — backend coverage run
- `npm run test:frontend` — frontend coverage run
- `npm run test:ci` — backend + frontend coverage runs (same orchestration used in CI)

Backend package commands:

- `npm --prefix backend run test:unit`
- `npm --prefix backend run test:integration`
- `npm --prefix backend run test:routes`
- `npm --prefix backend run test:coverage`

Frontend package commands:

- `npm --prefix frontend run test`
- `npm --prefix frontend run test:ci`
- `npm --prefix frontend run test:coverage`

## Backend Test Layout

- `backend/tests/unit/**/*.test.js` for pure/pure-ish utility behavior.
- `backend/tests/integration/**/*.test.js` for HTTP route behavior.
- `backend/tests/route-outcomes/**/*.test.js` for end-to-end route outcomes against in-memory MongoDB.
- `backend/jest.config.js` configures Node test environment and coverage output.
- `backend/tests/helpers/mongoMemory.js` provides ephemeral MongoDB setup/teardown.

Route-outcome tests are the preferred path for API correctness: they execute real route handlers and real Mongoose persistence while still keeping CI deterministic.

## Frontend Test Layout

- `frontend/src/**/__tests__/**/*.test.js` for unit/component tests.
- `frontend/package.json` includes CI-oriented scripts:
  - `test:ci` for non-watch execution
  - `test:coverage` for coverage output

Prefer stable behavior contracts:

- utility and component behavior
- API request lifecycle behavior (`src/utils/postRequest.js`) including refresh-token retry paths
- deterministic mocks for browser-only dependencies

## GitHub Actions Integration

Workflow: `.github/workflows/ci.yml`

CI now executes:

1. backend dependency install
2. frontend dependency install
3. backend comprehensive coverage test run (unit + integration + route outcomes)
4. frontend coverage test run (including API request lifecycle tests)
5. upload `backend/coverage/lcov.info`
6. upload `frontend/coverage/lcov.info`

## Adding New Tests

When adding backend features:

1. Add or update unit tests in `backend/tests/unit`.
2. Add integration tests in `backend/tests/integration` for middleware/wiring checks.
3. Add route outcome tests in `backend/tests/route-outcomes` for real API behavior.
4. Run `npm --prefix backend run test:routes` and `npm --prefix backend run test:coverage`.

When adding frontend features:

1. Add or update tests near the feature under `frontend/src/**/__tests__`.
2. Add request-lifecycle tests for API-heavy logic in `src/utils/__tests__` as needed.
3. Mock network-heavy dependencies.
4. Run `npm --prefix frontend run test:coverage`.

Before opening a PR, run `npm run test:ci` from repo root.
