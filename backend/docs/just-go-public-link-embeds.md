# Just Go — public link embeds (Open Graph / iMessage)

How **justgo.lol** serves rich link previews for the brand landing page and public event pages. Crawlers (iMessage, Slack, Facebook, X, etc.) do not run the React app; they fetch HTML and read `<meta>` tags plus any static fallback content in the document.

---

## Share image resolution

| Surface | `og:image` source | Dimensions |
|--------|-------------------|------------|
| Brand (`/`, city slugs, `/justgo/*`) | Static JPEG at `/justgo/og.jpg` | 1200×630 |
| Public event **with photo** | `event.socialPreview.imageUrl` or `event.image.url` (remote URL) | From the hosted photo |
| Public event **without photo** | Generated PNG at `/api/public/events/:eventId/opengraph.png` | 1200×630 |

Brand copy and image alt text align with `JUSTGO_TITLE`, `JUSTGO_DESCRIPTION`, and `JUSTGO_OG_IMAGE_ALT` in `utilities/justGoSpaHtml.js` (server) and `frontend/src/pages/JustGoLanding/justGoDocumentMeta.js` (in-app navigation).

### Brand image (`/justgo/og.jpg`)

- Asset: `frontend/public/justgo/og.jpg` (1200×630, `summary_large_image` safe).
- Background `#1E1A16`, Just Go wordmark from `frontend/public/justgo/wordmark-1624.png`, ethos copy from the constants above.
- Served as a static file from the production frontend build; meta tags point at the absolute URL on `https://justgo.lol` (or `JUSTGO_PUBLIC_ORIGIN` override).

### Event photo (existing behavior)

When the public event v1 payload includes a non-empty `socialPreview.imageUrl` or `image.url`, that URL is used for `og:image` and `twitter:image`. Width/height meta tags are **not** set (the remote asset dimensions are unknown). `og:image:alt` / `twitter:image:alt` use the event title.

### Generated card fallback (`opengraph.png`)

When there is no event photo, SSR and meta tags use:

```text
https://justgo.lol/api/public/events/{eventId}/opengraph.png
```

The PNG is rendered server-side by `services/justGoPublicEventShareImageService.js` (Sharp + SVG overlay on `#1E1A16`): wordmark, truncated title, formatted date/time (`Intl`, same logic as `justGoPublicEventFormat.js`), venue, and organizer. `og:image:width` / `og:image:height` are set to 1200 and 630.

---

## Strategy B (no photo compositing)

The share-image service **does not** fetch, resize, or composite event photos. Photo events use the remote image URL directly in meta tags; no-photo events use the generated PNG route only.

Additional rules:

- Reject oversize strings (title, venue, organizer, timezone) before render.
- Never embed raw HTML from the event payload — text is sanitized and escaped for SVG/HTML output.
- Unavailable or invalid event IDs return **404** with `Cache-Control: no-store` (same privacy posture as the JSON API).

---

## `opengraph.png` route

| Item | Detail |
|------|--------|
| Method / path | `GET /api/public/events/:eventId/opengraph.png` |
| Handler | `routes/publicEventRoutes.js` → `getPublicEventOpenGraphImage` |
| ID validation | `isCanonicalPublicEventId` (24-char hex MongoDB ObjectId) |
| Rate limit | `publicEventRateLimit` (same as JSON public event routes) |
| Data load | `loadPublicEvent` — 404 + no-store when unavailable |
| Success | `Content-Type: image/png`, `Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=30`, ETag |
| Render failure | 503 + no-store |

Mounted in `app.js` via `publicEventRoutes`. The path `/api/public/events` is on the **www allowlist** so the image endpoint is reachable on Meridian’s shared host as well as **justgo.lol**.

---

## Production-only SSR (`app.js`)

Open Graph HTML rewriting runs **only when `NODE_ENV === 'production'`**:

1. Serves `frontend/build` with `express.static` (`index: false`).
2. Catch-all `GET *`:
   - **`/events/:id`** (any `/events/…` shape): `renderPublicEventIndexHtml` — eligible events get event meta + `#justgo-share-fallback` block; invalid/unavailable IDs get `noindex` meta without a share fallback block.
   - **Just Go hosts** (`isJustGoPublicHost`) or `/justgo/*`: `applyJustGoIndexHtml` — brand meta tags.
   - Otherwise: plain `index.html` (campus SPA).

In development, crawlers receive the unmodified Vite/dev `index.html` unless you run a production build locally with `NODE_ENV=production`.

**justgo.lol bypass:** Requests whose `Host` matches `isJustGoPublicHost` skip the campus `www` path lock, so city slugs and public event pages work on the apex domain.

---

## Crawler-visible HTML fallback (eligible events)

For available public events, `applyPublicEventIndexHtml` injects a plain `#justgo-share-fallback` block before `</body>`: title, when, venue, organizer, and canonical link. All text is HTML-escaped; no scripts. This gives crawlers that ignore or deprioritize meta tags a readable snapshot. Unavailable event pages do **not** receive this block.

Structured data: JSON-LD `Event` schema is also injected in `<head>` for eligible events.

---

## Meta tag reference

### Brand landing

- `og:type` = `website`
- `twitter:card` = `summary_large_image`
- `og:image:width` / `og:image:height` = 1200 / 630
- `og:image:alt` — wordmark + ethos (plain text)

### Public event (eligible)

- `og:type` = `event`
- Title: `{event.title} | just go`
- Description: `socialPreview.description` → `description` → `title`
- `og:url` / canonical: event `canonicalUrl`
- `og:image:alt` / `twitter:image:alt`: event title
- Generated card only: `og:image:width` / `og:image:height` = 1200 / 630

### Unavailable event

- `robots`: `noindex, nofollow`
- Generic unavailable title/description; no `og:image`

---

## iMessage and crawler limitations

- **No JavaScript:** Previews depend on server HTML and absolute URLs. Relative `og:image` values break in many clients.
- **Caching:** iMessage and other apps cache previews aggressively; changing meta tags or `og.jpg` may not refresh until cache expiry or URL change.
- **Image size:** Brand `og.jpg` is kept reasonably small for slow mobile crawlers. Generated PNGs are 1200×630 PNG (lossless text; not optimized for minimal bytes).
- **Remote photos:** Third-party image hosts must allow crawler fetches (no auth, reasonable TLS). Broken or blocked URLs yield empty or generic previews.
- **Timeouts:** Crawlers often abort slow responses; public routes use short cache TTLs (60s) but cold render of `opengraph.png` still adds latency on first hit.
- **Privacy:** Non-canonical or unavailable event IDs return 404 with no-store — no event metadata or image in the response.

---

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `JUSTGO_PUBLIC_ORIGIN` | Absolute origin for canonical URLs, `og:image`, and API paths in SSR meta tags. Used by `utilities/justGoPublicUrl.js` and the embed check script. | `https://justgo.lol` |
| `JUSTGO_SAMPLE_EVENT_ID` | Optional 24-char hex public event ID for manual embed verification (see script below). | *(unset — event URL check is skipped)* |

Frontend mirror: `REACT_APP_JUSTGO_PUBLIC_ORIGIN` overrides the client-side origin in `justGoLandingCopy.js`.

---

## Embed check script

`backend/scripts/check-justgo-embed.sh` fetches HTML with a link-preview crawler user-agent and prints selected Open Graph / Twitter tags.

```bash
# Production (default origin https://justgo.lol)
JUSTGO_SAMPLE_EVENT_ID=507f1f77bcf86cd799439011 \
  ./backend/scripts/check-justgo-embed.sh

# Local production-mode server
JUSTGO_PUBLIC_ORIGIN=http://localhost:3000 \
JUSTGO_SAMPLE_EVENT_ID=507f1f77bcf86cd799439011 \
  ./backend/scripts/check-justgo-embed.sh
```

Paths checked:

1. `/` — brand landing
2. `/events/{JUSTGO_SAMPLE_EVENT_ID}` — when `JUSTGO_SAMPLE_EVENT_ID` is set
3. `/events/not-an-id` — unavailable / invalid id (expect no `og:image`, `noindex`)

Printed tags: `og:title`, `og:description`, `og:image`, `og:url`, `twitter:card`.

---

## Key files

| File | Role |
|------|------|
| `utilities/justGoSpaHtml.js` | SSR meta injection, share image resolution, crawler fallback block |
| `services/justGoPublicEventShareImageService.js` | PNG card render (Strategy B) |
| `routes/publicEventRoutes.js` | JSON + `opengraph.png` public API |
| `utilities/justGoPublicUrl.js` | Canonical absolute URLs |
| `app.js` | Production catch-all SSR; www allowlist includes `/api/public/events` |
| `frontend/public/justgo/og.jpg` | Brand share image |
| `frontend/src/pages/JustGoLanding/justGoDocumentMeta.js` | Client-side meta for in-app navigation |
| `scripts/check-justgo-embed.sh` | Manual crawler-style verification |

Tests: `npm test -- --testPathPattern=justGoSpaHtml`, `justGoPublicEventShareImage`, `publicEventRoutes` (from `backend/`).

---

## Verification

Captured **2026-09-06** against production (`JUSTGO_PUBLIC_ORIGIN=https://justgo.lol`). `JUSTGO_SAMPLE_EVENT_ID` was **not set**, so the eligible-event path was skipped — set it to a live public event ObjectId and re-run after deploy to validate `opengraph.png` / photo meta and `#justgo-share-fallback`.

```text
$ ./backend/scripts/check-justgo-embed.sh
Just Go embed check
Origin: https://justgo.lol
Sample event id: (unset — skipping /events/{id} check)

=== Brand landing (/) ===
URL: https://justgo.lol/
User-Agent: facebookexternalhit/1.1 (+https://www.facebook.com/externalhit_uatext.php)
HTTP: 200
og:title:       just go. this week in your city
og:description: stop planning. swipe what's on in your city this week. just go.
og:image:       https://justgo.lol/justgo/og.jpg
og:url:         https://justgo.lol
twitter:card:   summary_large_image

=== Unavailable event (/events/not-an-id) ===
URL: https://justgo.lol/events/not-an-id
User-Agent: facebookexternalhit/1.1 (+https://www.facebook.com/externalhit_uatext.php)
HTTP: 200
og:title:       this event isn’t available
og:description: find something else happening in just go
og:image:       https://justgo.lol/justgo/og.jpg
og:url:         https://justgo.lol/events
twitter:card:   summary_large_image
```

**Notes (pre–MER-199 deploy):** Brand landing meta matches the documented contract. Unavailable events still inherit brand `og:image` on production; after this branch ships, expect **no** `og:image` on unavailable paths and `noindex, nofollow` robots. Re-run with `JUSTGO_SAMPLE_EVENT_ID=<eligible-id>` to confirm event-specific `og:image` (`opengraph.png` or photo URL) post-deploy.
