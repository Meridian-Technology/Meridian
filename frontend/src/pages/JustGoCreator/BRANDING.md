# Just Go Creator — branding (admin console)

**The console is a submission docket, not a dashboard.** Everything here orbits one ISO drop week
the creator does not control, and the phase names (Drafting / Planning / Run of Show / Post Mortem)
are production call-sheet language. Style to that: the week is the document number, figures are
tabular numerals set on the canvas, structure comes from rules, and the curation verdict is stamped.

**Two registers.** The skeleton stays Meridian; the skin is Just Go, and Just Go–specific flows get
the full consumer voice. Decide which register a surface belongs to *before* styling it.

| Register | Applies to | Looks like |
| --- | --- | --- |
| **Reskin** | Anything ported from Meridian — shell chrome, event list, forms, tables, the event workspace | White canvas, ink type and borders, orange pill CTAs, sharp status pills. Same skeleton and components as the original, `--jg-*` tokens swapped for Atlas gradients. **No layout churn.** |
| **Flare** | Net-new Just Go flows — invite-only gate, submit → curation confirmation, drop-week / status banners, empty and zero states | Scrapbook title strips (`PivotScrapbookTitle`), burst stickers, `--jg-ticker` / `--jg-pop` / `--jg-sage` chips, lowercase Les Flos display type |

Flare is concentrated on gate / confirm / empty / zero-state moments. It is **never** card chrome in
a data-dense view.

## The sign-in page

`JustGoCreatorLogin` is the exception to nearly everything below it, and deliberately so: it is the
creator's first impression of Just Go, it renders outside the shell, and it is a straight port of
the mobile `PivotAuthScreen` rather than a reskin of Meridian's `/login`. Values come from
`Meridian-Mobile/src/pivot/theme/pivotTheme.ts`; keep the two clients in sync when either moves.

| Element | Spec |
| --- | --- |
| Ticker | Full-bleed `--jg-ticker` bar, 2px ink bottom rule, Space Mono lowercase, marquee looping three identical segments |
| Photo | `pivot-hero-canopy.webp` full-bleed under the lo-fi stack — warm cast, top / bottom / side vignettes, then film grain at 0.24 `overlay`. Vignettes run heavier than the mobile values because a landscape crop gives type far less darkness to sit on |
| Wordmark | `just-go-wordmark.svg`, rotated `-1.2deg` with a hard drop shadow, above the tagline |
| Card | Cream fill, **2.5px** ink border, 4px accent top stripe, `rotate(-0.5deg)`, hard shadow `2px 3px 0 rgba(26,23,20,0.22)` |
| Fields | Underline only — 2px ink bottom border, no box, accent on focus |
| Buttons | Accent pill primary that drifts `translate(1px, 2px)` on press; ink-outline pill secondary |

Rules that took a few passes to land, so don't undo them:

- **The photo runs the full width and everything sits on it**, the way the card sits on the hero in
  the app. There is no white column: footnotes on this page are cream with a text shadow, not ink.
- **Wordmark, card and footnotes are one centred stack.** The stack is wider than the card so the
  tagline holds one line on a desktop; the card keeps its own narrower measure inside it.
- **The vertical budget is tight.** Wordmark plus card plus footnotes only just clears a laptop
  viewport, so a `max-height` query shrinks the brand block and tops-aligns the stack rather than
  letting the form fall below the fold. Adding anything to this page means taking something out.
- **Use the current mark.** `just-go-wordmark.svg` mirrors `just-go-wordmark-1.svg` in the mobile
  app (svgo, precision 2, `removeViewBox` off). It is cream-on-dark, so it belongs on the photo;
  white surfaces keep `just-go-wordmark-dark.svg`.

This is the only console surface that gets a photo. Don't extend the treatment inward.

## Tokens

Defined on `.justgo-creator` in `justGoCreatorTokens.scss`. The shell owns the block, so page SCSS
consumes the variables without re-importing the partial.

### Canvas and ink (both registers)

| Token | Value | Use |
| --- | --- | --- |
| `--jg-canvas` / `--jg-surface` | `#FFFFFF` | Shell and panel backgrounds. **White replaced the earlier cream shell.** |
| `--jg-surface-subtle` | `#F7F6F4` | Insets, table headers, hover fills |
| `--jg-ink` | `#1A1714` | Primary text |
| `--jg-ink-muted` / `--jg-ink-soft` | ink @ 72% / 50% | Body copy, meta and eyebrows |
| `--jg-border` | ink @ 14% | Default hairlines |
| `--jg-border-strong` | `#1A1714` | Scrapbook-weight edges (flare, and the odd emphasized row) |
| `--jg-accent` | `#FF4F1F` | Primary pill CTAs, live status |
| `--jg-on-accent` | `#FFFFFF` | Type on accent |

### Pops — flare register only

| Token | Value | Use |
| --- | --- | --- |
| `--jg-ticker` | `#4AB5FF` | Flare chips and strips |
| `--jg-pop` | `#FFD23F` | Highlight chips |
| `--jg-burst` | `#FF2A2A` | Sticker accents |
| `--jg-sage` | `#5FD068` | Positive sticker accents |
| `--jg-cream` | `#FAF6EF` | Flare strip fills and photo washes, the masthead week block, and the stamp field — **not** a shell background |

Using a pop on a list row, table cell, form field, or status pill is a bug.

## House rules

These exist because the console drifted into generic-dashboard vernacular once already. Each rule
names the pattern that caused it.

| Rule | Why |
| --- | --- |
| **No stat-card grids.** Figures go in `.jg-tally` — value over label, hairline dividers, no box. | A `repeat(auto-fit, minmax(…))` grid of bordered cards, each a big number over a tiny uppercase label, is the single most generic dashboard component there is. |
| **Mono is for machine values only** — the week token, the stamp, chart dates. Not labels. | Space Mono had spread to ~10 label roles. When every label is an uppercase eyebrow, none of them is emphasis; it just becomes texture. |
| **Icons act, they don't decorate.** Buttons, nav items, and the row chevron keep icons. Meta lines, detail rows, and figures do not. | An icon per label reads as filler. |
| **Rules, not boxes.** Blocks are separated by hairlines (`--jg-border`) and closed by ink rules (`--jg-border-strong`). Reach for a border box only when the content is genuinely a container — the QR, an input. | Everything on the page had become the same 1px bordered rounded rectangle, so nothing had hierarchy. |
| **Sharp by default.** `--jg-radius` is 2px and `--jg-radius-sharp` is 0. The pill (`--jg-radius-pill`) is only for CTAs and toggle chips. | Soft 4px corners everywhere read as stock admin chrome and fought the cut-paper brand. |
| **Tabular numerals** (`font-variant-numeric: tabular-nums`) on every count. | Columns of figures should line up. |

## The masthead and the stamp

`.jg-masthead` is the console's one loud surface, and the boldness budget is spent there so
everything below it can stay quiet. Do not add a second signature element.

- **Cover** — the listing's own image at the left, sharp-bordered. Optional, so the masthead is
  laid out with flex rather than grid: a missing grid child let the stamp fall into the flexible
  track and stretch the full page width.
- **Drop week** — a quiet line under the dateline, with the week itself in mono as a machine value.
  The unassigned fallback is prose, so it is *not* set in mono.
- **Stamp** (`.jg-stamp`) — the curation verdict as a struck mark, not a badge: mono uppercase,
  2px ink border with a second rule set off via `outline` + `outline-offset`, rotated `-4deg`.
  Rotation below about 3° reads as a crooked badge rather than a stamp, which is worse than either.
  Tones follow ingest status: draft cream, staged ink, published accent.
- The header's heavy 2px rule closes the masthead **and** its figures, so the whole head reads as
  one document. Don't rule the masthead separately.

The dense `.jg-status` pill still exists and is still correct for list rows and tables — the stamp
is a masthead-only treatment.

## Motion

Ported wholesale from `EventDashboardFocused` — the console should feel like the dashboard it came
from. Tokens live on `.justgo-creator`; don't hardcode durations or curves.

| Token | Value | Use |
| --- | --- | --- |
| `--jg-ease` | `cubic-bezier(0.22, 1, 0.36, 1)` | Anything that changes size or position. The signature curve of the ported stack — reach for this first. |
| `--jg-ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Exits only |
| `--jg-dur-hover` | `200ms` | Colour-only interaction states, with plain `ease` |
| `--jg-dur-fade` | `280ms` | Opacity |
| `--jg-dur-resize` | `380ms` | Size changes (cover thumb, title font-size, padding, gap) |
| `--jg-dur-collapse` | `440ms` | `max-height` collapses |

Entrance is a **staggered shell → sidebar → main** at 260 / 280 / 300ms on `--jg-ease`, which is
where most of the original's polish actually lives. Tab panels re-run a 260ms enter whenever they
become active. The stamp strikes in once at 320ms.

**Collapse with `max-height` + `opacity`, never `display: none`.** `display` is not animatable, and
using it was what made the condensed header pop on scroll. A zero-height flex child still earns its
gap, so cancel that with a negative `margin-top` (see `.jg-tally--masthead`).

Every animated surface needs a `prefers-reduced-motion: reduce` block that sets `animation: none`
and `transition-duration: 0.01ms`, and clears hover transforms. The original does this thoroughly;
match it.

## Wordmark and type

- Wordmark: `src/assets/pivot/just-go-wordmark-dark.svg` on white.
- Headings: Instrument Sans (`--jg-font-display`); eyebrows and meta: Space Mono (`--jg-font-mono`).
- Les Flos (`--jg-font-flos`) is welcome on the wordmark, panel and section titles, and flare
  moments. It is not required on dense admin labels.
- No Atlas gradients, ClubDash logos, or `useGradient()`.

## Copy

All creator-facing strings live in `justGoCreatorCopy.js` — Just Go voice only ("your listing",
"this week's drop", "interested"). No Atlas / Meridian / ClubDash / campus org language.
