# Pivot / Just Go — city source discovery (temporary walkthrough)

> Temporary full-system notes. Safe to delete when you’re done.
> Product name **Just Go**; code name **Pivot**.  
> Deeper design notes: `backend/docs/just-go-agent-scrape-jobs-handoff.md`

---

## 1. What this system is for

Given only a Pivot tenant’s city (`tenantKey`), discovery:

1. Finds recurring event calendars (venues, organizers, alt-weeklies, campus calendars, …)
2. Proves each host actually yields dated events
3. Registers survivors in a **source registry**
4. Creates weekly **refresh jobs** (`generic-site` / Partiful / Luma)
5. **Ingests** the events already scraped during qualification (staged/draft — same human release gate as manual curation)

It replaces a manual CLI-agent loop. Scope is deliberately non-agentic: same tag-catalog seeds every run, findings persist, cost is bounded before start. Long-tail cities are not covered by Partiful/Luma alone; `generic-site` jobs need a URL — discovery chooses those URLs.

---

## 2. System context

```mermaid
flowchart TB
  Admin[Platform admin UI<br/>Curation → Sources] -->|REST /admin/pivot| API[pivotAdminRoutes]
  CLI[discoverPivotCitySources.js] --> Pipe[pivotSourceDiscoveryService]
  API --> Pipe
  API --> Reh[pivotDiscoveryRehearsal]
  Pipe --> Seeds[pivotDiscoverySeeds<br/>tag catalog queries]
  Pipe --> FC[Firecrawl<br/>search / map / scrape]
  Pipe --> Reg[(pivot_city_sources)]
  Pipe --> Runs[(pivot_source_discovery_runs)]
  Pipe --> Jobs[(pivot_curation_jobs)]
  Pipe --> Ingest[ingestEntries]
  Ingest --> Events[(tenant Event)]
  Pipe -->|native jobIds| Batch[pivotCurationBatchService]
  Batch --> Runs
  Batch --> CRuns[(pivot_curation_runs)]
  Batch --> Ingest
```

| Layer | Path |
|-------|------|
| Pipeline | `backend/services/pivotSourceDiscoveryService.js` |
| Firecrawl | `backend/services/pivotSiteScrapeService.js` |
| Seeds | `backend/constants/pivotDiscoverySeeds.js` |
| Registry schema | `backend/schemas/pivotCitySource.js` |
| Run telemetry | `backend/schemas/pivotSourceDiscoveryRun.js` |
| Rehearsal | `backend/services/pivotDiscoveryRehearsal.js` |
| Recorder / stop | `backend/services/pivotDiscoveryRunRecorder.js` |
| Abort pools | `backend/services/pivotRunGuard.js` |
| Jobs | `backend/services/pivotCurationJobService.js` |
| Ingest / per-job runs | `backend/services/pivotCurationRunService.js` |
| Batch refresh | `backend/services/pivotCurationBatchService.js` |
| Routes | `backend/routes/pivotAdminRoutes.js` (mount `/admin/pivot`) |
| CLI | `backend/migrations/discoverPivotCitySources.js` |
| UI | `frontend/.../PivotTenantSourcesPanel.jsx`, `PivotDiscoveryConsole.jsx`, `PivotTenantCurationPage.jsx` |

---

## 3. End-to-end happy path

```mermaid
sequenceDiagram
  participant UI as SourcesPanel
  participant API as pivotAdminRoutes
  participant Rec as DiscoveryRunRecorder
  participant D as discoverCitySources
  participant FC as Firecrawl
  participant DB as Mongo

  UI->>API: GET sources/discovery-plan
  API-->>UI: queries, maxOutboundCalls, configured
  UI->>API: POST sources/discover
  API->>Rec: createDiscoveryRun(status=running)
  API-->>UI: 202 + runId
  API->>D: setImmediate worker

  loop poll (panel 4s / console 1.2s)
    UI->>API: GET discovery-runs/latest or :runId
  end

  D->>FC: search × queries
  D->>FC: map + scrape × candidates
  D->>DB: upsert PivotCitySource
  D->>DB: create PivotCurationJob
  D->>DB: ingestEntries → tenant Events
  D->>DB: optional curation-batch for native hosts
  D->>Rec: finish(completed|failed)
```

**Async contract:** API returns immediately; UI polls a narrated run document. There is no SSE. Closing the console does **not** stop the run.

---

## 4. Discovery plan (before any spend)

**Functions:** `buildCityDiscoveryPlan` → `previewCitySourceDiscovery` / `startCitySourceDiscovery`  
**Route:** `GET /admin/pivot/tenants/:tenantKey/sources/discovery-plan`  
**Seeds:** `buildDiscoveryQueries` in `pivotDiscoverySeeds.js` (from tag catalog — ~18 slugs)

### Inputs

| Option | Default | Role |
|--------|---------|------|
| `tenantKey` | required | City |
| `tags` | all catalog slugs | Filter queries; unknown-only → empty → `NO_DISCOVERY_QUERIES` |
| `maxQueries` | none | Cap after interleave |
| `maxCandidates` | `20` | Map+scrape budget |
| `minEvents` | `1` | Qualify threshold |
| `resultsPerQuery` | `8` | Search page size (live) |
| `createJobs` | `true` | Create refresh jobs for qualified hosts |
| `recheckRejected` | `false` | Re-evaluate previously rejected hosts |
| `ingestEvents` / `chainNativeJobs` | `true` | CLI can disable with `--no-ingest` |

### Query generation

1. **City-wide** templates first (`CITY_WIDE_QUERY_TEMPLATES` × city name)  
   e.g. `"Iowa City events calendar this week"`
2. Then **interleaved tag** templates (`TAG_QUERY_TEMPLATES`) so `maxQueries` trims depth, not whole categories  
   e.g. `"live music ${city}"`

City display / location / timezone come from the tenant (`name`, `location`, `pivotDropTimezone` via `resolvePivotTenant`).

### Cost ceiling

```
maxOutboundCalls = queries.length + maxCandidates * 2
```

(one search per query + map + scrape per candidate upper bound)

**Prerequisite:** `FIRECRAWL_API_KEY` → `isSiteScrapeConfigured()`. Without it, real Run is disabled / API returns `SITE_SCRAPE_NOT_CONFIGURED` (503); Rehearse still works.

---

## 5. Live pipeline stages

Worker: `startCitySourceDiscovery` → `createDiscoveryRun` → `scheduleCitySourceDiscovery` → `discoverCitySources`.

**Concurrency:** search `2`, qualify `4`  
**Map link limit:** `60`  
**Step flush / cancel poll:** `400ms`  
**Max steps on run doc:** `600`

```mermaid
flowchart LR
  Plan[buildDiscoveryQueries] --> Search[searchSites × queries]
  Search --> Filter[skip known / non-source / SSRF]
  Filter --> Qual{native host?}
  Qual -->|Partiful / Luma| RegQ[persist qualified]
  Qual -->|generic-site| Map[mapSite]
  Map --> Pick[pickEventIndexUrl]
  Pick -->|none| Rej1[reject no-index-page]
  Pick -->|ok| Scrape[scrapeSiteEvents]
  Scrape -->|dated drafts ≥ minEvents| RegQ
  Scrape -->|else| Rej2[reject reason]
  RegQ --> Job[createCurationJob]
  Job --> Ing{have entries?}
  Ing -->|yes| Publish[ingestEntries]
  Ing -->|native, no entries| Chain[startCurationBatch]
```

### Stage A — searching (`phase: searching`)

| | |
|---|---|
| Fn | `collectCandidates` → `searchSites` |
| API | Firecrawl `POST /v2/search` |
| Steps | `plan`, `search` (+ `retry` on 429) |
| Writes | Run counters only (`searches`, `candidatesFound`) |
| Outcome | host → `{ host, url, title, seedTags, discoveredVia }` |

### Stage B — filtering (`phase: filtering`)

| | |
|---|---|
| Steps | `candidates`, then `filter` per skip |
| Skip if | non-source / blocked host / bad URL / already in registry (unless `recheckRejected` + was rejected) |
| Sort | More `seedTags` first; slice to `maxCandidates` |
| Counters | `skippedKnown`, `skippedNonSource`, `evaluated` |
| Writes | None to registry |

### Stage C — qualifying (`phase: qualifying`)

| | |
|---|---|
| Fn | `qualifyCandidate` via `runPool` (concurrency 4) |
| **Native** (Partiful/Luma) | Skip Firecrawl; step `native`; `eventCount: 0`, no entries — batch will crawl later |
| **Generic** | `mapSite` → `pickEventIndexUrl` / `scoreEventIndexUrl` → step `index` → `scrapeSiteEvents` |
| Success | Dated drafts (`draft.start_time`) ≥ `minEvents` → step `qualify`, carry `entries` |
| Reject | `no-index-page`, `scrape-failed`, `no-events`, `below-threshold` |
| Abort whole run | Fatal Firecrawl codes or rate-limit streak ≥ 4 → step `abort` |

Index scoring favors paths like `events`, `calendar`; penalizes deep paths, dated paths, query strings.

### Stage D — registering (`phase: registering`)

| | |
|---|---|
| Fn | `persistOutcome` → upsert `PivotCitySource` |
| Qualified | `createCurationJob` (`defaultBatchWeekStrategy: 'next-drop'`, `defaultTags: seedTags`) → `curationJobId`; step `job` |
| Native w/ job, no entries | Collect `nativeJobIds` for batch chain |

### Stage E — ingest

| | |
|---|---|
| Fn | `ingestEntries` (`pivotCurationRunService`) |
| When | Qualified + scraped `entries` + ingest not disabled |
| Steps | `ingest` |
| Data | Tenant `Event` upserted on `customFields.pivot.sourceUrl`; tags from `seedTags`; week from event start (fallback `next-drop`) |
| Status | Staged (untagged → draft); never feed-published without human release |
| Failure | Warn step; source still registered |

### Stage F — optional native batch

| | |
|---|---|
| Fn | `startCurationBatch({ jobIds: nativeJobIds, batchWeek })` |
| Kind | Separate run doc `kind: 'curation-batch'` (same collection) |
| Failure | Warn only; discovery can still `completed` |
| End | Step `done` |

---

## 6. Firecrawl / site scrape layer

**File:** `backend/services/pivotSiteScrapeService.js`

| Export | Endpoint | Notes |
|--------|----------|-------|
| `searchSites` | `/v2/search` | ~30s; metadata; `location` from tenant |
| `mapSite` | `/v2/map` | ~30s; `includeSubdomains: true`; optional search hint |
| `scrapeSiteEvents` | `/v2/scrape` | ~90s; `waitFor: 3000`; JSON + `SITE_EVENT_SCHEMA` + extraction prompt |
| Shared | `postWithRateLimitRetry` | up to 3 attempts; honors Retry-After |
| Ceiling | `MAX_SITE_EVENTS_CEILING = 250` | Slice on response |

Drafts built via `buildSiteEventDraft` / `resolveDraftSourceUrl` — same shape as Partiful/Luma (`source: 'generic-site'`, …). Stable `#slug-date` if no per-event URL.

**Rough credit model (handoff):** search ~1/query; map 1/host; scrape+JSON extract ~5/host.

---

## 7. Source registry

**Model:** `PivotCitySource` → `pivot_city_sources` (global DB)  
**Unique:** `{ tenantKey, host }` (`www.` stripped; subdomains distinct)

| Field | Notes |
|-------|--------|
| `url` | Best **event-index** URL, not homepage |
| `label` | From scrape `listLabel` or search title |
| `provider` | `partiful` \| `luma` \| `generic-site` |
| `status` | `qualified` \| `rejected` |
| `rejectedReason` | `no-events`, `below-threshold`, `scrape-failed`, `no-index-page`, `blocked-host` |
| `enabled` | Mute refresh without looking like a discovery failure |
| `seedTags` | Catalog slugs whose queries found the host |
| `discoveredVia` | Winning query string |
| `lastEventCount`, `lastQualifiedAt` | Yield history |
| `curationJobId` | Linked refresh job |

**Admin API:** `GET .../sources`, `PATCH .../sources/:sourceId` (Mute/Enable only)  
**UI:** Sources table on the Discovery agent strip / Sites section.

Persisted rejects come from qualify. Filter skips private/non-source hosts without writing a rejected row.

---

## 8. Jobs, ingest, and curation-batch

```mermaid
flowchart TB
  QG[Qualified generic-site] --> Reg1[PivotCitySource + job]
  Reg1 --> Ing1[ingestEntries from qualify scrape]
  QN[Qualified Partiful/Luma] --> Reg2[PivotCitySource + job]
  Reg2 --> Batch[startCurationBatch]
  Batch --> Run[executeCurationRun]
  Run --> Preview[previewIngestUrl native]
  Preview --> Ing2[ingestEntries]
  Manual[Curation page Run all] --> Batch
```

| Store | Role |
|-------|------|
| `pivot_curation_jobs` | Refresh jobs (`partiful` \| `luma` \| `manual-json` \| `generic-site`) |
| `pivot_curation_runs` | Per-job crawl history (`parentBatchId` when batched) |
| `pivot_source_discovery_runs` | Narration for `kind: discovery` **and** `kind: curation-batch` |
| Tenant `Event` | Catalog; `customFields.pivot.*` |

Discovery’s job is **ongoing refresh**. Initial generic-site events come from the **qualifying scrape**, not a second crawl. Manual “Run all” on the curation page uses the same batch API without discovery.

Batch orchestration: `BATCH_CONCURRENCY = 2`; phases `planning → crawling → done`; steps `job-start` / `job-done`.

---

## 9. Data model

```mermaid
erDiagram
  PivotCitySource ||--o| PivotCurationJob : curationJobId
  PivotSourceDiscoveryRun ||--o{ step : timeline
  PivotCurationJob ||--o{ PivotCurationRun : jobId
  PivotSourceDiscoveryRun ||--o{ PivotCurationRun : parentBatchId
  PivotCurationRun ||--o{ Event : publishes
  PivotCitySource {
    string tenantKey
    string host
    string status
    string provider
    string rejectedReason
    bool enabled
  }
  PivotSourceDiscoveryRun {
    string kind
    bool rehearsal
    string status
    string phase
    bool cancelRequested
    object plan
    object counters
  }
```

**Run kinds:** `discovery` \| `curation-batch`  
**Statuses:** `running` \| `completed` \| `failed` (cancel → `failed` + `aborted.code: 'CANCELLED'`)  
**Discovery phases:** `searching → filtering → qualifying → registering → done`  
**Batch phases:** `planning → crawling → done`

**Step kinds:** `plan`, `search`, `candidates`, `filter`, `native`, `map`, `index`, `scrape`, `retry`, `qualify`, `reject`, `job`, `ingest`, `job-start`, `job-done`, `abort`, `done`  
**Tones:** `info` \| `good` \| `warn` \| `bad`

Telemetry rule: the pipeline does not read the run doc for control flow except via the **cancel watch**. Steps are narration for humans/UI.

---

## 10. Run orchestration (async + stop)

```mermaid
flowchart LR
  A[POST discover / rehearse] --> B[createDiscoveryRun]
  B --> C[202 + runId]
  B --> D[Background worker]
  D --> E{rehearsal?}
  E -->|yes| F[playRehearsal]
  E -->|no| G[discoverCitySources]
  F --> L[buffered steps]
  G --> L
  L --> M[flush every 400ms]
  N[POST stop] --> O[Immediate finalize failed + CANCELLED]
  O --> P[cancelRequested=true]
  P --> Q[watch → worker bail]
  Q --> R[finish only if still status=running]
  O --> R
```

| Concern | Behavior |
|---------|----------|
| Start | Recorder created **before** worker so UI can poll immediately |
| Poll | Panel: latest **without** steps, 4s live / 30s idle. Console: by `runId` or latest+steps, ~1.2s |
| Stop | HTTP handler **finalizes immediately**; worker watch (400ms) aborts in-flight work |
| Finish race | `updateOne({ _id, status: 'running' }, …)` — cannot overwrite a stopped run |
| Rehearsal pace | `STEP_DELAY_MS = 1200` + interruptible ~200ms sleeps |

Closing the Watch console ≠ Stop. Stop swaps in for Run on the agent strip while `latestRun.status === 'running'`.

---

## 11. Rehearsal

**File:** `pivotDiscoveryRehearsal.js` — separate module so it cannot become a live spend path.  
**Route:** `POST .../sources/rehearse` → 202

| Simulates | Skips |
|-----------|-------|
| Real city, real `buildDiscoveryQueries`, same phases/step kinds | All Firecrawl |
| Fixture hosts (qualify / native / filter / rejects) | Registry writes |
| Paced narration (~40s full run) | Jobs, events, credits |
| `rehearsal: true`, `maxOutboundCalls: 0` | |

Registering steps say “Would save a job…” — nothing persists.

---

## 12. Frontend surfaces

| Surface | Role |
|---------|------|
| **Curation page** | Hosts Sources panel above Saved jobs; “Run all” → curation-batches; shares console for batch Watch |
| **Discovery agent strip** | Run / Rehearse / Stop / Watch · Configure (tags, caps, jobs, recheck) · Sites table Mute/Enable · plan cost preview |
| **Discovery console** | Popup step timeline + orb; works for `discovery` and `curation-batch` |
| **Saved jobs** | Includes jobs discovery created; manual “Website (scraped)” = `generic-site` |

Discovered sources show up as registry rows + new jobs + staged catalog events — not a separate product page.

---

## 13. CLI

```bash
# from Meridian/backend
node migrations/discoverPivotCitySources.js --city="Iowa City" --plan
node migrations/discoverPivotCitySources.js --list-tenants
node migrations/discoverPivotCitySources.js --tenant=ic --tags=live-music --max-candidates=1 --no-jobs --no-ingest
npm run discover:pivot-city-sources -- --tenant=ic
```

Flags: `--plan`, `--tags`, `--max-queries`, `--max-candidates`, `--min-events`, `--no-jobs`, `--no-ingest`, `--recheck-rejected`  
Calls `discoverCitySources` synchronously (no HTTP 202). No scheduler yet (handoff intends monthly discovery / weekly batch).

---

## 14. Config checklist

| Need | Why |
|------|-----|
| `FIRECRAWL_API_KEY` | Live discovery + `generic-site` scrapes |
| Pivot tenant (`pivot` / `pivotPilot`) | `tenantKey`, city `name`, `location`, `pivotDropTimezone` |
| Platform admin auth | UI/API |
| Mongo global + tenant DBs | Registry / runs / jobs global; Events per tenant |

Without the key: UI pushes Rehearse; API 503 on discover; CLI fails fast unless `--plan`.

---

## 15. API cheat sheet

| Method | Route | Result |
|--------|-------|--------|
| `GET` | `.../sources/discovery-plan` | Plan + cost + `configured` |
| `POST` | `.../sources/discover` | **202** `{ runId, plan }` → live worker |
| `POST` | `.../sources/rehearse` | **202** → paced fixture |
| `POST` | `.../discovery-runs/:runId/stop` | Immediate finalize + cancel |
| `GET` | `.../discovery-runs/:runId` | Full run + steps |
| `GET` | `.../discovery-runs/latest` | Latest; `?includeSteps=true` |
| `GET` / `PATCH` | `.../sources` (+ `/:sourceId`) | Registry list / Mute |

---

## 16. How to exercise it

1. Open `/platform-admin/pivot/:tenantKey` (Curation) as platform admin.
2. **Configure** tags / caps / createJobs / recheckRejected; glance at plan cost.
3. **Rehearse** — no Firecrawl; watch the console timeline.
4. **Stop** mid-rehearse — panel should leave running immediately.
5. **Run** (with `FIRECRAWL_API_KEY`) — watch search → filter → map/scrape → qualify → job → ingest.
6. Confirm: registry row, Saved job, staged events in the catalog; native hosts may spin a curation-batch.

---

## One-liner

Discovery turns a city into a durable source registry + refresh jobs + staged events by searching seed queries, proving calendars via Firecrawl map/scrape (or recognizing native hosts), then registering and ingesting — all narrated on a polled run document that Stop can finalize instantly without racing the worker.
