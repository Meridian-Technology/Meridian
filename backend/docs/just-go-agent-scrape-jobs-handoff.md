# Just Go — Agent scrape jobs handoff (backend)

> **Status: landed.** The `generic-site` provider scrapes arbitrary event websites via Firecrawl ([Implemented design](#implemented-design)), and `pivotSourceDiscoveryService` finds those websites from a city name alone ([Autonomous source discovery](#autonomous-source-discovery)). The rest of this document is the original handoff and remains accurate as a map of the pipeline.

Backend-only scope for adding **agent jobs that scrape event websites** into the existing Just Go (internal: **Pivot**) curation pipeline.

Web curation UI lives at `/platform-admin/pivot/:tenantKey?page=1` and already drives saved **curation jobs** → async **curation runs**. Jobs now crawl **Partiful**, **Luma**, and **generic websites** via Firecrawl. Additionally, **discovery bootstraps native indexes first** - guaranteed city-index jobs for Luma/Partiful run before Firecrawl search to ensure coverage even when search doesn't return those hosts. This task should extend the backend job/run/ingest path — not mobile.

Related plans:
- [`Meridian-Mintlify/strategy/pivot-tenant-ops-dashboard-plan.mdx`](../../Meridian-Mintlify/strategy/pivot-tenant-ops-dashboard-plan.mdx) — curation jobs / runs contract
- [`Meridian-Mintlify/strategy/pivot-metadata-contract.mdx`](../../Meridian-Mintlify/strategy/pivot-metadata-contract.mdx) — `Event.customFields.pivot` shape
- [`Meridian-Mintlify/strategy/pivot-native-first-discovery-plan.mdx`](../../Meridian-Mintlify/strategy/pivot-native-first-discovery-plan.mdx) — native-first discovery implementation plan

**Native-first discovery:** Discovery flows are now configurable per tenant (`native-then-firecrawl`, `native-only`, `firecrawl-only`) via `utilities/pivotDiscoveryConfig.js`. Native sources (Luma/Partiful city indexes) bootstrap before Firecrawl search to guarantee coverage, with result filtering to prevent `generic-site` treatment of hosts we can parse natively.

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

Providers today (`CURATION_PROVIDERS`): `partiful` | `luma` | `manual-json` | `generic-site`  
`manual-json` is not crawlable. `generic-site` uses Firecrawl for browser-agent scraping of arbitrary event websites.

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

**Native-first discovery additions:**

| File | Role |
|------|------|
| `utilities/pivotDiscoveryConfig.js` | Discovery flow configuration (`native-then-firecrawl`, `native-only`, `firecrawl-only`), slug validation, native source specs, skip-host helpers |
| `schemas/tenantConfig.js` | Tenant `pivotDiscovery` config schema (flow + Luma/Partiful city slugs) |
| `services/tenantConfigService.js` | Persist discovery config with validation |
| `services/pivotCurationBatchService.js` | Batch curation for native jobs without entries from bootstrap |

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
- `PATCH /tenants/:tenantKey/sources/discovery-config` — save flow + city slugs as tenant default

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

---

## Implemented design

`generic-site` is the fourth value in `CURATION_PROVIDERS`. It exists because the long-tail-city sources the pilot needs are unreachable by the Partiful/Luma path: probing six Iowa City calendars found client-rendered SPAs (`events.uiowa.edu`, `thinkiowacity.com`), a bot-blocked civic CMS (`icgov.org`), and a WordPress calendar with both its REST route and ICS export disabled (`littlevillagemag.com`). None returned a parseable JSON-LD `Event`.

### Flow

```text
POST .../curation-jobs/:jobId/run   (provider: generic-site)
  → executeCurationRun
      → previewIngestUrl({ provider: 'generic-site', timezone })
          → previewGenericSiteIngest
              → pivotSiteScrapeService.scrapeSiteEvents   ← Firecrawl render + JSON extract
      → publishIngestEvent (unchanged)
```

### What was added

| File | Change |
|---|---|
| `services/pivotSiteScrapeService.js` | **New.** Firecrawl `/v2/scrape` with a JSON schema; normalizes rows into the shared draft shape |
| `schemas/pivotCurationJob.js` | `generic-site` added to `CURATION_PROVIDERS` |
| `services/pivotCurationJobService.js` | `generic-site` validation — URL required, any public host, private ranges refused |
| `services/pivotIngestPreviewService.js` | `normalizeUrl(url, { allowAnyHost })`; `previewGenericSiteIngest`; provider routing in `previewIngestUrl` |
| `services/pivotCurationRunService.js` | Passes `provider` + city timezone to preview; fails fast when unconfigured; per-source run messages |
| `PivotTenantCurationPage.jsx` | "Website (scraped)" provider option |

### Notes for the next change

- **Config:** requires `FIRECRAWL_API_KEY`. Without it, job creation still works but runs are rejected up front with `SITE_SCRAPE_NOT_CONFIGURED` (503) rather than queueing a doomed run.
- **Cost:** JSON extraction is 5 Firecrawl credits per page, so `MAX_SITE_EVENTS_CEILING` (250) caps every run and the provider is **never inferred** from an unrecognized host — callers must pass `provider: 'generic-site'` explicitly.
- **`sourceUrl` uniqueness:** publish upserts catalog events on `customFields.pivot.sourceUrl`. Listing pages often have no per-event link, so `resolveDraftSourceUrl` derives a stable `#slug-date` fragment; without it every event on a page would overwrite the previous one.
- **Timezone:** the extraction prompt is anchored to today's date and `tenant.pivotDropTimezone` so relative listings ("Fri 8pm") resolve to the right instant. New cities get this for free once the tenant has a drop timezone.

---

## Autonomous source discovery

The `generic-site` provider still needed a hand-entered URL per job, which left the harder half of the problem — deciding *which* sites to register — with the manual CLI-agent loop. `pivotSourceDiscoveryService` closes that gap: the only required input is a `tenantKey`.

The CLI agent was doing three separable things, and each maps onto a Firecrawl endpoint, so the loop reduces to a deterministic pipeline on the credential `generic-site` already uses. No agent runtime and no second vendor.

| Agent behavior | Endpoint | Cost |
|---|---|---|
| Search the web for candidate sites | `/v2/search` | ~1 credit per query |
| Read a site to find its calendar | `/v2/map` | 1 credit per host, any link count |
| Judge whether a page has real events | `/v2/scrape` + JSON extract | 5 credits per host |

### Flow

```text
POST .../tenants/:tenantKey/sources/discover        → 202 + cost ceiling
  → scheduleCitySourceDiscovery (background)
      → phase: native              ← bootstrap Luma/Partiful city indexes FIRST
          → bootstrapNativeSources ← create/reuse jobs, crawl via executeCurationRun
          → ingestEntries          ← publish native events
      → phase: searching           ← only when runFirecrawl === true
          → buildDiscoveryQueries  ← seeded from tag catalog, not prior results  
          → searchSites per query  ← candidate hosts, deduped, seed tags unioned
      → phase: filtering           ← skip native hosts + known hosts + non-sources
          → filter                 ← result filtering, NOT fewer queries
      → phase: qualifying          ← map + scrape remaining candidates
          → mapSite per candidate  ← locate event index, not homepage
          → scrapeSiteEvents       ← qualify: does index yield dated events?
      → phase: registering         ← persist outcomes
          → PivotCitySource upsert ← qualified *and* rejected  
          → createCurationJob      ← qualified sources get refresh job
          → ingestEntries          ← publish events qualifying scrape returned
          → startCurationBatch     ← native hosts without entries from bootstrap
GET .../tenants/:tenantKey/sources                  → poll the registry
```

`GET .../sources/discovery-plan` resolves the same city and query plan without running anything, so the ceiling the UI shows comes from the code that will execute rather than a copy of the seed logic in the frontend.

Publishing goes through the curation run's own `ingestEntries`, so discovered events land **staged** (or `draft` when untagged) behind the same human release gate as everything else. Only `published` is feed-eligible, so nothing here can reach a reader without a person releasing it.

### What was added

| File | Change |
|---|---|
| `constants/pivotDiscoverySeeds.js` | **New.** Query templates per tag slug, city-wide probes, event-index path hints, non-source host patterns |
| `schemas/pivotCitySource.js` | **New.** Per-city source registry, unique on `{tenantKey, host}` |
| `schemas/pivotSourceDiscoveryRun.js` | **New.** Narrated run record: counters plus a capped step timeline |
| `services/pivotSourceDiscoveryService.js` | **New.** The pipeline, plus index-URL scoring; publishes qualified sources' events |
| `services/pivotRunGuard.js` | **New.** Shared abort/backoff policy and the bounded-concurrency pool |
| `services/pivotCurationBatchService.js` | **New.** Runs every job for a city as one narrated, rate-limit-aware unit |
| `services/pivotCurationRunService.js` | `ingestEntries` extracted from the run loop so discovery and batches publish identically |
| `services/pivotDiscoveryRunRecorder.js` | **New.** Buffered, failure-safe step recorder; reads runs back by `kind` |
| `services/pivotDiscoveryRehearsal.js` | **New.** Credit-free walkthrough of the pipeline |
| `services/pivotSiteScrapeService.js` | `searchSites` + `mapSite`; error mapping shared across all three endpoints |
| `services/getGlobalModelService.js` | Registers `PivotCitySource` and `PivotSourceDiscoveryRun` |
| `routes/pivotAdminRoutes.js` | `GET .../sources`, `GET .../sources/discovery-plan`, `POST .../sources/discover`, `POST .../sources/rehearse`, `PATCH .../sources/:sourceId`, `GET .../discovery-runs/latest`, `GET .../discovery-runs/:runId`, `POST .../curation-batches`, `GET .../curation-batches/latest`, `GET .../curation-batches/:runId` |
| `migrations/discoverPivotCitySources.js` | **New.** CLI runner with a credit-free plan mode |
| `migrations/setPivotDropTimezone.js` | **New.** Sets `pivotDropTimezone`, which anchors relative-date extraction |
| `frontend/.../PivotTenantSourcesPanel.jsx` | **New.** Registry table, discover trigger, cost preview |
| `frontend/.../PivotDiscoveryConsole.jsx` | **New.** Live decision timeline with `thinking-orbs` animation; renders both run kinds |
| `frontend/.../PivotTenantCurationPage.jsx` | **Refresh all** beside Saved jobs, with a server-derived batch banner and the console |

### Design notes

- **Scope narrowing is addressed structurally, not by prompting.** Queries are generated from `pivotTagCatalogSeed` — one phrasing per slug, interleaved so a `maxQueries` cap trims depth within a category instead of dropping categories off the end. Last week's deck is never an input, so the run cannot converge on what it already found. Coverage is therefore measurable in the same 18-slug taxonomy the feed ranks on.
- **Queries target hosts, not events.** Searching for a recurring venue or organizer yields a calendar that keeps paying off on every later refresh; searching for an event yields a listing that is stale within a week.
- **Rejections are persisted.** A host that yields nothing is written to the registry as `rejected` so later runs skip it. Discovery gets cheaper each pass, which is the property the throwaway-JSON loop never had.
- **Mapping before scraping is a cost decision.** Search returns homepages; a homepage rarely extracts well. One credit of mapping finds `/events` before spending five on extraction, and a host whose site maps to no event-index path is rejected as `no-index-page` without a scrape at all.
- **Native hosts skip qualification.** A discovered Partiful or Luma URL registers under its own provider and is parsed for free, so no credits are spent verifying a source the existing parsers already handle.
- **Cost is bounded before the run starts.** `POST .../sources/discover` returns `plan.maxOutboundCalls` (`queries + maxCandidates × 2`). Fatal failures — bad key, exhausted credits, rate limit — abort the whole run rather than retrying into a wall.
- **Async by necessity.** A run makes tens of outbound calls over several minutes, past any proxy timeout, so the route returns `202` and the registry doubles as the progress record. Rows appear as hosts qualify.
- **Rate limits are waited out, not fatal.** A 429 is refused before Firecrawl does any work, so no credits are consumed and a retry costs only time. `postWithRateLimitRetry` backs off (honouring `Retry-After` when sent — Firecrawl currently sends none) and the run continues. Timeouts and 5xx are *not* retried, since those may already have burned a credit. Sustained throttling is caught by a consecutive-failure streak (`RATE_LIMIT_ABORT_STREAK`), which aborts with a message naming the plan limit as the cause; that is the difference between absorbing a blip and grinding 45 queries against a wall. Searches run at a lower concurrency than the rest of the pipeline because the seed phase is the densest burst in a run.
- **Discovery publishes what it extracted.** `maxEvents` slices the *response* (`drafts: deduped.slice(0, limit)`) and never appears in the Firecrawl request, so a qualifying scrape costs the same whether one event is kept or forty. Discovery therefore takes the whole page and ingests it, rather than discarding events already paid for and making the new job re-extract the identical page. It publishes through the curation run's `ingestEntries`, so there is still exactly one publish path with one set of batch-week, tag, and duplicate rules. A source's curation job is consequently its *refresh* mechanism, not its initial load.
- **Native hosts are the one case that still waits.** Partiful and Luma qualify without a scrape, so discovery holds no events for them. Those jobs are handed to a chained curation batch, which keeps "discover a city" a single action. A failure to queue that batch is reported as a warning and does not fail the discovery run, whose sources are already registered by then.
- **Batch curation is the same orchestration, reused.** `pivotCurationBatchService` runs every enabled job for a city under one record, one timeline, and one rate-limit budget. It does not reimplement crawling: it creates a normal `PivotCurationRun` per job (linked by `parentBatchId`) and calls `executeCurationRun`, so per-job history and the existing per-job UI keep working. Job-level failures are absorbed; only the shared streak breaker stops the batch.

### Running it

**Admin UI.** `PivotTenantSourcesPanel` sits above Saved jobs on the tenant Curation page (`/platform-admin/pivot/:tenantKey`). **Discover** finds and registers sources; **Refresh all** on Saved jobs recrawls them for the week. The panel shows the registry (qualified and rejected, with rejection reasons), a discover trigger with category/threshold options, and the run's cost ceiling from `GET .../sources/discovery-plan` before you commit.

The trigger disables itself when the plan reports `configured: false`, which is how a missing `FIRECRAWL_API_KEY` surfaces in the UI instead of as a run that dies on its first call.

**In-flight runs are server state.** Whether a run is active comes from `GET .../discovery-runs/latest`, not from local component state, so a refresh, a second tab, a closed console, or a run started from the CLI all show the same live banner with phase, counters, calls used against the ceiling, and elapsed time. It also disables the start buttons, since a second concurrent run would spend credits re-covering the same ground.

That endpoint omits the step timeline unless asked (`?includeSteps=true`), because the panel polls it continuously just to answer "is anything running": a summary is ~550 bytes against ~10KB for a full run. The console opts in; the panel does not. Completion is announced once per run id, whichever of the panel or the console notices first.

**Live console.** Starting a run opens `PivotDiscoveryConsole` in a wide popup, which replays the run's decisions as they happen: every search and its yield, every host filtered and why, which URL was chosen as a site's calendar and its score, and each qualify or reject with its event count. A `thinking-orbs` canvas animation tracks the current work — keyed off the most recent step rather than the phase, since qualifying alternates between mapping a site and extracting from it.

This exists because the registry records conclusions, not reasoning: a run that searched 45 queries and rejected everything is indistinguishable from one that aborted on its second call. On a new city, where the seeds are unproven, the reasoning is the part worth reviewing.

### Rehearsal

`POST .../sources/rehearse` walks the pipeline with **no outbound calls** — real city, real seed queries, real ordering and step shapes, example hosts. It writes only a run document: no registry rows, no curation jobs, no events.

It exists so the console can be reviewed before a Firecrawl key exists and before any credits are at stake, which is otherwise impossible: without a key, a real run aborts on its first call and the console stays empty. The fixtures deliberately cover every decision the pipeline can make (qualify, native provider, filtered host, `no-index-page`, `no-events`) so the whole surface is exercised.

Rehearsals live in `pivotDiscoveryRehearsal.js` rather than behind a flag inside `discoverCitySources`. Threading a "pretend" mode through the code that spends money would put a branch that must never fire in production inside the pipeline itself; keeping it separate means a rehearsal cannot accidentally become a real run. The run is flagged `rehearsal: true`, and the console labels it so its counts cannot be mistaken for findings.

**CLI.** `migrations/discoverPivotCitySources.js` needs no auth token and has a plan mode that spends nothing:

```bash
# Query plan only. No database, no API key, no credits.
node migrations/discoverPivotCitySources.js --city="Iowa City" --plan

# Which cities are configured?
node migrations/discoverPivotCitySources.js --list-tenants

# Smallest useful real run.
node migrations/discoverPivotCitySources.js --tenant=ic \
  --tags=live-music --max-candidates=1 --no-jobs

# Full run.
npm run discover:pivot-city-sources -- --tenant=ic
```

`--plan` is the recommended first step on any new city: it prints every query, the categories covered, and the run's `max outbound calls` ceiling before a single credit is spent.

### Still open

- **`FIRECRAWL_API_KEY` is not set in `Meridian/backend/.env`.** Neither `generic-site` nor discovery can do anything until it is; the CLI fails fast with that message rather than queueing doomed work.
- **Nothing is scheduled yet.** Both `POST .../sources/discover` and `POST .../curation-batches` are operator-triggered. **Discover** finds/registers sources (native first, then long tail). **Refresh all** recrawls saved jobs for the week. A monthly discovery pass per city alongside a weekly batch refresh is the intended cadence. Drop-day push does not start either. `pivotCrewWeekStateScheduler` is the pattern to follow *if* crawling is ever put on a timer, but spending Firecrawl credits on a cron is a decision that has not been made — do not wire discovery to drop day.
- **A batch's concurrency is fixed at 2.** It is not derived from the account's rate limit, so a larger plan is under-used and a smaller one still leans on the streak breaker. Making it configurable per tenant is the obvious next step once real limits are known.
- **Run history is unbounded and unpruned.** Every discovery run and rehearsal leaves a document in `pivot_source_discovery_runs`. Individual runs are capped (600 steps), but nothing expires old runs; a TTL index is the obvious fix once the cadence is real.
- **One source per host.** The unique index is `{tenantKey, host}`, so a single hostname cannot hold two calendars. Subdomains count as distinct hosts, which covers the university case, but a site with `/arts` and `/sports` calendars on one host will only ever register the higher-scoring one.
- **Gap-filling is unaddressed.** Movie showtimes and similar always-available inventory still have no provider; that was the SerpApi piece of the original plan.
