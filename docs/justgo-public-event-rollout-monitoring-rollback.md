# Just Go public event rollout, monitoring, and rollback

Review date: 2026-08-27

This runbook covers `https://justgo.lol/events/:eventId`, its public API and language endpoint, association files, native sharing/link routing, and acquisition analytics. Public errors must remain generic throughout rollout and rollback.

## Release posture

Do not begin rollout until the blockers in `justgo-public-event-release-checklist.md` are cleared: live apex validation, production Android app-signing fingerprints, and the standalone Just Go iOS store URL.

Use one release identifier across backend, frontend build, CDN, and dashboards. Record the Events-Backend pinned SHA and both mobile build numbers with it. Never put event title, description, venue, organizer, registration URL, attendee data, authentication state, IP address, user agent, Mongo URI, or raw exception text in a dashboard label or alert.

## Rollout stages

### 0. Preflight

- Verify both association files, one eligible future event, one eligible ended event, and one deliberately unavailable ID from outside the production network.
- Confirm the frontend build contains the standalone Just Go App Store and `app.justgo` Play Store destinations.
- Confirm API and language ETags, cache headers, 304 behavior, rate-limit headers, crawler HTML, canonical URL, JSON-LD, noindex unavailable HTML, and privacy-safe bodies.
- Save baseline values for API traffic, unavailable rate, app-open attempts, store clicks, and existing Just Go native shares for at least one comparable traffic window.
- Create the dashboards and alerts below before exposing shared URLs.

### 1. Internal links only

Deploy backend and web without publishing event links broadly. Exercise a small allowlisted set of eligible events through direct URLs. Hold for at least 30 minutes and one cache-expiry cycle.

Advance only if there are no collisions, association failures, privacy regressions, or sustained API/language errors, and crawler HTML matches the API representation.

### 2. Limited sharing

Enable native sharing for internal/test accounts or one low-risk city cohort. If account gating is unavailable, distribute links manually rather than adding a new public feature flag. Hold for at least 24 hours.

Review matching-city and different-city routes, unavailable rates by source (`share` versus `direct`), app-open attempts, store destinations, and duplicate analytics.

### 3. Graduated exposure

Expand by operationally controllable city cohorts or release channels: 10%, 25%, 50%, then 100%. Do not partition by raw event ID in logs or analytics. Hold each stage for a full peak traffic period; collisions or privacy failures stop advancement immediately.

Mobile association declarations include both apps and are cached by platforms, so do not use association-file removal as a routine percentage rollout mechanism.

### 4. General availability

Publish share controls broadly only after the full device/link-preview matrix passes. Keep heightened alerts for seven days and review conversion and unavailable baselines daily.

## Current signals

### Server logs and headers

The backend currently emits:

- `[public-event] resolution completed` with opaque `eventKey`, internal `outcome`, resolved tenant for successful internal telemetry, and `durationMs`.
- `[public-event] tenant lookup failed` with opaque `eventKey`, configured tenant key, and bounded error class.
- `[public-event] resolution failed`, `[public-event] route failed`, and `[public-event] language route failed` with an error class, never an error message or event document.
- `[mobile-associations] Android release fingerprints are not configured` for fail-closed Android association configuration.
- `X-Public-Event-Cache: hit|miss|coalesced`, cache directives, ETag, rate-limit headers, and stable 404/429/503 codes at the HTTP edge.

Allowed resolution outcomes are `resolved`, `malformed_id`, `no_match`, `ineligible`, `collision`, `incomplete`, and `tenant_limit_exceeded`. Public responses must never include these internal outcomes.

### Analytics events

| Event | Allowed properties |
| --- | --- |
| `justgo_public_event_view` | `event_id`, `source`, `platform` |
| `justgo_public_event_share` | `event_id`, `source=native_event_detail` |
| `justgo_public_event_app_open_attempt` | `event_id`, `source`, `platform` |
| `justgo_public_event_app_store_click` | `event_id`, `source`, `platform`, `store=ios` |
| `justgo_public_event_google_play_click` | `event_id`, `source`, `platform`, `store=android` |

Dashboards should aggregate event IDs and restrict raw-ID drill-down to incident responders. Do not join these events to attendee, profile, auth, contact, or cross-site identity data.

## Dashboard and query definitions

The syntax below is vendor-neutral pseudocode. Translate field names at ingestion, but preserve the dimensions and privacy restrictions.

### Dashboard A: public API health

Panels:

- request rate by endpoint and status class;
- p50/p95/p99 latency for event and language endpoints;
- 404, 429, and 503 rates separately;
- `X-Public-Event-Cache` hit/miss/coalesced ratio;
- resolution duration by outcome;
- tenant lookup failure count by error class;
- collision, incomplete, and tenant-limit counts.

```text
logs | where tag = "[public-event]" and message = "resolution completed"
     | summarize count(), p50(durationMs), p95(durationMs), p99(durationMs)
       by outcome, bin(timestamp, 5m)

http | where path matches "^/api/public/events/[0-9a-f]{24}(/language)?$"
     | summarize count(), p95(duration_ms)
       by route_template, status, response_header.X-Public-Event-Cache, bin(timestamp, 5m)

logs | where tag = "[public-event]" and
             message in ("tenant lookup failed", "resolution failed", "route failed")
     | summarize count() by message, errorName, bin(timestamp, 5m)
```

### Dashboard B: rendering, SEO, and unavailable behavior

Panels:

- event HTML status/cache class versus API status;
- indexable versus noindex event HTML;
- generic unavailable HTML volume;
- crawler response latency/error rate;
- association endpoint status, content type, body validation, and redirect count from an external synthetic monitor.

```text
http | where route_template = "/events/:eventId"
     | summarize count(), p95(duration_ms) by status, robots_class, cache_class, bin(timestamp, 5m)

synthetics | where check in ("aasa", "assetlinks", "future_event_html",
                             "ended_event_html", "unavailable_event_html")
           | summarize success_rate(), p95(duration_ms) by check, region, bin(timestamp, 5m)
```

`robots_class` and `cache_class` should be derived at the edge from response headers/body classification, not by logging event content.

### Dashboard C: dynamic language

Panels:

- language endpoint request/503/latency rate;
- override-pack resolution/cache failures;
- shipped-fallback activations by semantic key;
- missing or malformed key count by product/city configuration revision.

```text
http | where route_template = "/api/public/events/:eventId/language"
     | summarize count(), error_rate(status >= 500), p95(duration_ms)
       by status, bin(timestamp, 5m)

copy_metrics | where product = "justgo" and surface = "public_event"
             | summarize count() by result, semantic_key, config_revision, bin(timestamp, 15m)
```

Instrumentation gap: `copy_metrics` is not emitted today. The current route error log distinguishes total language failures, while malformed/missing overrides silently fall back correctly. Add a bounded counter with only `semantic_key`, `result` (`override|shipped_fallback|invalid_override`), product, city configuration identifier, and revision before claiming per-key monitoring. Never log override text.

### Dashboard D: acquisition and routing funnel

Panels:

- native shares;
- public views by `source` and platform;
- app-open attempts per view;
- App Store and Play Store clicks per attempt;
- inferred installed-app-open remainder;
- native public-link arrivals and matching-city/different-city/unavailable outcomes;
- web-to-app conversion by platform and source.

```text
analytics | where event_name starts_with "justgo_public_event_"
          | summarize unique_events=count()
            by event_name, source, platform, store, bin(timestamp, 1h)

views       = count("justgo_public_event_view")
attempts    = count("justgo_public_event_app_open_attempt")
store_click = count("justgo_public_event_app_store_click") +
              count("justgo_public_event_google_play_click")
attempt_rate = attempts / views
store_fallback_rate = store_click / attempts
```

Instrumentation gap: there is currently no native `public_link_arrived`, successful app-open acknowledgment, or gate-outcome event. Therefore installed-app success and true web-to-app conversion cannot be measured reliably; `attempts - store_clicks` is only an inference and must be labeled as such. Add one privacy-safe native arrival event with `source`, `platform`, and `outcome` in `matched_city|city_mismatch|unavailable`, plus an opaque eligible event ID only when already allowed, before publishing a definitive conversion dashboard.

## Initial alert policy

Tune thresholds after seven days of baseline data; the initial values favor privacy and correctness over availability.

| Signal | Warning | Page / stop rollout |
| --- | --- | --- |
| Eligible API p95 latency | >1.0 s for 10 min | >2.0 s for 10 min |
| Event/language 5xx rate | >1% for 10 min and ≥20 requests | >3% for 5 min and ≥20 requests |
| Collision | none | any new collision; immediate data-integrity incident |
| `tenant_limit_exceeded` | none | any occurrence |
| Incomplete/tenant failure | >0.5% for 15 min | >2% for 10 min |
| 429 rate | >2% for 15 min | >10% for 10 min; investigate abuse versus limiter sizing |
| Unavailable rate | >10 percentage points above source/platform baseline | >20 points or 2× baseline for 15 min |
| Missing/invalid language key | any new key/revision | sustained >0 after configuration rollback window |
| Association synthetic | one failed region | any two consecutive failures or redirect/content mismatch |
| Store destination | — | any campus package/listing detected on Just Go surface |
| Analytics duplicate view | >1.02 views per page-render session sample | >1.10; halt attribution decisions |
| Store fallback rate | >20% relative increase from platform baseline | >50% increase for 30 min; possible app-link failure |

Never alert on a single public event title or raw description. Collision investigation may use opaque `eventKey` and restricted tenant keys internally.

## Incident triage

1. Identify the failing layer: association, HTML rendering, event API, language API, cross-city resolution, web CTA/store, mobile gate, or analytics.
2. Compare release ID and onset time. Check whether failures are global, city configuration-specific, platform-specific, or share-source-specific.
3. For API incidents, split 404, 429, and 503. Do not treat generic unavailable responses as proof that an event is missing.
4. For collision/incomplete outcomes, use the opaque digest to run a restricted server-side investigation. Do not expose the cause in the public response or customer-facing tooling.
5. For language incidents, verify configuration revision and shipped fallback behavior. Roll back the copy pack before rolling back the whole page when fallbacks remain safe.
6. For app-link incidents, verify association synthetics, signing identity, mobile build, browser/platform, and store destination. Do not remove association paths impulsively because platform caches can make the rollback inconsistent.

## Rollback matrix

| Failure | First rollback | Full rollback trigger |
| --- | --- | --- |
| Bad language override or missing key | Revert platform/city copy revision; shipped defaults remain active | Language endpoint or fallback resolver returns unsafe/broken content |
| Wrong store URL | Correct build-time/mobile store configuration and redeploy web; pause link promotion | Campus listing is reachable from a Just Go CTA |
| Web layout/metadata regression | Roll back frontend/server HTML release together | User content leaks, canonical/noindex is wrong, or crawlers receive unsafe markup |
| API latency/error spike | Reduce promotion, purge poisoned edge entries, roll back backend while retaining generic unavailable behavior | Sustained page threshold or partial failures produce uncertain uniqueness |
| Collision or tenant-limit signal | Stop rollout and invalidate affected safe-envelope caches; repair routing/data | Any collision exposed as eligible or uniqueness cannot be established |
| Association failure | Restore last known-good declarations and fingerprints | Wrong app/package/team/signing identity or redirects on association paths |
| Mobile route regression | Pause native sharing via the existing release/config channel if available; keep web pages usable | Wrong city opens, automatic city switch, crash, or wrong event detail |
| Analytics duplication/schema leak | Disable only new analytics emission or roll back frontend/mobile analytics change | Disallowed property, persistent identifier, or materially misleading funnel data |

### Full backend/web rollback sequence

1. Stop expansion and announce the affected release ID internally.
2. Restore the last known-good Meridian backend/frontend pair and pinned Events-Backend SHA. Do not roll Events-Backend independently when its contract semantics differ.
3. Purge `/events/*` eligible HTML/API cache entries and language cache entries. Preserve `no-store` behavior for unavailable/error responses.
4. Keep `/events/:eventId` visitor behavior generic during rollback. If the feature must be disabled, serve the branded unavailable/noindex experience; never fall through to raw errors or unrestricted documents.
5. Re-run association, eligible, ended, unavailable, language, store, analytics, and mobile-link smoke checks.
6. Resume only from the prior successful rollout stage after root cause and privacy review.

Association changes and shipped mobile binaries have longer rollback horizons than web code. Maintain last-known-good declarations, signing fingerprints, and store destinations as deployment configuration, and prefer forward-fixing mobile routing while keeping the web fallback functional.

## Exit criteria after rollout

- Seven consecutive days without collision, tenant-limit, privacy, canonical, association, or store-destination alerts.
- API/language latency and error rates remain within the established baseline.
- Unavailable rates are explainable by source/platform without internal-cause disclosure.
- Per-key language fallback metrics and native link-arrival outcomes are implemented, or the dashboards remain explicitly labeled partial/inferred.
- App Store/Play fallback and web-to-app conversion are reviewed by platform without joining to identity or attendee data.
- The release checklist’s full external validator and device matrix is attached to the release record.
