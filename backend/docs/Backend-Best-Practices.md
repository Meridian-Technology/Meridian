# Meridian Backend — Best Practices

This document gives developers the context needed to work safely and consistently in the Meridian backend. Follow these patterns when adding or modifying routes, middlewares, services, and schemas.

---

## 1. Architecture Overview

- **Stack**: Express, Mongoose, JWT (cookies + Bearer), optional Passport/SAML.
- **Multi-tenant DB**: Tenant is derived from **subdomain** (e.g. `rpi` from `rpi.meridian.study`). In development, `localhost` and IP hosts default to `rpi`.
- **Per-request DB**: Every request gets `req.db` (a Mongoose connection) and `req.school` (subdomain string) from a global middleware in `app.js`. **Never** use a default `mongoose` connection or `mongoose.model()` directly; always use the request-scoped connection and `getModelService` (see below).

---

## 2. Database & Models

### 2.1 Getting models (required pattern)

**Always** resolve models through `getModelService` with the current `req`:

```js
const getModels = require('../services/getModelService');

// In a route or service that has req:
const { User, Event, Org } = getModels(req, 'User', 'Event', 'Org');
```

- **Why**: `req.db` is the tenant-specific Mongoose connection. `getModels(req, ...)` registers schemas on `req.db` and returns the correct model instances for that tenant.
- **Where**: Use in **routes** and in **services** that receive `req` (e.g. `userServices.js`, `studySessionService.js`). If you add a new service that touches the DB, have the route pass `req` and use `getModels(req, ...)` inside the service.
- **Do not**: Use `require('../schemas/user')` and then `mongoose.model('User')` or any global `mongoose` connection for app data. That bypasses multi-tenancy.

### 2.2 Adding a new model

1. Add a **schema** under `backend/schemas/` (or `backend/events/schemas/` for event-related models). Note: **`backend/events` is symlinked to the Events-Backend repo**; event routes and schemas live there.
2. In `backend/services/getModelService.js`:
   - Require the schema.
   - Add an entry to the `models` object: `ModelName: req.db.model('ModelName', schema, 'collectionName')`.
   - Use the exact **collection name** (third argument) the app expects (e.g. `'users'`, `'events'`).
3. No need to touch `connectionsManager.js` for a new model; it only provides `req.db` per school.

### 2.3 Connections manager

- **File**: `backend/connectionsManager.js`.
- **Role**: Maintains a pool of Mongoose connections per school and exposes `connectToDatabase(school)`.
- **Usage**: Only `app.js` calls it. The middleware in `app.js` does:
  - `req.db = await connectToDatabase(subdomain)`
  - `req.school = subdomain`
- **Adding a school**: Extend the `schoolDbMap` in `getDbUriForSchool()` with the new subdomain and env var (e.g. `MONGO_URI_<SCHOOL>`). Fallback is `DEFAULT_MONGO_URI`.

---

## 3. Auth & Middlewares

### 3.1 Order of use

Typical order on a route: **auth first**, then **org/permission** (if needed), then handler.

- `verifyToken` or `verifyTokenOptional` must run before any middleware or handler that uses `req.user`.
- Org middlewares (`requireOrgPermission`, etc.) expect `req.user` and use `getModels(req, ...)`; they must run after `verifyToken`.

### 3.2 verifyToken.js

- **verifyToken(req, res, next)**  
  - Reads JWT from `req.cookies.accessToken` or `Authorization: Bearer <token>`.
  - On success: sets `req.user = { userId, roles }` and calls `next()`.
  - On missing token: `401` with `{ success: false, message: 'No access token provided', code: 'NO_TOKEN' }`.
  - On expired: `401` with `code: 'TOKEN_EXPIRED'`.
  - On invalid: `403` with `code: 'INVALID_TOKEN'`.

- **verifyTokenOptional(req, res, next)**  
  - Same token sources. If no token or invalid, continues without `req.user`. If token is expired, may try to refresh via `refreshToken` cookie and set a new `accessToken` cookie and `req.user`.

- **authorizeRoles(...allowedRoles)**  
  - Use **after** `verifyToken`. Checks `req.user.roles`; if the user has none of `allowedRoles`, responds `403 Forbidden`.

Example:

```js
const { verifyToken, authorizeRoles } = require('../middlewares/verifyToken');

router.get('/admin-only', verifyToken, authorizeRoles('admin'), async (req, res) => {
    const { User } = getModels(req, 'User');
    // ...
});
```

### 3.3 orgPermissions.js

Use these for org-scoped actions. They use `getModels(req, 'OrgMember', 'Org')` and expect `req.user` (so use after `verifyToken`).

- **requireOrgPermission(permission, orgParam = 'orgId')**  
  - Resolves org from `req.params[orgParam]` or `req.body[orgParam]` or `req.query[orgParam]`. Ensures user is an active member and has the given permission; sets `req.orgMember` and `req.org`.

- **requireAnyOrgPermission(permissions, orgParam = 'orgId')**  
  - Same as above but user needs at least one of the listed permissions.

- **requireOrgOwner(orgParam = 'orgId')**  
  - Ensures user is the org owner; sets `req.org`.

- **Convenience wrappers**: `requireRoleManagement`, `requireMemberManagement`, `requireEventManagement`, `requireAnalyticsAccess`, `requireEquipmentManagement`, `requireEquipmentModification` — all take `(orgParam = 'orgId')`.

Permission strings must match **constants/permissions.js** (e.g. `ORG_PERMISSIONS.MANAGE_EVENTS`, `'manage_events'`). Use the constants in code:

```js
const { requireOrgPermission } = require('../middlewares/orgPermissions');
const { ORG_PERMISSIONS } = require('../constants/permissions');

router.post('/orgs/:orgId/events', verifyToken, requireOrgPermission(ORG_PERMISSIONS.MANAGE_EVENTS), async (req, res) => {
    // req.org, req.orgMember set
});
```

---

## 4. Routes

### 4.1 Structure

- Routes live in `backend/routes/` (and under `backend/events/routes/` for event features).
- Each file exports an Express `Router`. Mount in `app.js` (or in `events/index.js` for event routes).
- Prefer **middleware + single handler** per path; keep handlers thin and delegate to services when logic is non-trivial.

### 4.2 Response shape

Use a consistent JSON shape so clients and agents can rely on it:

- **Success**: `res.status(200).json({ success: true, data?: any, message?: string })`.
- **Created**: `res.status(201).json({ success: true, ... })`.
- **Client error**: `res.status(4xx).json({ success: false, message: string, code?: string })`.
- **Server error**: `res.status(500).json({ success: false, message: string })`.

Auth middlewares already use `success`, `message`, and `code`. Use `code` for stable client handling (e.g. `NO_TOKEN`, `TOKEN_EXPIRED`, `INVALID_TOKEN`).

### 4.3 Protected vs public

- **Protected**: Put `verifyToken` (and optionally `authorizeRoles` or org permission middlewares) in the route chain. Then you can use `req.user` and `getModels(req, ...)`.
- **Public**: Do not use `verifyToken`; if you need optional auth (e.g. personalized data when logged in), use `verifyTokenOptional`.

---

## 5. Services

- **Location**: `backend/services/`.
- **Role**: Encapsulate business logic, external APIs, and shared helpers. Keep route handlers focused on HTTP and validation.
- **DB access**: If a service needs DB, the **caller** (route or other service) must pass `req`. The service then calls `getModels(req, 'ModelName', ...)` and uses the returned models. Example: `userServices.js`, `studySessionService.js`.
- **No req in context**: If you have a background job or script without `req`, you must obtain a Mongoose connection and pass something that has a `db` property (or refactor to accept a connection/model factory) so that tenant and model resolution still work. Do not introduce a global default connection for app data.

---

## 6. Events (Events-Backend)

- **`backend/events` is symlinked to the Events-Backend repo** (same repo root as Meridian). All event routes and schemas live in Events-Backend; Meridian loads them via this symlink.
- **Mount**: `backend/events/index.js` is required in `app.js` and mounted as `app.use(eventsRoutes)` (path depends on how `eventsRoutes` is defined in `app.js`).
- **Routes**: Under `backend/events/routes/` (i.e. `Events-Backend/routes/`) (e.g. `eventRoutes.js`, `eventSystemConfigRoutes.js`, `analyticsRoutes.js`). These are aggregated in `events/index.js`.
- **Schemas**: Event-related schemas live in `backend/events/schemas/` (Events-Backend). They are required and registered in Meridian’s `getModelService.js`; event routes and middlewares use the same `getModels(req, ...)` pattern.
- When adding event features, add schemas under `events/schemas/`, register in `getModelService.js`, and add routes under `events/routes/`, then mount in `events/index.js` if needed.

---

## 7. Permissions Constants

- **File**: `backend/constants/permissions.js`.
- **Exports**: `ORG_PERMISSIONS`, `EVENT_PERMISSIONS`, `USER_PERMISSIONS`, `SYSTEM_PERMISSIONS`, `PERMISSION_GROUPS`, `PERMISSION_DESCRIPTIONS`, plus helpers like `getPermissionDescription`, `validatePermission`.
- **Usage**: Use these constants instead of string literals when checking or assigning permissions (e.g. in `requireOrgPermission(ORG_PERMISSIONS.MANAGE_EVENTS)`). This keeps permission names consistent and refactor-safe.

---

## 8. Conventions Summary

| Concern              | Rule |
|----------------------|------|
| DB / models          | Always `getModels(req, 'ModelName', ...)` with the request-scoped `req`. Never use global `mongoose` for app data. |
| Tenant               | Use `req.db` and `req.school` set by app middleware; do not infer tenant elsewhere. |
| Auth                 | Use `verifyToken` for protected routes; `verifyTokenOptional` for optional auth. |
| Roles                | Use `authorizeRoles(...)` after `verifyToken` for role checks. |
| Org permissions      | Use `requireOrgPermission` / `requireAnyOrgPermission` / `requireOrgOwner` from `orgPermissions.js` with constants from `constants/permissions.js`. |
| Responses            | Use `{ success, message?, code?, data? }` JSON and appropriate status codes. |
| New model            | Add schema, then register in `getModelService.js` with `req.db.model('Name', schema, 'collectionName')`. |
| New school/tenant    | Add mapping in `connectionsManager.js` `getDbUriForSchool` and corresponding env var. |

---

## 9. Known Inconsistencies / Gotchas

- **Duplicate key in getModelService**: The `models` object in `getModelService.js` defines `EventAnalytics` twice (same schema/collection). Prefer a single entry to avoid confusion.
- **Token expiry**: `verifyToken.js` and `authRoutes.js` use different `ACCESS_TOKEN_EXPIRY` values (e.g. 15m vs 1m). Align these in one place (e.g. a shared auth constants file) so middleware and token issuance stay in sync.
- **verifyTokenOptional**: Uses a callback-style `jwt.verify` and calls `next()` from inside the callback; ensure `next()` is never called twice (e.g. on refresh path) to avoid double-response issues.
- **StudySession service**: `studySessionService.js` expects `req` and calls `getModels(req, ...)`. Any caller must pass the real `req` from the route.

---

## 10. Quick Reference: Key Files

| Purpose              | File(s) |
|----------------------|--------|
| App entry, CORS, DB middleware, route mounting | `app.js` |
| Per-tenant DB connections | `connectionsManager.js` |
| Request-scoped models | `services/getModelService.js` |
| JWT auth              | `middlewares/verifyToken.js` |
| Org permission checks | `middlewares/orgPermissions.js` |
| Permission constants  | `constants/permissions.js` |
| Route definitions     | `routes/*.js`, `events/routes/*.js` |
| Event route mounting  | `events/index.js` |
| Mongoose schemas      | `schemas/*.js`, `events/schemas/*.js` |

When editing the backend, keep this guide in context so changes stay consistent with multi-tenancy, auth, and the existing patterns above.
