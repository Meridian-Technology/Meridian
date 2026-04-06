# Image Migration Plan (Legacy -> Tenant-Aware v2)

This runbook migrates existing image URLs into the v2 tenant-aware structure with generated variants and modern formats.

---

## Objectives

- No downtime and no broken images.
- Idempotent and resumable migration.
- Backfill all legacy image references (orgs, users, classrooms, and event images when available).
- Preserve auditability and rollback path.

---

## Scope

### In-scope legacy fields

- `User.picture`
- `Org.org_profile_image`
- `Org.org_banner_image`
- `Classroom.image`
- Event image fields in `backend/events` when module is available

### Out-of-scope

- Client-side hardcoded static asset paths in frontend build artifacts
- Third-party URLs not owned by Meridian storage (unless explicitly imported)

---

## Migration architecture

Use a dedicated migration worker (script/job) with a durable checkpoint table/collection:

- `image_migration_jobs`
  - `tenantKey`
  - `entityType`
  - `entityId`
  - `fieldName`
  - `legacyUrl`
  - `status` (`pending`, `processing`, `migrated`, `failed`, `skipped`)
  - `attempts`
  - `lastError`
  - `newAssetRef`
  - timestamps

This makes migration restart-safe and observable.

---

## Phases

## Phase 0: Preflight and inventory

1. Enumerate tenants from tenant config.
2. For each tenant DB, scan in-scope collections for non-empty image fields.
3. Emit inventory counts by tenant/entity/field.
4. Classify each URL:
   - bucket-owned legacy URL
   - already v2-formatted URL
   - external URL

Gate to continue:

- >99% of references are resolvable or intentionally skipped by policy.

---

## Phase 1: Build migration queue

For each resolvable legacy URL create a `pending` job.

Deduplicate by `(tenantKey, entityType, entityId, fieldName, legacyUrl)` to avoid duplicate work.

---

## Phase 2: Backfill worker

For each job:

1. Download legacy image bytes.
2. Decode and validate (size/dimension/pixel limits).
3. Select role from field mapping:
   - `User.picture` -> `user_avatar`
   - `Org.org_profile_image` -> `org_profile`
   - `Org.org_banner_image` -> `org_banner`
   - `Classroom.image` -> `classroom_photo`
4. Generate v2 variant+format outputs.
5. Upload to tenant-aware keys.
6. Update DB document:
   - keep legacy field for now (compatibility)
   - add new manifest/reference field
7. Mark job `migrated`.

Failure handling:

- Retry transient failures with exponential backoff.
- After max retries, mark `failed` and continue.

---

## Phase 3: Dual-read rollout

Update backend read serializers and frontend consumers:

- Prefer v2 manifest reference if present.
- Fallback to legacy URL when absent.

This allows progressive migration without user-visible regressions.

---

## Phase 4: Validation and confidence gates

Validate with automated checks:

- Count parity:
  - `migrated + skipped + failed == queued`
- Sampling:
  - random N images per tenant + role render correctly
- Performance:
  - thumbnail payload reduction vs legacy baseline

Release gate recommendation:

- <= 0.5% failed jobs and no critical tenant regressions.

---

## Phase 5: Cutover writes

After confidence window:

1. Disable legacy-only write paths.
2. Keep dual-read for one release window.
3. New uploads only write v2 references.

---

## Phase 6: Legacy cleanup

After log-confirmed inactivity window:

1. Delete unreferenced legacy objects in batches.
2. Keep tombstone log for deletions (object key + timestamp + job id).
3. Remove legacy URL fields after final validation (optional, can be deferred).

---

## Rollback plan

At any point before cleanup:

- Flip read preference back to legacy fields.
- Pause migration workers.
- Keep v2 objects (safe side-by-side storage).

Because legacy values are not deleted early, rollback is low-risk.

---

## Recommended implementation order in this repo

1. Replace ad hoc route uploads with shared policy-based service.
2. Add manifest/reference fields to user/org/classroom schemas (non-breaking optional).
3. Add migration queue collection and worker script.
4. Execute tenant-by-tenant migration with dashboards.
5. Cutover reads, then writes, then cleanup.

---

## Open decisions required before execution

1. Should migration import external non-S3 URLs, or leave them untouched?
2. What retention window is required for legacy originals after cutover?
3. Are animated GIFs required, or should we convert to static first frame?
4. Do we want signed/private delivery for any entity roles (for example internal-only room photos)?
5. Should event images be migrated in this same wave, or after Events-Backend alignment?

