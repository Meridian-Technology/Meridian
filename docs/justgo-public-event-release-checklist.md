# justgo.lol public event production-like release checklist

Review date: 2026-08-27

Release status: **conditionally ready; do not release until the live-host and standalone iOS-store blockers below are cleared.**

## Evidence summary

| Area | Status | Evidence |
| --- | --- | --- |
| Public API eligibility and projection | Pass | Events-domain and Meridian endpoint suites cover valid, malformed, private, missing, colliding, ended, registerable, and non-registerable outcomes. |
| API cache and rate limits | Pass | Available responses use `max-age=60, s-maxage=60, stale-while-revalidate=30`; unavailable/errors use `no-store`; ETags, 304, bounded rate limiting, `Retry-After`, and generic 429/503 bodies are tested. |
| Apple association declaration | Production-equivalent pass; live blocked | Handler returns JSON for team `S22WF3L7P9`, bundles `com.meridian.mobile` and `app.justgo`, and `/events/*` without an application redirect. Live DNS/HTTPS could not be reached from this environment. |
| Android asset links | Configuration gate | Handler and fail-closed behavior pass. Production must supply both release app-signing SHA-256 variables; live payload and Play relation validation remain blocked. |
| Crawler HTML and search directives | Pass locally; live blocked | Raw HTML tests validate canonical, title, description, Open Graph, Twitter, image, escaped JSON-LD, `EventCompleted`, query-free URLs, indexable eligible events, and identical noindex unavailable HTML. |
| Social unfurls | Pass locally; live blocked | Event-specific raw metadata is server-visible without JavaScript and fallback imagery is configured. Apple Messages, Slack, Discord, X, and Facebook validators require the deployed HTTPS URL. |
| Dynamic language | Pass | Narrow allowlist, city/product context, shipped defaults, valid overrides, malformed/missing fallback, interpolation, casing, and independent cache semantics are tested. |
| Web acquisition routing | Pass with iOS blocker | HTTPS app link remains primary; iOS/Android/desktop store selection and accessible labels are tested. Google Play points to `app.justgo`. The default iOS URL still points to Meridian Go unless production sets `REACT_APP_JUSTGO_IOS_STORE_URL`. |
| Installed-app routing | Static/test pass; device blocked | iOS Associated Domains and Android verified intent filter include `justgo.lol/events/*`; authenticated, logged-out, onboarding, pending-link, query/hash, and malformed-ID parsing tests pass. Device verification remains required. |
| City handling | Static pass; device blocked | The public-link gate compares the resolved event city with the active tenant, does not switch cities, and uses configured `cityMismatch` copy. Matching/different-city device checks remain required. |
| Analytics and attribution | Pass | Page view, share source, app-open attempt, App Store click, Google Play click, and native share use centralized names and only `event_id`, `source`, `platform`, and optional `store`. Share URLs use bounded `src=share`; page views are deduplicated. |
| Privacy-preserving unavailable behavior | Pass | Malformed, private, unpublished, removed, missing, colliding, inaccessible, and operational failure paths disclose no event details or internal cause; visitor behavior is generic and noindex. |

## Required production configuration

Set and verify before deployment:

- `ANDROID_MERIDIAN_SHA256_CERT_FINGERPRINTS`: Google Play **app-signing** certificate SHA-256 for `com.meridian.mobile`.
- `ANDROID_JUSTGO_SHA256_CERT_FINGERPRINTS`: Google Play **app-signing** certificate SHA-256 for `app.justgo`.
- `REACT_APP_JUSTGO_IOS_STORE_URL`: published standalone Just Go App Store URL. This is a release blocker because the fallback is Meridian Go.
- `REACT_APP_JUSTGO_PLAY_STORE_URL`: normally `https://play.google.com/store/apps/details?id=app.justgo`; set explicitly in production to avoid environment ambiguity.
- `EXPO_PUBLIC_JUSTGO_IOS_STORE_URL` and any backend/mobile remote-copy equivalent used by the binary, all pointing to the same standalone listing.

Build-time React variables must be present during the production frontend build, not added only to the runtime container afterward.

## Hosting and CDN requirements

1. Route `justgo.lol/events/*`, `/api/public/events/*`, and both `/.well-known/*` declarations to the Meridian backend. Do not let a generic SPA/CDN fallback bypass server metadata generation.
2. Preserve the original `Host` and forwarded HTTPS protocol so canonical URLs remain `https://justgo.lol/events/:eventId`.
3. Serve the apex over valid HTTPS. If `www.justgo.lol` redirects, the apex association URLs themselves must still return directly without redirects.
4. Do not append `.json` to Apple’s association filename. Serve both declarations as `application/json`.
5. Respect origin cache headers: never cache unavailable/503/429 responses contrary to `no-store`; allow the declared short edge cache for eligible event, language, and association responses.
6. Purge association and event HTML cache after the first deployment and after signing-certificate or metadata changes.
7. Do not alter unrelated Meridian/campus routes or map `justgo.lol` to tenant middleware before the public handlers.

## Live release commands

Run from a network that can resolve the production domain. Do not use `-L`; a redirect is a failure for association declarations.

```sh
curl --fail --silent --show-error --dump-header /tmp/aasa.headers \
  --output /tmp/aasa.json \
  https://justgo.lol/.well-known/apple-app-site-association
curl --fail --silent --show-error --dump-header /tmp/assetlinks.headers \
  --output /tmp/assetlinks.json \
  https://justgo.lol/.well-known/assetlinks.json
curl --fail --silent --show-error --dump-header /tmp/event.headers \
  --output /tmp/event.html \
  https://justgo.lol/events/REPLACE_WITH_ELIGIBLE_EVENT_ID
curl --silent --show-error --dump-header /tmp/unavailable.headers \
  --output /tmp/unavailable.html \
  https://justgo.lol/events/000000000000000000000000
```

Confirm:

- Association status `200`, exact JSON content type, zero redirect, exact app/package IDs, production fingerprints, and `/events/*` scope.
- Eligible HTML has `index, follow`, query-free canonical/`og:url`, event image, escaped Event JSON-LD, and correct lifecycle status.
- Unavailable HTML and API response are `no-store`, generic, and `noindex, nofollow`, with no database, tenant, collision, or event information.
- API `ETag` produces `304`; repeated requests expose rate-limit headers and eventually stable `429` semantics without affecting unrelated clients.
- Language updates appear after the documented cache window and malformed/missing overrides return shipped Just Go defaults.

## External validators and device matrix

Complete and attach results before release approval:

- Apple AASA inspection and iOS Universal Link test for both `com.meridian.mobile` and `app.justgo`.
- Google Digital Asset Links API with `return_relation_extensions=true`, plus Android `adb shell am start` verification for both packages.
- Apple Messages, Slack, Discord, Facebook Sharing Debugger, and X card/unfurl checks using an eligible event and an unavailable event.
- iOS and Android: cold/warm start, installed/not installed, logged out, onboarding, matching city, different city, missing event, and ended event.
- Desktop/unknown user agent: both store choices; iOS: standalone App Store; Android: `app.justgo` Google Play.
- Analytics console: one view per event render, bounded share attribution, one app-open attempt per click, correct store event, and no disallowed properties.

## Checks executed in this review

- Meridian backend: 6 suites, 63 tests passed.
- Public web page: 4 suites, 31 tests passed.
- Meridian Mobile sharing/linking/store/analytics: 5 suites, 23 tests passed.
- Production frontend build: passed in the preceding design review state.
- Live `justgo.lol`: blocked. The web fetcher rejected the host and workspace `curl` could not resolve DNS.
- Events-Backend standalone invocation: blocked because that repository intentionally has no package/test harness; its linked contract/service behavior is exercised through the Meridian backend dependency and prior focused phase tests.

Existing CRA/Browserslist/React Router warnings and repository-wide mobile type errors are unrelated to this release slice but should remain visible in CI.
