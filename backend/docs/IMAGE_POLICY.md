# Tenant-Aware Image Policy (v2)

## Why this policy exists

Current behavior has three major issues:

1. Original uploads are reused for every context (thumbnail, card, full, hero), which inflates bandwidth and slows pages.
2. S3 object organization is not tenant-scoped, which weakens multi-tenant isolation and governance.
3. Storage conventions are not centrally enforced, so routes can drift into ad hoc naming and inconsistent quality.

This document defines the v2 image policy that standardizes ingestion, storage, delivery, and governance.

---

## Policy goals

- Make every image tenant-aware and owner-aware.
- Generate right-sized derivatives for UI contexts (thumb/card/full/hero).
- Convert to modern formats (AVIF + WebP) with JPEG fallback.
- Keep policy enforceable through shared backend code.
- Support zero-downtime migration from legacy URLs.

---

## Source of truth in code

`backend/services/imagePolicyService.js` is the policy module for:

- tenant key validation
- deterministic key naming
- entity-role validation
- allowed variants/formats
- upload plan generation

All image ingestion routes should call this service rather than assembling keys manually.

---

## Tenant-aware object key structure

Every image variant MUST be stored under:

`v2/tenants/{tenantKey}/images/{entityType}/{entityId}/{role}/{yyyy}/{mm}/{assetId}/{version}/{variant}.{format}`

Example:

`v2/tenants/rpi/images/org/65f1.../org_banner/2026/04/2cb7.../v1/card.avif`

Rules:

- `tenantKey` comes from `req.school`.
- `entityType` is one of: `org`, `user`, `classroom`, `event`.
- `role` is semantic (e.g. `org_profile`, `event_cover`), not route name.
- `assetId` is immutable per upload.
- `version` increments when the same logical slot is replaced.

This prevents collisions and supports deterministic auditing/deletion.

---

## Variant + format matrix

Generate all listed variants per uploaded role.

### Org profile (`org_profile`)
- `thumb` 96x96 cover
- `card` 256x256 cover
- `full` 512x512 cover

### Org banner (`org_banner`)
- `thumb` 480x200 cover
- `card` 960x360 cover
- `full` 1920x720 cover

### User avatar (`user_avatar`)
- `thumb` 64x64 cover
- `card` 128x128 cover
- `full` 320x320 cover

### Classroom photo (`classroom_photo`)
- `thumb` 320x180 cover
- `card` 640x360 cover
- `full` 1600x900 inside

### Event cover (`event_cover`)
- `thumb` 320x180 cover
- `card` 640x360 cover
- `full` 1600x900 inside
- `hero` 1920x1080 inside

### Generated formats

Per variant, generate:

- `avif` (preferred)
- `webp`
- `jpeg` (fallback)

Delivery preference order: AVIF -> WebP -> JPEG.

---

## Ingestion requirements

### Input validation

- Max upload size: 10 MB.
- Max decoded dimensions: 6000 x 6000.
- Max decoded pixels: 20 MP.
- Accepted MIME: JPEG/PNG/WebP.
- GIF uploads are not supported in v2.

### Normalization

- Auto-orient via EXIF.
- Strip EXIF metadata unless explicitly needed.
- Convert to sRGB.
- Enforce deterministic encoder settings by role.

### Ownership checks

Before writing objects:

- Resolve target `entityType/entityId` from route.
- Authorize caller against that owner.
- Ensure role is valid for that entity type.

If role/entity mismatch is detected, reject request with `400`.

---

## Delivery model

### Canonical references

For each image slot, store a lightweight manifest reference:

- `assetId`
- `version`
- `tenantKey`
- `entityType`
- `entityId`
- `role`
- available variants/formats

### API selection

Clients should request a semantic variant (`thumb`, `card`, `full`, `hero`) instead of raw pixel widths.

If the browser supports AVIF/WebP, deliver those. Otherwise JPEG fallback.

### Access control (recommended standard for this platform)

Because these assets are primarily internal to Meridian and not intended for broad external reuse:

- Keep S3 objects private.
- Serve through CDN with signed URLs/cookies (`private_signed` mode).
- Use short-lived signatures and immutable object keys.

This is the standard default for multi-tenant SaaS where images are mostly app-internal.

---

## Cache and lifecycle policy

- Variant objects: `Cache-Control: public, max-age=31536000, immutable`.
- Manifest/API responses: shorter TTL (for example 60 seconds to 5 minutes).
- Enable lifecycle rules for superseded versions after retention window.

Retention policy:

- Keep previous version for 30 days after replacement.
- Delete superseded versions after the 30-day retention window.

---

## Security and abuse controls

- Validate MIME and decodeability (not MIME alone).
- Reject malformed/zip-bomb-like inputs.
- Block SVG upload unless sanitized pipeline exists.
- Keep strict role/entity allowlist in one policy module.
- Log each ingest with tenant, entity, role, assetId, bytes.

---

## Enforcement in this codebase

### Current gaps found

- `imageUploadService` currently writes pass-through originals and does not generate variants.
- Several routes still build raw keys manually or use legacy upload paths.
- Multi-tenant key namespace is not consistently applied.

### Required route upgrades

Move all image writes to one ingestion path and remove direct `s3.upload(...)` usages in routes.

High-priority routes:

- `/upload-user-image`
- `/create-org` and `/edit-org`
- `/org-management/organizations/:orgId/edit`
- `/admin/rooms/:id/image`
- legacy classroom upload routes (`/upload-image/:classroomName`) should be deprecated.

---

## Rollout strategy

1. Add policy service and shared upload pipeline.
2. Update write routes to dual-write:
   - new manifest/reference fields
   - legacy URL fields for backward compatibility
3. Update read paths to prefer v2 manifest-derived variant URLs.
4. Backfill legacy images (see `backend/docs/IMAGE_MIGRATION_PLAN.md`).
5. Remove legacy writes and clean old objects after validation window.

Event image migration is intentionally staged until Events-Backend alignment is complete.

