# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Meridian (formerly Study Compass) is a full-stack web app for university campus engagement: study rooms, events, organizations, and social features. It is a monorepo with three packages:

| Package | Stack | Dev port |
|---------|-------|----------|
| `backend/` | Express + Mongoose + Socket.IO | 5001 |
| `frontend/` | React 18 (ejected CRA) + Tailwind + SASS | 3000 |
| `transactional/` | React Email templates (independent) | — |

### Running the app

- `npm run dev` from root starts both backend (nodemon) and frontend (webpack dev server) via `concurrently`.
- Frontend proxies API requests to `http://localhost:5001/` (configured in `frontend/package.json`).
- The backend uses multi-tenant MongoDB routing; in development it defaults to the `rpi` school database.

### Prerequisites and gotchas

- **Node.js 20.x** is required (`engines` in root `package.json`). Use `nvm use 20` to activate.
- **MongoDB** must be running locally. Start with: `mongod --dbpath /data/db --fork --logpath /var/log/mongodb/mongod.log`
- **Events-Backend (CRITICAL)**: The `backend/events/` directory contains the Events-Backend module, which is **essential** for the server to start and operate correctly. It is a separate private GitHub repo (`git@github.com:Meridian-Technology/Events-Backend.git`), not a submodule. In the repo, `backend/events` is tracked as a symlink pointing to `../../Events-Backend` (for developers who have both repos side by side). The production build system clones it via `bin/fetch_private_deps` using the SHA pinned in `private-deps.lock`.
  - **To set up properly**: Clone the Events-Backend repo so the symlink resolves: `git clone git@github.com:Meridian-Technology/Events-Backend.git ../../Events-Backend` (requires SSH access to the private repo). Alternatively, run `bin/fetch_private_deps` which clones directly into `backend/events/`.
  - **Fallback (stub mode)**: If you do NOT have access to the private repo, you can create minimal stubs so the server starts (but events functionality will not work):
    1. Remove the symlink: `rm backend/events`
    2. Create the directory: `mkdir -p backend/events/schemas`
    3. Create `backend/events/index.js` exporting an Express router
    4. Create stub Mongoose schemas in `backend/events/schemas/` for: `rssFeed`, `approvalFlowDefinition`, `approvalInstance`, `event`, `form`, `formResponse`, `eventAnalytics`, `eventSystemConfig`, `stakeholderRole`, `domain`, `analyticsEvent`, `eventQR`
  - **Note**: The stubs allow the server to start but all events-related API endpoints will be non-functional. Full development requires the actual Events-Backend repo.
- **`.env` file** is needed in both `/workspace/.env` and `/workspace/backend/.env` with at minimum: `JWT_SECRET`, `MONGO_URI_RPI` (or `MONGODB_URI`), `NODE_ENV=development`.
- **ESLint** for the frontend requires `NODE_ENV` to be set: `NODE_ENV=development npx eslint src/`
- The frontend test suite (`npm test` in `frontend/`) has a pre-existing failure in `App.test.js` related to analytics imports. This is not caused by environment setup.

### Lint / test / build commands

See `README.md` for standard setup instructions. Quick reference:
- **Lint frontend**: `cd frontend && NODE_ENV=development npx eslint src/`
- **Test frontend**: `cd frontend && CI=true npm test`
- **Build frontend**: `cd frontend && npm run build`
- **Backend health check**: `curl http://localhost:5001/health`
- **Backend greet**: `curl http://localhost:5001/api/greet`
