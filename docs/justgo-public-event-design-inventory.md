# Just Go public event design inventory

Status: Phase 1, Step 1.2 inventory. This is the visual contract for the future `/events/:eventId` page. It maps existing standalone Just Go web and native Pivot/Just Go sources to web behavior; it does not implement the route.

## Design identity and source precedence

The public page is a standalone Just Go surface, not a Meridian Go event page. Use this precedence when sources differ:

1. `frontend/src/pages/JustGoLanding/JustGoLanding.scss` is the source for web-ready scoped colors, fonts, controls, breakpoints, focus behavior, and reduced-motion behavior already deployed on `justgo.lol`.
2. `Meridian-Mobile/src/pivot/screens/PivotEventDetailScreen.tsx` is the source for event-detail information hierarchy and content states.
3. `Meridian-Mobile/src/pivot/components/PivotEventCard.tsx`, `PivotEventMetaPills.tsx`, and `PivotButton.tsx` are the source for event-card anatomy, meta semantics, and CTA variants.
4. `Meridian-Mobile/src/pivot/theme/pivotTheme.ts` is the canonical semantic token vocabulary. The web landing's dark `--jg-*` values are its dark-theme translation.
5. Existing web assets and `PivotBranding` font setup are preferred over copying mobile binaries or recreating the wordmark.

Keep the page under one scoped root such as `.justgo-event-page`; reuse/alias `--jg-*` variables there. Do not depend on global campus/Meridian variables, `Logo.svg`, Satoshi, campus event cards, or campus navigation chrome.

## Tokens

### Color

The current `justgo.lol` landing uses the native dark Just Go theme and is the default public-page palette.

| Semantic role | Web token/value | Native source | Use on event page |
| --- | --- | --- | --- |
| Page paper | `--jg-cream: #1e1a16` | dark `cream` | Main background. |
| Inset paper | `--jg-cream-deep: #2a2520` | dark `creamDeep` | Secondary/loading panels, not a new card color. |
| Primary ink | `--jg-ink: #faf6ef` | dark `ink` | Headings, strong borders, primary text. |
| Muted ink | `rgba(250,246,239,.72)` | dark `inkMuted` | Description/supporting text. |
| Soft ink | `rgba(250,246,239,.48)` | dark `inkSoft` | Organizer/helper metadata. |
| CTA orange | `--jg-accent: #ff4f1f` | `accent` | Primary app/registration CTA and actionable emphasis. |
| Ticker blue | `--jg-ticker: #2e8fd4` | dark `tickerBar` | “When” chip and limited status accents. |
| Sunny yellow | `--jg-pop: #ffd23f` | `pop` | “Where” chip, focus ring, highlight sticker. Use dark `#1a1714` text. |
| Burst red | `--jg-burst: #ff3b3b` | dark `burst` | Small sticker/star accent; not error body text by default. |
| Sage | `--jg-sage: #6fe078` | dark `sage` | Reserved affirmative accent. |
| Placeholder | `#0f0d0b` | dark `eventPlaceholder` | Missing event image. |
| Photo foreground | `#faf6ef` | `PIVOT_PHOTO_FOREGROUND` | Text/icons over darkened photography. |
| Hard border | `#faf6ef` on dark page; `#1a1714` on light stickers | scrapbook border | 2–2.5 px visible edges. |

Do not add gradients as brand colors. Existing gradients are image washes/placeholders only. User-provided images need a dark wash/vignette when text overlaps them.

### Typography and casing

| Role | Family | Existing behavior | Web rule |
| --- | --- | --- | --- |
| UI headings/buttons | Instrument Sans 600/700 | `PIVOT_FONTS.display/displayBold`; Google Fonts import on landing | Reuse landing import/fallback stack. Tight headings, about `1.05` line-height. |
| Brand/event display | Les Flos Sans | wordmark and scrapbook titles; locally hosted OTF | Reuse `PivotBranding/pivotBrandFonts.scss`; use selectively for branded title/sticker moments, not long prose. |
| Metadata/body labels | Space Mono 400/700 | native body and web metadata | Dates, venue labels, statuses, helpers; line-height about `1.45`. |
| Long event description | Space Mono or current display body depending density | native detail uses mono; landing story uses display | Prefer Space Mono at readable `1rem/1.5`; preserve authored punctuation. |

Just Go defaults to lowercase through native text helpers and `.justgo-landing`. Preserve configured/dynamic-language casing when explicitly supplied, and never lowercase user-authored event titles, organizer names, venue text, or descriptions in data transformation. CSS casing may apply only to brand-controlled labels.

### Spacing, radii, borders, and shadow

- Native spacing scale: `4, 8, 16, 24, 32, 48px`. Web page spacing should be composed from this scale; existing landing section padding uses responsive `clamp()` around 16–40 px.
- Native radii: `10, 16, 22, 28px`, pill `999px`. Native event detail uses a 44 px top sheet radius; use that only if the desktop/mobile composition is visibly a raised detail sheet.
- Scrapbook event cards and image frames are intentionally sharp: 2.5 px border, zero radius, subtle `-0.5deg` tilt, hard offset shadow. Do not round every container.
- Primary CTAs are pills: 999 px radius, orange fill, 2.5 px border, roughly 12 px vertical/20 px horizontal native padding; web landing uses `0.78rem 1.35rem` and a 4×5 px hard shadow.
- Meta chips are compact and sharp, wrapping as a group: about 10 px horizontal/5–6 px vertical, 1.5 px border, 8 px gap.
- Use tilt only for poster/sticker/card character. Never tilt long description containers, error text, or focus outlines.

## Imagery and assets

### Reusable web assets

| Asset | Location | Approved use |
| --- | --- | --- |
| Responsive standalone wordmark PNGs | `frontend/public/justgo/wordmark-1298.png`, `wordmark-1624.png` | Header/footer brand mark with existing `srcset`; transparent and optimized for the deployed host. |
| Vector wordmarks | `frontend/src/assets/pivot/just-go-wordmark.svg`, `just-go-wordmark-dark.svg` | Compact inline header where raster hero treatment is unnecessary. |
| Just Go burst/star SVGs | `frontend/src/assets/pivot/just-go-burst*.svg`, `Star 13.svg`, `Star 14.svg` | Decorative brand sticker, `aria-hidden`; do not substitute for semantic icons. |
| Film grain | `frontend/src/assets/pivot/pivot-film-grain.webp` | Desktop-only/subtle photo overlay, matching landing opacity; decorative and non-interactive. |
| Court hero crops | `frontend/public/justgo/hero-court.webp`, `hero-court-mobile.webp` | Unavailable or acquisition background only when product art is needed; use `<picture>` with the existing 899 px crop switch. |
| Social default | `frontend/public/justgo/og.jpg` | Fallback social preview, not the visible event poster unless explicitly designed. |
| App Store badge | `frontend/src/assets/pivot/download-on-the-app-store.svg` | Store action with the existing accessible store label. |
| Brand font | `frontend/src/assets/pivot/fonts/LesFlosSans.otf` | Load through existing `pivotBrandFonts.scss`, `font-display: swap`. |
| Just Go favicon/icon | `frontend/public/justgo-icon.svg` | Document/icon metadata. |

Event imagery follows the backend-approved resolved `coverImageUrl`. Render it as an actual `<img>` when it conveys event content, with concise event-specific alt text (or an empty alt only when the same event/title is adjacent and the image is purely redundant). Use `object-fit: cover`, preserve useful crop on mobile, and prevent layout shift with an aspect ratio. Missing/failed images use the existing warm near-black placeholder with the landing deck's subtle diagonal paper texture; do not substitute a Meridian logo.

## Icons

- Native event metadata uses Ionicons `time-outline`, `location-outline`, and `close`. The deployed web deck already contains small inline clock and pin SVGs with `currentColor` and `aria-hidden="true"`; reuse those shapes/components for when/where rather than adding another icon library.
- Standalone web currently uses Iconify only for existing landing actions. Prefer the existing inline SVGs for the event page to avoid a new dependency and to keep server-rendered markup stable.
- Decorative star/burst and grain assets are hidden from assistive technology. Action icons must have text or an accessible name; never rely on shape/color alone.
- A future share icon should reuse the native-established icon when Step 5.1 inventories it; do not invent it in this phase.

## Existing event patterns

### Card/Drop

The deployed `JustGoLandingDeck` is the reusable web event summary pattern:

- poster occupies 60% of a 4:7 card;
- warm-black textured fallback when the poster is absent;
- title first, then wrapping when/where pills, then organizer;
- 2.5 px border, hard shadow, no radius;
- title clamps to two lines in the deck and metadata truncates rather than widening the card;
- event description and external link are intentionally excluded from the public landing card payload.

The native `PivotEventCard` adds compact/detail variants and confirms the same ordering, colors, missing-image treatment, social proof placement, and selective scrapbook tilt. The new detail page may share card primitives/styles, but must not force full event content into the fixed-height/swipe deck card.

### Detail

The native `PivotEventDetailScreen` establishes this hierarchy:

1. close/navigation chrome;
2. large poster, expandable in app;
3. event title;
4. organizer;
5. optional editorial hook;
6. when/where pills and optional showtimes;
7. registration block/CTA and recoverable error;
8. optional movie details/social proof;
9. full description;
10. secondary calendar/action content.

For a privacy-safe public page, remove authenticated/social-only elements (friends, crews, intent state, calendar state unless later approved), but preserve the visual order: brand/header → poster → title → organizer → date/venue → lifecycle/registration action → description. The native blurred-photo sheet is inspiration for photo treatment, not a requirement to recreate a draggable bottom sheet on the web.

## Source-to-web mapping for every public-page element

| Public-page element/state | Primary existing source | Web mapping |
| --- | --- | --- |
| Document/page shell | landing `.justgo-landing` + native dark theme | Scoped dark cream canvas, standalone Just Go color scheme, no campus header/footer. |
| Brand header | landing wordmark assets and nav | Compact vector/raster Just Go mark; simple semantic header. Avoid the full marketing hero on ordinary event pages. |
| Event poster | native detail poster + landing deck hero | Responsive `<img>` in sharp scrapbook frame, `object-fit: cover`, hard border/shadow, slight tilt; stable aspect ratio. |
| Missing poster | landing `.justgo-landing-card__hero` fallback + native `eventPlaceholder` | Warm-black textured block; no broken-image icon or Meridian mark. |
| Event title | native detail `pivotHeadingStyle(28)` and card title | Instrument Sans 700 or selective Les Flos treatment; preserve authored casing; responsive size via `clamp()`. |
| Organizer | native host immediately after title; deck host | Muted/soft text below title, optional small approved organizer image; never technical catalog-org branding. |
| Date/time | `PivotEventMetaPills` and web ClockIcon | Blue sharp chip with clock icon; wrap safely and include explicit timezone where needed. |
| Venue | `PivotEventMetaPills` and web PinIcon | Yellow sharp chip with dark text and pin icon; allow wrapping/expansion on detail page instead of one-line deck truncation. |
| Lifecycle badge | native status-chip typography + ticker/sticker colors | Compact semantic label near metadata. Ended uses neutral cream/ink or ticker treatment, not disabled opacity alone. |
| Description | native full detail description | Normal document flow, readable measure around 60–70 characters, preserve paragraphs/line breaks safely; no arbitrary line clamp. |
| Primary CTA | native `PivotButton` + landing `.justgo-landing__cta` | Orange pill, hard border/shadow, accessible text, loading/disabled state, visible focus. Dynamic language supplies label. |
| Store choices | landing store link/badge | Existing App Store badge; add Google Play only from shared approved asset/config in Phase 4, with visible text fallback. |
| Loading | native font/loading and Explore loading + landing muted type | Keep branded shell and layout skeleton/stable poster space; concise mono status with `aria-live`; avoid looping decorative motion. |
| Retry-safe failure | native network banner/register error | Inline readable message near affected action; retain general app/store path. Do not replace the whole event with an unbranded browser error. |
| Unavailable | native cream-card empty states + landing hero/acquisition art | Same scoped page shell, Just Go mark, short title/body, orange general-download CTA; no event poster/title/reason leakage. |
| Ended event | detail hierarchy + status-chip language | Full published event remains visible; add ended badge, change action semantics through dynamic language, do not gray out all content. |
| Long content | native detail scroll + web responsive flow | Natural page scroll, wrapping chips, unrestricted safe description, max readable measure; no fixed-height detail card. |
| Footer | landing Just Go footer/legal | Minimal Just Go/legal/store footer only; no Meridian Go product vocabulary or campus links. |

## Responsive contract

Use the existing web breakpoints rather than inventing a second grid system:

- Below 640 px: compact header/navigation; full-width primary CTA; respect safe viewport units and sticky acquisition behavior only if it does not cover content.
- Below 720 px: single-column event detail. Poster can be wide/full-bleed within page gutters; body uses at least 16 px gutters. Existing landing sticky CTA disappears at 720 px and above.
- 720–899 px: single-column or compact two-region layout based on content; do not stretch description to viewport width.
- 900 px is the existing mobile/desktop image and landing behavior boundary. At/above it, constrain content and allow poster plus details in two columns.
- At/above 1080 px: keep a bounded content container; do not upscale the poster or type indefinitely. The event page is one detail, not the landing's four-card grid.

Recommended composition from existing patterns: mobile uses poster → content vertical flow; desktop uses a bounded two-column layout with poster on the left and event content on the right, while the full description may continue in the content column. Use `clamp()` for gutters/type and `100dvh` only for minimum shells, never to trap long content.

## Accessibility conventions

- Preserve semantic `header`, `main`, `article`, headings in order, and real links/buttons. The landing already provides a keyboard-visible skip link; include one when persistent header chrome precedes event content.
- Match deployed focus behavior: 3 px yellow outline with 2–3 px offset on CTAs/inputs; extend an equally visible focus style to every interactive control, including store and retry links.
- Native controls provide `accessibilityRole`, label, hint/state; web equivalents require accessible names plus `aria-disabled`, `aria-busy`, `aria-live`, or `role="alert"` only where semantically appropriate.
- Decorative imagery/icons use empty alt or `aria-hidden`. Content poster alt is event-specific when useful. Do not put essential text only in a background image.
- Honor `prefers-reduced-motion: reduce`. Existing entrance/deal animations and transitions are disabled; public-page content must be immediately visible without animation. Any loading indication must remain understandable without motion.
- Do not encode lifecycle/registration state by color alone. Status text and CTA state must be explicit.
- Maintain sufficient contrast using the established ink/cream and dark-text-on-yellow pairings. Avoid soft ink for essential text or controls.
- Allow zoom, text wrapping, and dynamic copy growth. Avoid fixed card heights and two-line clamps on the detail page. Touch targets should be at least 44×44 CSS px where feasible.
- Loading updates use polite live regions; actionable errors use alert semantics without repeatedly stealing focus. On unavailable pages, focus lands normally at the page heading and no hidden event content remains in the DOM or metadata.

## State review

| Reference state | Existing convention | Public-page acceptance |
| --- | --- | --- |
| Current event detail | Poster-led native detail over dark/photo surface | Same hierarchy and brand tokens; omit private/social controls. |
| Drop/event card | Web deck and native card variants | Same poster/title/meta/host grammar; detail is not constrained to deck height. |
| Loading | Cream/dark shell plus activity/status label | Stable branded shell, reserved image/content geometry, accessible status. |
| Empty | `PivotCreamCard` empty patterns and deck caught-up copy | Compact scrapbook/sticker panel with a useful next action. |
| Unavailable | No exact public event page exists | Compose from established empty card + standalone landing brand/download CTA; introduce no new visual language. |
| Missing image | Native `eventPlaceholder` and web textured fallback | Warm-black textured poster region, no broken asset. |
| Ended | No dedicated public treatment exists | Reuse status-chip typography/colors; content stays fully legible and accessible. |
| Long title/description/CTA | Detail scroll and responsive landing flow | Wrap naturally; preserve readable measure; CTA may grow vertically; no overlap or clipping. |

## Reuse plan and guardrails

Reuse directly:

- the `--jg-*` scoped token names and dark values from `JustGoLanding.scss`;
- `pivotBrandFonts.scss`, existing font files/imports, wordmark, icon, grain, fallback/social assets, and App Store badge;
- extractable web ClockIcon/PinIcon shapes and the landing CTA/card/focus/reduced-motion rules;
- native semantic ordering and token names as parity references.

Extract before reuse where practical:

- move common Just Go web variables into a scoped partial consumed by landing and event pages, without changing current rendered values;
- factor the inline clock/pin SVGs and store link into shared Just Go web components;
- factor a web event poster/meta/card primitive only if it preserves the existing landing deck exactly.

Do not reuse:

- campus/Meridian event detail components or visual tokens;
- authenticated friends/crew/intent controls on the public page;
- native-only gestures, haptics, draggable bottom sheet, or fixed swipe-deck geometry;
- unrestricted landing event payload assumptions for the public detail contract;
- new one-off colors, fonts, icon libraries, radii, shadows, or brand vocabulary.

## Gaps for later implementation

1. Web tokens currently live inside `.justgo-landing`; a shared scoped token partial/component boundary does not yet exist.
2. The web card uses Instrument Sans for titles while native also has Les Flos detail/scrapbook usage. Visual review should approve the exact event-title face before Phase 3 freezes screenshots.
3. The standalone web deployment is dark-only while native supports light/dark. The public page should initially match deployed dark Just Go unless product explicitly requires theme following.
4. No exact public unavailable or ended-event component exists. Both can be composed entirely from current tokens, empty/status patterns, and download CTA, but require review.
5. Google Play badge/art is not present in the inventoried web assets; Phase 4 must add an approved shared asset rather than drawing a substitute.
6. Existing landing deck pointer/swipe interaction is not fully keyboard-equivalent by itself; it must not be copied onto the informational event detail page.
