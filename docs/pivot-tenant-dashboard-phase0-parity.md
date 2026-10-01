# Pivot tenant dashboard: Phase 0 parity baseline

This is the baseline for the planned dashboard redesign. It describes the
current operator capabilities and route contract; it does not authorize
removing a page or an action. Later phases may reorganize the UI only after
the corresponding capability has an equivalent, verified destination.

## Access and scope

- The fleet route is `/platform-admin/pivot`; the city route is
  `/platform-admin/pivot/:tenantKey`. Both sit under `PlatformProtectedRoute`
  in `frontend/src/App.js`. City entry also verifies that `tenantKey` exists
  and is a Pivot tenant. Platform-admin API routes retain their server-side
  authorization; changing navigation must not become an access-control change.
- The city switcher preserves `?page=` for city-to-city navigation and maps
  shared fleet/city destinations by identity. Fleet pages are Overview `0`,
  Voice `1`, Launch `2`, Compute jobs `3`, Analytics `4`, Notifications `5`.
- The city route still uses numeric `?page=` URLs. Stable named identities and
  their legacy numbers are in `pivotTenantPageRoutes.js`. Index `7` belongs
  to Location migration even when its UI flag is off. A disabled migration
  bookmark returns to Curation, preserving query context; later indexes do
  not shift. No visible menu entry is added while the flag is off.
- `batchWeek` is a drop-cycle ISO week on the weekly pages; Analytics uses
  a UTC `month`. These periods and their metric definitions are distinct.
- `REACT_APP_ENABLE_RICH_LOCATION_MIGRATION_UI=true` is required for the
  Location migration UI and its data requests. Its rollout controls are
  separate from this build flag.

## City route and capability inventory

The source files named below are the current behavior reference. Each row is
an acceptance checklist for its later feature phase, including controls that
are easy to overlook when moving a page.

| Identity / legacy page | Current controls and state that must survive | Data and side effects | Current owner |
| --- | --- | --- | --- |
| `overview` / `0` | City and batch week context; refresh; next-drop schedule; compact readiness and its action links; active-user and retention trends; week pulse; catalog and host-created mix; weekly funnel; engagement and circle metrics; top events; tag radar; issue links. | Reads city ops, tags, retention, performance, insights, and circle data. No direct mutation. | `PivotTenantOverviewPage.jsx`, `PivotOverviewPanels.jsx`, `PivotReadinessCard.jsx` |
| `curation` / `1` | Batch week, stage and live-week anchors; refresh, export JSON, force-review-week, Explore preview, publish week; live alert, monitor, drop status and readiness; source discovery/configuration; source health, evidence refresh, source creation, ranking tiers/mute, event history and scrape-learning controls; saved-job create/edit/delete/run/refresh with catalog-source linkage; URL/manual/JSON import and preview; tag radar; queue search/filter/select; event inspector, edit and delete; individual and bulk draft/stage/publish/unpublish, tags, tag suggestions, rich-data enrichment, showtime collapse, featured state, editorial weighting, exact-set selection; out-of-range and full-week purge. | Reads `/admin/pivot/tenants/:key/ops`, tags, and source evidence. Writes source, source-learning, curation-job, ingest, batch release/unrelease/selection-policy, compute-job, and purge routes. Some actions are destructive or publish to users. | `PivotTenantCurationPage.jsx`, `PivotTenantSourcesPanel.jsx`, `PivotSourceIntelligence.jsx`, `PivotCurationQueue.jsx` and import/edit dialogs |
| `journeys` / `2` | Batch week and refresh; weekly snapshot and two funnel representations; search/active-user list; selected user's history, intents, analytics and deck replay; link to Curation; wipe interactions for the selected week. | Reads city ops and `/journeys/users`, `/history`, `/deck-replay`; wipe writes `/users/:id/wipe-week`. | `PivotTenantJourneysPage.jsx` |
| `dropDeck` / `3` | User search; app-week or selected-week deck preview; frozen versus live rebuild view; score breakdown and intent state; edit soft/hard length, leeway, floor, friend/crew/personal/negative/source and source-quality weights; inspect formula; review/save, discard, reset defaults. | Reads `/journeys/users` and `/drop-deck/preview`; writes tenant `pivotDeckConfig` through `/admin/platform/tenants/:key`. | `PivotTenantDropDeckPage.jsx`, `PivotTenantDropDeckInspector.jsx` |
| `catalog` / `4` | Organizer search/sort/claim/source filters; ambiguous and unlinked views; backfill; merge proposals and manual merge; organizer detail, identities, events by week; unlinked event links to Curation; showtime-rollup preview and apply. | Reads `/organizers`, `/organizers/:id`, `/organizers/unlinked`; writes organizer backfill/merge and showtime-collapse routes. | `PivotTenantCatalogPage.jsx`, `PivotTenantCatalogOps.jsx` |
| `voice` / `5` | Search and family/group browsing; overridden/interpolator/token filters; per-key editor, sample interpolation preview, shipped/platform/tenant/effective layers; review/save and reset to parent. The same editor is embedded in Carousel for static copy. | Reads the voice catalog and layers; writes city copy overrides. | `PivotVoicePage.jsx`, `carousel/PivotCarouselVoicePanel.jsx` |
| `launch` / `6` | Landing-mode waitlist/launched switch; traffic, conversion, source and QR attribution; paged waitlist, CSV export and row removal; copy/open public URL; QR management. Waitlist contact data stays restricted to this workflow. | Reads `/launch` and `/waitlist`; writes `/landing-mode`, waitlist deletion, and QR routes. | `PivotTenantLaunchPage.jsx`, `PivotLandingQrManager.jsx` |
| `locationMigration` / `7` | Feature-gated week coverage and heatmap; provider/config warnings; city-boundary lookup and save; dry-run preview and confirmed batch processing; candidate review decisions; master rollout and individual capability switches; emergency rollout-off action. | Reads `/rich-location-migration`, `/reviews`, `/heatmap`; writes boundary, run, review, and tenant configuration routes. | `PivotTenantLocationMigrationPage.jsx`, `PivotLocationReviewInspector.jsx` |
| `carousel` / `8` | Library create/open/archive/delete; account and edition selection; issue/slide editing, images, curation draft selection including curated groups and related-event proposals, static copy, save/reload, export/download and job status. Account-specific draft recovery and both legacy and Studio issue versions remain supported. | Reads/writes city carousels and `/admin/pivot/carousel-accounts` resources; export uses compute jobs. | `carousel/PivotCarouselPage.jsx` and its editor/library/Studio components |
| `notifications` / `9` | Batch week; accepted/failed/dry-run activity; live audience and eligible-user list; recent and legacy sends with recipient inspection; schedule create/edit/delete, enable/pause, default restoration, per-city overrides, history/audit, eligibility preview, enqueue, manual push preview and send. | Reads/writes `/admin/meridian/jobs` definitions and runs plus `/admin/platform/tenants/:key/pivot-weekly-drop`. Sending has an external effect. | `PivotNotificationsPage.jsx`, `PivotFleetNotificationsPage.jsx`, `PivotWeeklyDropPage.jsx`, definition/audit editors |
| `computeJobs` / `10` | Active/review/recovery/completed counts; worker diagnostic; new run; queue status/kind filters; selected-job execution, results, attempts, application audit and recovery actions; review/apply workflow. | Reads/writes `/admin/pivot/compute-jobs`; jobs can originate in Curation, discovery, or Carousel. | `PivotComputeJobs.jsx`, `PivotComputeJobReview.jsx` |
| `analytics` / `11` | UTC month picker and refresh; stage counts, landing-to-deck funnel, step drop-off, and counting notes. | Reads `/admin/pivot/analytics/acquisition`; no direct mutation. | `PivotTenantAnalyticsPage.jsx` |
| `coverLab` / `12` | Development-only design direction, studies/grid layout, cover preview, shortlist, round navigation. The shortlist is browser-local. Outside development this reserved bookmark returns to Carousels. | Local browser state; no city API mutation. | `carousel/PivotCoverLab.jsx` |

## URL state and cross-links

Preserve these URL parameters, including when a link crosses from one page to
another or switches cities. The week/selection must resolve to the same record
after refresh and browser Back/Forward.

| Parameters | Current destination and use |
| --- | --- |
| `page`, `tenantKey` | City/fleet shell selection and bookmarked page. |
| `batchWeek`, `filter`, `source`, `eventId` | Curation week, queue view, and selected event. |
| `batchWeek`, `userId` | Journey history and Drop deck user preview. |
| `organizerId`, `q`, `claimStatus`, `source`, `sort`, `filter` | Organizer detail and list views. |
| `deckId`, `curation`, `account` | Carousel issue and curation workspace. |
| `computeJobId`, `computeStatus`, `computeKind` | Compute job selection and queue filters. |
| `jobRunId`, `batchWeek` | Notification run inspection. |
| `month` | Analytics acquisition period. |

Links from fleet Launch, fleet Notifications, Tenant Management, event
inspectors, Carousel export, readiness cards, and the city switcher depend on
these city page numbers. The separate signed Carousel export frame route is
outside the platform-admin guard by design and is not part of the city menu.

## Parity gate for every later phase

1. Map each control in the affected inventory rows to a destination and
   confirm the same read/write result, validation, confirmation, and error
   handling. Do not remove an API route or data field merely because a widget
   moves.
2. Exercise direct links, refresh, Back/Forward, city switching, and feature
   flag on/off with the legacy `?page=` indexes and all affected query params.
3. Verify platform-admin and Pivot-tenant gates, plus the existing safeguards
   for destructive actions, external sends, publication, and rollout changes.
4. Verify the new view against the old view before retiring the old presentation.
   A missing destination blocks cutover. Keep redirects for old bookmarks.

Phase 0 changes only the route stability mechanism and this baseline. It does
not change the dashboard layout, remove a control, or alter an API response.
