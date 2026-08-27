# Just Go public event dynamic-language inventory

Status: Phase 1, Step 1.3 inventory and proposed semantic-key contract. This document traces the existing system and defines the keys needed by the future public event experience. It does not add catalog keys, expose an endpoint, or change UI copy.

## Existing system end to end

### 1. Shipped configuration

The canonical consumer copy is `Meridian-Mobile/src/pivot/copy/pivotCopy.ts`, exported as the live `PIVOT_COPY` object. It contains bundled Just Go defaults and semantic sections such as `brand`, `entry`, `eventDetail`, `invite`, `calendar`, and `landing.web`.

`pivotCopyCatalog.ts` defines schema version `1`, the top-level sections eligible for remote override, and denied sections. Consumer sections are allowlisted; `admin`, `demo`, `dev`, `network`, `mobile`, nested admin/dev leaves, update-gate leaves, and non-copy configuration are denied. A generated backend catalog mirrors the shipped key set and key kinds.

Four first-class tokens can ripple through tokenized entries:

```text
brand.name       = "just go"
brand.cta        = "go"
group.singular   = "circle"
group.plural     = "circles"
```

Tokens are vocabulary substitutions, not arbitrary dynamic parameters. Event content must never select a key or token name.

### 2. Centrally managed platform and city layers

Sparse overlays live in the global/platform MongoDB collection `pivot_copy_packs` (`backend/schemas/pivotCopyPack.js`):

- one `scope: "platform", tenantKey: null` row;
- at most one `scope: "tenant", tenantKey: <normalized city>` row per city;
- `entries` and `tokens` are literal dotted-key-to-string maps;
- `schemaVersion` is a positive integer;
- `revision` is a monotonically incremented integer per row.

`pivotCopyService.mergeStoredCopyPacks()` resolves the stored union in this order:

```text
shipped defaults (client only)
  <- platform sparse entries/tokens
  <- resolved tenant sparse entries/tokens (wins)
```

The server deliberately returns only stored sparse overlays; missing keys are not expanded to shipped defaults. The effective revision is `p{platformRevision}:t{tenantRevision}`. A missing row contributes zero.

Admin writes are limited to shipped catalog keys and known token names, non-empty strings, maximum per-value lengths, and a maximum number of keys per patch. Reset deletes a sparse value so it inherits the next layer. Server write validation does not parse ICU templates; clients must reject malformed templates at resolution time.

### 3. Consumer endpoints and tenant context

- Authenticated mobile `GET /pivot/config` resolves `req.school`, verifies it is a Pivot/Just Go tenant, and returns only a copy pointer `{revision, schemaVersion}` alongside city configuration.
- Authenticated mobile `GET /pivot/copy` resolves the same city, merges platform plus tenant overlays, sets `ETag: "pN:tN"`, uses `Cache-Control: private, must-revalidate`, and returns `304` for a matching `If-None-Match`.
- Unauthenticated `GET /pivot/landing/copy` is rate-limited and failure-safe, but currently returns **platform-only** keys filtered to `landing.*`, shared brand entries, and known tokens. It does not accept or resolve a city overlay.

The public event experience therefore cannot reuse `/pivot/copy` (authenticated and over-broad) or the current landing endpoint (platform-only and landing-only) unchanged. Phase 2.3 needs a narrow unauthenticated resolver keyed only by the city already resolved from the eligible public event. It should return platform-plus-that-tenant values filtered to the approved public-event/brand/store key allowlist, never raw configuration or arbitrary requested keys.

### 4. Mobile cache, refresh, and application

Mobile cache keys are scoped by schema and city:

```text
pivot_copy_pack:v{schema}:platform
pivot_copy_pack:v{schema}:tenant:{tenantKey}
```

Before Pivot content mounts, `hydratePivotCopyPack()` reads AsyncStorage. The tenant cache wins; if missing/corrupt it uses the platform cache; otherwise it clears to bundled defaults. Epoch checks prevent an older city hydrate from overwriting a newer one.

`usePivotCopyPack()` performs a fire-and-forget refresh. It compares the config pointer with the applied disk revision and fetches `/pivot/copy` only on mismatch. A successful response is validated, synchronously applied, and persisted. `304` retains the current pack. Config failure, fetch failure, malformed payload, schema rejection, or persistence failure never blocks first paint and never clears usable copy; fallback telemetry records safe reason codes.

The module-level overlay store filters unknown/denied keys and invalid token values, bumps a generation counter, and notifies React. `PivotCopyGenerationProvider`, theme, and font consumers subscribe so existing `PIVOT_COPY` reads update without rewriting each component.

### 5. Native and web consumption

`PIVOT_COPY` is a live proxy. Static string leaves resolve through `s(path, fallback)` at read time. Function/template leaves use `t(path, params, fallbackFn)`. Native event detail, cards, invite sharing, calendar prompts, onboarding, loading, and accessibility labels read from these semantic keys rather than receiving presentation copy from APIs.

The web landing has a separate bundled first-paint object in `justGoLandingCopy.js`, mapped explicitly to the same `landing.web.*` catalog paths. It fetches the filtered public landing pack after first paint, replaces values through `JustGoLandingCopyContext`, and retains the bundled value for missing, empty, or malformed overrides. This resolver supports token replacement and the landing's `{count}` runtime placeholder, but not the mobile ICU parser.

The future public event page should share a small environment-neutral resolver/catalog definition rather than build a third divergent copy engine. Server-rendered metadata and visible/accessibility copy must resolve from the same effective values.

## Interpolation, casing, and formatting rules

### Template grammar

The mobile resolver supports:

- simple named values: `{city}`, `{eventTitle}`;
- nested and flat semantic tokens: `{brand.name}`, `{group.singular}`;
- ICU-like `plural` with exact selectors, `one`, `other`, and `#`;
- ICU-like `select` with explicit selectors and `other`;
- strings and finite numbers only as runtime values.

It does not support arbitrary ICU types, HTML, executable expressions, locale selection, or missing parameters. Braces must balance. A plural/select must have a usable branch, normally `other`. English plural selection is used, with a `n === 1` fallback when `Intl.PluralRules` is unavailable.

Resolution is fail-safe:

```text
valid tenant override
  else valid platform override
  else bundled Just Go fallback
```

Because server merging discards layer provenance, a malformed tenant value currently reaches the client as the chosen overlay and falls directly to the bundled fallback, not back to the platform value. Phase 2.3 should preserve existing behavior unless the central resolver is deliberately upgraded and tested to validate each layer before choosing it.

### Casing

- Stored values are trimmed but their casing is preserved.
- The resolver never automatically lowercases configured copy.
- Just Go's shipped voice is predominantly lowercase, but existing `eventDetail.register`, `registerSection`, and confirmation actions intentionally contain title case.
- Native theme helpers often apply `textTransform: lowercase`; `PivotButton` supports `preserveCase`. Web landing also applies lowercase CSS broadly.
- Public page components must preserve configured capitalization: do not call `.toLowerCase()` and do not apply `text-transform` to configurable strings or accessibility names. Lowercase belongs in the approved default strings, not in rendering logic.
- User-controlled interpolation values such as event title, city display name, venue, and organizer must preserve source casing. Existing helpers that lowercase interpolated names are not suitable for public metadata/share copy.

### Dates

Current native event formatting is not part of dynamic language. `formatPivotEventWhen()` and showtime helpers hardcode `en-US`, lowercase weekday/month output, use the device timezone, and compose punctuation (`·`, `–`) in code. The public contract supplies an explicit event timezone, so the public page must format with `Intl.DateTimeFormat(locale, {timeZone})` and not the browser's implicit timezone.

Dynamic keys should provide semantic wrappers/status phrases, while `Intl` provides localized date, time, weekday, and timezone parts. Do not put preformatted dates in the API or allow copy templates to choose a timezone.

## Existing reusable keys

| Need | Existing key | Approved use |
| --- | --- | --- |
| Product name/token | `brand.name`, token `{brand.name}` | All brand mentions. |
| Short brand action/token | `brand.cta`, token `{brand.cta}` | Only where the short “go” action is semantically correct. |
| Ticket action | `eventDetail.getTickets` | Native/internal ticket button; public web uses a new app-acquisition CTA because it cannot transact directly. |
| Registration label | `eventDetail.register` | Native/internal registration label; may be reused for metadata, not the public app CTA. |
| Registration section | `eventDetail.registerSection` | Optional section heading if the public design retains one. |
| Registration/ticket failure | `eventDetail.ticketsError`, `eventDetail.registeredError` | Native flows only; public fetch/app-open errors need public keys. |
| Generic retry | `entry.retry` | Reuse for a retry control when no public-specific nuance is required. |
| City loading/error vocabulary | `entry.loading`, `entry.loadError`, `entry.selectError` | Reference only; public event errors must not suggest switching cities or reveal resolution. |
| Offline message | `network.offline`, `network.offlineShort` | Shipped/native only; `network` is deliberately not remotely configurable. Do not claim these meet the public dynamic-language requirement. |
| iOS store accessible label | `landing.web.ctaAriaIos` | Reuse exactly. |
| Android store accessible label | `landing.web.ctaAriaAndroid` | Reuse exactly. |
| General acquisition CTA | `landing.web.cta` | Reuse on unavailable/general download paths if product approves “get {brand.name}”. |
| Landing download prompt | `landing.web.deck.downloadTitle`, `.downloadBody` | Reuse only for the landing/deck; public event needs capability-specific language. |
| Landing loading | `landing.web.deck.loading` | Do not reuse: it refers to the weekly Drop. |
| Existing share language | `invite.share*`, `landing.web.waitlist.share*` | Do not reuse for events: both describe invitations/referrals, not sharing an event. |

## Public event key namespace

Add one new remotely allowlisted top-level section, `publicEvent`, because the public event page is a genuinely new concept spanning web UI, metadata, app acquisition, and native link handling. Keep brand and store labels reused where semantics match.

All keys below are static strings unless parameters are listed. Defaults are approved Just Go fallbacks; casing is intentional.

### Page, loading, failure, and accessibility

| Key | Parameters | Default fallback | Notes |
| --- | --- | --- | --- |
| `publicEvent.page.skipToEvent` | — | `skip to event` | Skip-link label. |
| `publicEvent.page.organizerPrefix` | — | `hosted by` | May be visually hidden if organizer layout is self-explanatory, but retained for accessible text. |
| `publicEvent.page.imageAlt` | `eventTitle` | `{eventTitle} event poster` | Preserve event-title casing. |
| `publicEvent.page.imageUnavailableAlt` | — | `event poster unavailable` | Use only if placeholder is exposed as an image; decorative placeholders use empty alt. |
| `publicEvent.loading.title` | — | `loading this event` | Visible and polite live-region value. |
| `publicEvent.loading.accessibility` | — | `event details are loading` | Accessible loading name. |
| `publicEvent.failure.title` | — | `couldn’t load this event` | Transient service failure only; do not use for unavailable/private records. |
| `publicEvent.failure.body` | — | `try again, or open just go` | Keeps a usable acquisition path. |
| `publicEvent.failure.retry` | — | `try again` | May share value with `entry.retry`, but retains a stable public-event semantic key. |

### Registration and app opening

| Key | Parameters | Default fallback | Selected when |
| --- | --- | --- | --- |
| `publicEvent.action.registerInApp` | — | `get the app to register` | Capability is actionable in-app registration. |
| `publicEvent.action.ticketsInApp` | — | `get the app for tickets` | Capability is an actionable external/ticket flow reached through the app. |
| `publicEvent.action.openInApp` | — | `open in just go` | Event is non-registerable, ended, or otherwise has no actionable registration capability. Use `{brand.name}` in stored default if tokenized as `open in {brand.name}`. |
| `publicEvent.action.openingApp` | — | `opening just go…` | App-link attempt in progress. |
| `publicEvent.action.openAppAccessibility` | `eventTitle` | `open {eventTitle} in just go` | Accessible name; preserve title casing. |
| `publicEvent.action.registerAccessibility` | `eventTitle` | `open {eventTitle} in just go to register` | Accessible name for in-app registration. |
| `publicEvent.action.ticketsAccessibility` | `eventTitle` | `open {eventTitle} in just go for tickets` | Accessible name for ticket flow. |
| `publicEvent.action.appOpenFailed` | — | `couldn’t open the app` | Shown only for retry-safe degradation. |
| `publicEvent.action.chooseStore` | — | `get just go` | Desktop/unknown-platform store-choice heading; prefer `get {brand.name}`. |
| `publicEvent.action.downloadPrompt` | — | `download just go to keep going` | General acquisition helper; prefer tokenized brand name. |

The client selects keys from the API's registration capability and lifecycle enums. It must never infer the label solely from `externalLink`, and the API must never return these presentation strings.

### Lifecycle and availability

| Key | Parameters | Default fallback | Notes |
| --- | --- | --- | --- |
| `publicEvent.status.upcoming` | — | `coming up` | Optional visible status. |
| `publicEvent.status.ongoing` | — | `happening now` | Ongoing semantic state. |
| `publicEvent.status.ended` | — | `this event has ended` | Ended published events remain visible. |
| `publicEvent.status.registrationClosed` | — | `registration closed` | Capability helper, not an availability result. |
| `publicEvent.status.soldOut` | — | `sold out` | Use only when the public capability explicitly distinguishes capacity. |
| `publicEvent.unavailable.title` | — | `this event isn’t available` | Same title for missing, private, unpublished, removed, colliding, inaccessible, and unresolved. |
| `publicEvent.unavailable.body` | — | `find something else happening in just go` | Must not interpolate event/city data or reveal a reason. Prefer `{brand.name}` token. |
| `publicEvent.unavailable.downloadCta` | — | `get just go` | May resolve from `landing.web.cta` if the public resolver exposes a shared alias. |
| `publicEvent.unavailable.accessibility` | — | `event unavailable` | Generic accessible state. |

### City mismatch in the installed app

| Key | Parameters | Default fallback | Notes |
| --- | --- | --- | --- |
| `publicEvent.cityMismatch.title` | — | `not in your city` | Do not name the event's city by default. |
| `publicEvent.cityMismatch.body` | `activeCity` | `this event isn’t available in {activeCity}` | Describes the retained active city; never offers automatic switching. |
| `publicEvent.cityMismatch.back` | — | `back to your week` | Returns to the current city experience. |
| `publicEvent.cityMismatch.accessibility` | `activeCity` | `event unavailable in {activeCity}` | Preserve city display casing. |

These native keys belong in the same central section so app-link behavior and the public page share vocabulary. They are not required in the unauthenticated web response unless the web actually renders them.

### Event sharing

| Key | Parameters | Default fallback | Notes |
| --- | --- | --- | --- |
| `publicEvent.share.action` | — | `share event` | Visible/native control. |
| `publicEvent.share.accessibility` | `eventTitle` | `share {eventTitle}` | Accessible name. |
| `publicEvent.share.title` | `eventTitle` | `{eventTitle}` | Native share-sheet title. |
| `publicEvent.share.message` | `eventTitle` | `{eventTitle} — found on just go` | URL is appended separately; prefer `{brand.name}` token. |
| `publicEvent.share.copyLink` | — | `copy link` | Copy-link action. |
| `publicEvent.share.copied` | — | `link copied` | Confirmation. |
| `publicEvent.share.error` | — | `couldn’t share that. try again` | Cancellation is not an error and should not show this. |

Do not reuse referral/invite language, and never interpolate user identity or attendee information.

### Date and timezone phrases

| Key | Parameters | Default fallback | Notes |
| --- | --- | --- | --- |
| `publicEvent.date.today` | — | `today` | Optional relative-day label. |
| `publicEvent.date.tomorrow` | — | `tomorrow` | Optional relative-day label. |
| `publicEvent.date.startsAt` | `dateTime` | `starts {dateTime}` | `dateTime` comes from safe `Intl` formatting. |
| `publicEvent.date.range` | `start`, `end` | `{start} – {end}` | Use when a single localized formatter cannot produce the complete range. |
| `publicEvent.date.timezone` | `timezone` | `times shown in {timezone}` | `timezone` is an approved display name/abbreviation derived from the contract IANA zone. |
| `publicEvent.date.accessibility` | `start`, `end`, `timezone` | `{start} to {end}, {timezone}` | Full non-abbreviated accessible label. |

Relative labels must be calculated in the event timezone, not the visitor timezone. The public page should pass complete already formatted string parameters to the copy resolver; templates must not perform date arithmetic.

### Store actions

Reuse the existing keys rather than duplicating them:

```text
landing.web.ctaAriaIos      = download {brand.name} on the app store
landing.web.ctaAriaAndroid  = get {brand.name} on google play
landing.web.cta             = get {brand.name}
```

Add only the visible platform labels needed when official badge imagery is unavailable or multiple stores are listed:

| Key | Default fallback |
| --- | --- |
| `publicEvent.store.appStore` | `app store` |
| `publicEvent.store.googlePlay` | `google play` |
| `publicEvent.store.iosAction` | `download on the app store` |
| `publicEvent.store.androidAction` | `get it on google play` |
| `publicEvent.store.openError` | `couldn’t open the store. try again` |

Store URLs and application identifiers are configuration, not copy tokens or template parameters.

## Public resolver contract for later phases

For an available event, the language request is bound server-side to the resolved event city. For an unavailable event, the response must not probe or expose a candidate city; use the platform-only public-event pack so all unavailable causes remain indistinguishable.

The minimal unauthenticated payload should contain:

```json
{
  "revision": "pN:tN",
  "schemaVersion": 1,
  "tokens": {
    "brand.name": "just go",
    "brand.cta": "go"
  },
  "entries": {
    "publicEvent.action.openInApp": "open in {brand.name}"
  }
}
```

Only `publicEvent.*`, the required `brand.*` entries/tokens, and reused `landing.web.cta*` store keys may be returned. Do not expose group terms unless a returned template actually needs them. Do not accept an arbitrary key list or let event content choose keys.

Recommended caching behavior follows the existing system:

- composite platform/tenant revision and strong ETag;
- public cacheability only after privacy review, with `Vary` limited to the resolved public language context rather than authentication headers;
- stale cached or bundled defaults remain usable on refresh failure;
- unavailable uses a platform-only revision and generic values;
- metadata generation and visible rendering resolve one captured pack revision per response to avoid mixed copy.

## Representative configuration review

| Configuration | Expected effective language |
| --- | --- |
| No stored rows | Bundled Just Go defaults for every key. |
| Platform override only | Platform value for known valid keys; bundled values for missing keys. |
| Tenant override only | Tenant value for that resolved Just Go city; bundled values elsewhere. |
| Platform plus tenant | Tenant wins per stored key/token; platform fills other stored keys; bundled fills remaining catalog keys. |
| Different Just Go cities | Each resolves its own tenant cache/revision; no in-memory or disk overlay leaks across cities. |
| Missing override | Inherit platform, then bundled fallback. |
| Empty/non-string/unknown/denied write | Rejected server-side or filtered client-side; approved fallback remains. |
| Malformed interpolation/ICU | Resolver catches it and uses bundled fallback without throwing into UI. |
| Newer schema payload | Client filters to keys it understands; unsupported keys cannot enter the overlay store. |
| Config/copy fetch failure | Keep tenant disk cache, then platform disk cache, then bundled defaults; no loading gate. |
| Unavailable event | Platform-only generic unavailable language; no city-specific resolution or reason leakage. |

## Gaps and decisions for implementation

1. Add `publicEvent` to the mobile/backend remote section catalogs and generated shipped catalog only when Phase 2/3 implementation begins.
2. Share the template resolver or an isomorphic subset with web/SSR. The current landing resolver cannot process ICU plural/select and would diverge.
3. Add a narrowly filtered unauthenticated platform-plus-resolved-city endpoint; do not make authenticated `/pivot/copy` public.
4. Decide whether malformed tenant templates should continue to jump directly to bundled fallback or whether the central resolver should validate each layer and fall back to a valid platform override. Any change affects existing semantics and needs tests.
5. Date formatting is currently English/device-timezone-specific. Public formatting must accept locale and the event's IANA timezone while copy remains semantic.
6. Remove CSS/programmatic lowercasing from public configurable strings so configured capitalization and interpolated proper names survive.
7. `network.*` is deliberately denied from remote overlays. Public loading/failure copy therefore needs the new `publicEvent.*` keys rather than pretending native network strings are dynamically configurable.
