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
- **Events-Backend** is a private dependency (`backend/events/`). The directory is gitignored and normally cloned from `git@github.com:Study-Compass/Events-Backend.git` via `bin/fetch_private_deps`. Without SSH access to that repo, you must create stub files. The required stubs are:
  - `backend/events/index.js` — export an Express router
  - `backend/events/schemas/*.js` — stub Mongoose schemas for: `rssFeed`, `approvalFlowDefinition`, `approvalInstance`, `event`, `form`, `formResponse`, `eventAnalytics`, `eventSystemConfig`, `stakeholderRole`, `domain`, `analyticsEvent`, `eventQR`
- **`.env` file** is needed in both `/workspace/.env` and `/workspace/backend/.env` with at minimum: `JWT_SECRET`, `MONGO_URI_RPI` (or `MONGODB_URI`), `NODE_ENV=development`.
- **ESLint** for the frontend requires `NODE_ENV` to be set: `NODE_ENV=development npx eslint src/`
- The frontend test suite (`npm test` in `frontend/`) has a pre-existing failure in `App.test.js` related to analytics imports. This is not caused by environment setup.
- `backend/events` is a broken symlink pointing to `../../Events-Backend` by default. Remove it before creating the stub directory: `rm backend/events && mkdir -p backend/events`.

### Lint / test / build commands

See `README.md` for standard setup instructions. Quick reference:
- **Lint frontend**: `cd frontend && NODE_ENV=development npx eslint src/`
- **Test frontend**: `cd frontend && CI=true npm test`
- **Build frontend**: `cd frontend && npm run build`
- **Backend health check**: `curl http://localhost:5001/health`
- **Backend greet**: `curl http://localhost:5001/api/greet`
