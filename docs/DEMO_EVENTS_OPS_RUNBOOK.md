# Demo Events Sandbox — Operations Runbook

Operations guide for `demo.meridian.study/events-demo` and the demo tenant database.

---

## Prerequisites

| Item | Detail |
|------|--------|
| Tenant | `demo` (`MONGO_URI_DEMO`) |
| DNS | `demo.meridian.study` → app + API |
| CORS | `https://demo.meridian.study` in `app.js` allowlist |
| Bootstrap admin | Created on seed: `admin@demo.meridian.study` |

---

## Sales playbook (one credential per prospect)

1. Log in on **demo tenant** as bootstrap admin → `/admin` → **Demo credentials**.
2. Click **Generate credential** with a descriptive label:
   - `Acme University — Jordan Kim — March 2026`
   - `Investor preview — Sequoia`
3. Copy **email + password** from the one-time modal and send via your secure channel (1Password link, encrypted email, etc.).
4. Share the portal URL: **https://demo.meridian.study/events-demo**
5. Optional: set an **expiry** when generating (e.g. 14 days). Expired credentials are revoked automatically by the hourly cron.
6. After the meeting, **revoke** the credential from the admin table if it should not be reused.
7. Review **credential journey** in admin to see which phases/tabs the prospect explored.

**Do not** reuse one credential across multiple prospects — generate a fresh row per person/org for clean analytics.

---

## Seed demo data

### HTTP (preferred)

```bash
# Check status
curl 'https://demo.meridian.study/admin/demo-seed-status' \
  -H 'X-Tenant: demo' \
  -H 'Cookie: accessToken=...'

# Fresh seed (regenerates preview + bootstrap passwords)
curl -X POST 'https://demo.meridian.study/admin/seed-demo-tenant' \
  -H 'X-Tenant: demo' \
  -H 'Content-Type: application/json' \
  -d '{"reset": true}'
```

In local dev, `X-Tenant: demo` or `?school=demo` is enough for admin routes (no cookie required).

### CLI

```bash
cd Meridian/backend
MONGO_URI_DEMO='mongodb://...' node scripts/seed-demo-tenant.js --reset
```

Save `previewCredential.password` and `bootstrapAdmin.password` from the output — shown only once.

---

## Re-seed / reset

Use when demo data is stale, corrupted, or you need new bootstrap passwords.

1. **Back up** if needed (demo DB only — no production student data).
2. Run seed with `reset: true` (HTTP or CLI above).
3. Verify:
   - `GET /admin/demo-seed-status` → `seeded: true`
   - `GET /admin/demo-credentials` → preview credential present
   - Login at `/events-demo` with preview credential
4. Re-create prospect credentials (old demo credential rows are wiped on full re-seed).

---

## Credential expiry

### Automatic (production)

Hourly cron (`jobs/demoTenantJobs.js`) revokes credentials where `expiresAt <= now` and `revokedAt` is null.

| Env var | Default | Purpose |
|---------|---------|---------|
| `DEMO_CREDENTIAL_EXPIRY_CRON` | `15 * * * *` | Cron schedule |
| `DISABLE_DEMO_CRON` | unset | Set `true` to disable |
| `MONGO_URI_DEMO` | required | Demo DB connection |

### Manual

```bash
cd Meridian/backend
MONGO_URI_DEMO='mongodb://...' node scripts/expire-demo-credentials.js
```

Or HTTP (admin on demo tenant):

```bash
curl -X POST 'https://demo.meridian.study/admin/demo-credentials/expire-stale' \
  -H 'X-Tenant: demo' \
  -H 'Cookie: accessToken=...'
```

Login already rejects expired credentials even before cron runs (`credentialIsActive`).

---

## Rate limiting

Demo login: **5 attempts per IP per 15 minutes** (`demoCredentialService.js`).

Clients receive `429` with code `RATE_LIMITED` when exceeded.

---

## Health checks

| Check | Expected |
|-------|----------|
| `GET /health` | `{ ok: true }` |
| `GET /admin/demo-seed-status` (demo tenant) | `seeded: true` |
| `GET /events-demo/auth/me` (no cookie) | `401` |
| Landing CTA | Opens `https://demo.meridian.study/events-demo` |

---

## Related docs

- [DEMO_EVENT_ORG_PERSPECTIVE_PLAN.md](./DEMO_EVENT_ORG_PERSPECTIVE_PLAN.md) — implementation plan
