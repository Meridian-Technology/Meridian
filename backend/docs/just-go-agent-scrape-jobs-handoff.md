# Just Go — Agent scrape jobs handoff (backend)

Backend-only scope for adding **agent jobs that scrape event websites** into the existing Just Go (internal: **Pivot**) curation pipeline.

Web curation UI lives at `/platform-admin/pivot/:tenantKey?page=1` and already drives saved **curation jobs** → async **curation runs**. Today those jobs only crawl **Partiful** and **Luma**; there is no generic website / browser-agent scraper. This task should extend the backend job/run/ingest path — not mobile.

Related plans:
- [`Meridian-Mintlify/strategy/pivot-tenant-ops-dashboard-plan.mdx`](../../Meridian-Mintlify/strategy/pivot-tenant-ops-dashboard-plan.mdx) — curation jobs / runs contract
- [`Meridian-Mintlify/strategy/pivot-metadata-contract.mdx`](../../Meridian-Mintlify/strategy/pivot-metadata-contract.mdx) — `Event.customFields.pivot` shape

---

## Current flow

```text
POST /admin/pivot/tenants/:tenantKey/curation-jobs/:jobId/run
  → create PivotCurationRun (queued)
  → executeCurationRun (async)
      → pivotIngestPreviewService.previewIngestUrl  ← scrape / parse
      → pivotIngestPublishService.publishIngestEvent  ← Event.customFields.pivot
  → poll GET .../curation-runs/:runId
```

Also used for one-shot paste ingest:
- `POST /admin/pivot/ingest/preview`
- `POST /admin/pivot/ingest`
- `POST /admin/pivot/ingest/batch`

Providers today (`CURATION_PROVIDERS`): `partiful` | `luma` | `manual-json`  
`manual-json` is not crawlable. There is no Playwright / Firecrawl / browser-agent layer.

---

## Must-touch files

| File | Role |
|---|---|
| `routes/pivotAdminRoutes.js` | Admin APIs: curation-jobs CRUD + run, curation-runs poll, ingest/* |
| `schemas/pivotCurationJob.js` | Job model; `CURATION_PROVIDERS` enum — extend for new agent/scrape provider |
| `schemas/pivotCurationRun.js` | Async run: status, stats, failures, events, `forceBatchWeek` |
| `services/pivotCurationJobService.js` | Job CRUD; URL ↔ provider validation |
| `services/pivotCurationRunService.js` | Start/execute run; rejects `manual-json`; calls preview → publish |
| `services/pivotIngestPreviewService.js` | **Core scrape/parse** — Partiful/Luma allowlist, HTML/`__NEXT_DATA__`/JSON-LD, Luma discover API. Primary extension point (or add a sibling service and call it from here / run service) |
| `services/pivotIngestPublishService.js` | Upserts tenant `Event` with `customFields.pivot.*`; defaults ingest to staged |
| `services/pivotIngestDuplicateService.js` | Duplicate detection for crawl/import |
| `utilities/pivotIngestStatus.js` | `draft` \| `staged` \| `published` |
| `app.js` | Mounts `app.use('/admin/pivot', pivotAdminRoutes)` |

---

## Supporting backend files

| File | Role |
|---|---|
| `services/pivotTenantOpsService.js` | `GET .../ops?include=curation` — jobs + catalog + readiness bundle |
| `services/pivotLabEventsService.js` | Catalog list for review queues |
| `services/pivotBatchService.js` | `PivotBatch` ensure/get for week lifecycle |
| `services/pivotBatchReleaseService.js` | Release / unrelease (`staged` → `published`) |
| `services/pivotBatchReadinessService.js` | Readiness scoring |
| `services/pivotTagSuggestService.js` | Claude tag suggest (`/ingest/suggest-tags`) — not scraping |
| `services/pivotTagCatalogService.js` | Tag catalog CRUD/seed |
| `services/pivotCatalogPurgeService.js` | Catalog purge / cleanup |
| `services/getGlobalModelService.js` | Registers global `PivotCurationJob` / `PivotCurationRun` |
| `services/getModelService.js` | Registers tenant `PivotBatch` |
| `schemas/pivotBatch.js` | Per-city week ops record |
| `schemas/pivotTagCatalog.js` | Tag catalog |
| `utilities/pivotIsoWeek.js` | ISO week helpers |
| `utilities/pivotDropSchedule.js` | Drop instant / batch-week for job strategy `next-drop` |
| `utilities/pivotEnrichment.js` | Optional vibe / priceBand / neighborhood enrichment shape |

---

## Key API endpoints

All under `/admin/pivot` (see `pivotAdminRoutes.js`):

- `GET|POST /tenants/:tenantKey/curation-jobs`
- `PATCH|DELETE /tenants/:tenantKey/curation-jobs/:jobId`
- `POST /tenants/:tenantKey/curation-jobs/:jobId/run`
- `GET /tenants/:tenantKey/curation-runs/:runId`
- `GET /tenants/:tenantKey/ops?include=curation`
- `POST /ingest/preview` · `POST /ingest` · `POST /ingest/batch`
- `PATCH|DELETE /ingest/:eventId`
- `POST /ingest/suggest-tags` · `suggest-and-apply-tags`
- `POST /tenants/:tenantKey/batches/:batchWeek/release|unrelease`
- `GET /tenants/:tenantKey/batches/:batchWeek/readiness`

---

## Tests to extend

| File |
|---|
| `tests/unit/pivotIngestPreviewService.test.js` |
| `tests/unit/pivotCurationJobService.test.js` |
| `tests/unit/pivotCurationRunService.test.js` |
| `tests/unit/pivotIngestPublishService.test.js` |
| `tests/unit/pivotIngestDuplicateService.test.js` |
| `tests/unit/pivotIngestStatus.test.js` |
| `tests/route-outcomes/pivotAdminRoutes.outcomes.test.js` |

(Also useful if batch-week / readiness behavior changes: `pivotBatchService`, `pivotBatchReleaseService`, `pivotBatchReadinessService`, `pivotTenantOpsService` unit tests.)

---

## Suggested implementation touch points

1. **Provider** — Add a new value to `CURATION_PROVIDERS` in `schemas/pivotCurationJob.js` (e.g. agent/generic-site). Update validation in `pivotCurationJobService.js`.
2. **Scrape** — Implement parse/agent fetch in `pivotIngestPreviewService.js` or a sibling service; wire from `previewIngestUrl` / run execution. Today host allowlist is effectively Partiful + Luma.
3. **Run path** — Keep using `pivotCurationRunService.js` (already async job → run → preview → publish). Ensure the new provider is runnable (unlike `manual-json`).
4. **Publish contract** — Set `customFields.pivot.source` / `sourceUrl` / `batchWeek` / `ingestStatus` per `pivot-metadata-contract.mdx`.
5. **Routes** — Only change `pivotAdminRoutes.js` if new endpoints or request shapes are required; prefer reusing existing job/run/ingest APIs.
6. **Tests** — Mirror existing preview + run + route-outcome coverage for the new provider.

Out of scope for this handoff: web UI (`PivotTenantCurationPage.jsx`), mobile admin Jobs, Lab JSON agent prompt (`PIVOT_JSON_IMPORT_AGENT_PROMPT`).

---

## Event output contract (short)

Published rows are tenant `Event` documents with Pivot fields under `customFields.pivot`, including roughly:

- `source` — provider / scrape origin
- `sourceUrl` — event page URL
- `batchWeek` — ISO week for the drop
- `ingestStatus` — `draft` | `staged` | `published`
- tags, host, and other enrichment as defined in the metadata contract

Default ingest status from publish is **staged** (review before release).
