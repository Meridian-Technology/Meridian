# Meridian Testing Framework

This repository now uses a two-layer automated testing framework:

- **Backend**: Jest + Supertest (`backend/tests`)
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
- `npm --prefix backend run test:coverage`

Frontend package commands:

- `npm --prefix frontend run test`
- `npm --prefix frontend run test:ci`
- `npm --prefix frontend run test:coverage`

## Backend Test Layout

- `backend/tests/unit/**/*.test.js` for pure/pure-ish utility behavior.
- `backend/tests/integration/**/*.test.js` for HTTP route behavior.
- `backend/jest.config.js` configures Node test environment and coverage output.

Current backend integration tests intentionally mock DB/socket/event dependencies where needed so app-level route behavior can be tested without external services.

## Frontend Test Layout

- `frontend/src/**/__tests__/**/*.test.js` for unit/component tests.
- `frontend/package.json` includes CI-oriented scripts:
  - `test:ci` for non-watch execution
  - `test:coverage` for coverage output

Prefer test targets that avoid brittle full-app rendering and focus on stable behavior contracts (utility functions, render outputs, event handlers, and API adapters with mocks).

## GitHub Actions Integration

Workflow: `.github/workflows/ci.yml`

CI now executes:

1. backend dependency install
2. frontend dependency install
3. backend coverage test run
4. frontend coverage test run
5. upload `backend/coverage/lcov.info`
6. upload `frontend/coverage/lcov.info`

## Adding New Tests

When adding backend features:

1. Add or update unit tests in `backend/tests/unit`.
2. Add integration tests in `backend/tests/integration` if request/response behavior changes.
3. Run `npm --prefix backend run test:coverage`.

When adding frontend features:

1. Add or update tests near the feature under `frontend/src/**/__tests__`.
2. Mock network-heavy dependencies.
3. Run `npm --prefix frontend run test:coverage`.

Before opening a PR, run `npm run test:ci` from repo root.
