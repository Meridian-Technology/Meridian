# Local Testing and Deployment Guide

This guide covers setting up the local tenant override for testing multi-tenant flows, and running migrations on staging and production.

## Local Development

### 1. Environment variables

Set in `.env` (or your shell):

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URI_RPI` | Yes | MongoDB URI for RPI tenant |
| `MONGO_URI_TVCOG` | Yes (to test tvcog) | MongoDB URI for tvcog tenant |
| `MONGO_URI_PLATFORM` | Optional | Global DB URI; if unset, derived from `MONGO_URI_RPI` (e.g. `meridian_platform`) |

### 2. Run migrations (if you have existing users)

From `Meridian/backend/`:

```bash
node scripts/migrateUsersToGlobalIdentity.js
```

This creates GlobalUser and TenantMembership for each User in each tenant DB. Idempotent; safe to run multiple times.

### 3. Seed platform admins

```bash
PLATFORM_ADMIN_EMAILS=you@example.com node scripts/seedPlatformAdmins.js
```

Or with explicit global DB:

```bash
MONGO_URI_PLATFORM=<uri> PLATFORM_ADMIN_EMAILS=you@example.com node scripts/seedPlatformAdmins.js
```

### 4. Start backend and frontend

Start the backend and frontend as usual. On localhost (treated as www in dev), you'll see the landing page. To sign in or register:

1. Click "Sign in" or "Create account" (both go to `/select-school`).
2. Select your school (rpi or tvcog) and click "Sign in" or "Create account".
3. You'll be redirected to `/login` or `/register` with the tenant override set (via `devTenantOverride` in localStorage and `X-Tenant` header).

A **Tenant selector** also appears in the bottom-right corner (development only) to switch tenants without going through the picker.

No production impact—the X-Tenant override and localhost-as-www behavior are disabled when `NODE_ENV=production`.

---

## Staging

### 1. Environment variables

Set in your staging environment:

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | Set to `production` (or ensure it's set for staging) |
| `MONGO_URI_PLATFORM` or `MONGO_URI_GLOBAL` | Yes* | Global DB URI |
| `MONGO_URI_RPI` | Yes (if using rpi) | RPI tenant DB |
| `MONGO_URI_TVCOG` | If using tvcog | tvcog tenant DB |
| `JWT_SECRET` | Yes | Same secret across tenants |

See [multi-tenant-identity.mdx](../../Meridian-Mintlify/backend/multi-tenant-identity.mdx) for CORS and cookie domain if staging uses a different domain.

### 2. Run migrations

```bash
# From Meridian/backend/
MIGRATION_TENANT_KEYS=rpi,tvcog node scripts/migrateUsersToGlobalIdentity.js
```

Adjust `MIGRATION_TENANT_KEYS` to match your staging tenants.

### 3. Seed platform admins

```bash
PLATFORM_ADMIN_EMAILS=admin@staging.example.com node scripts/seedPlatformAdmins.js
```

### 4. Deploy

Deploy the backend. The X-Tenant override is disabled in production (`NODE_ENV=production`).

---

## Production

### 1. Environment variables

Same as staging. Prefer `MONGO_URI_PLATFORM` or `MONGO_URI_GLOBAL` set explicitly.

### 2. Run migrations

```bash
# From Meridian/backend/
MIGRATION_TENANT_KEYS=rpi,tvcog node scripts/migrateUsersToGlobalIdentity.js
```

### 3. Seed platform admins

```bash
PLATFORM_ADMIN_EMAILS=admin@meridian.study node scripts/seedPlatformAdmins.js
```

### 4. Deploy and verify

1. Deploy the backend.
2. Open a tenant subdomain (e.g. `https://rpi.meridian.study`), log in, confirm auth works.
3. If SSO is configured, open another tenant and confirm same user.
4. As platform admin, open Admin → Platform Admins and confirm you can list/add/remove.

---

## Script reference

| Script | Purpose |
|--------|---------|
| `scripts/seedPlatformAdmins.js` | Create platform admins from `PLATFORM_ADMIN_EMAILS` |
| `scripts/migrateUsersToGlobalIdentity.js` | Backfill GlobalUser + TenantMembership for existing tenant Users |

Both scripts are idempotent; safe to run multiple times.
