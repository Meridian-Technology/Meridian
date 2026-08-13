# Pivot Ops — dashboard DNA

Quiet ops register for dense Platform Admin / Just Go tenant dashboards.

This intentionally diverges from Just Go Creator [BRANDING.md](../../pages/JustGoCreator/BRANDING.md). Creator Reskin/Flare is for submission and consumer voice. Pivot Ops is for granular operational data.

## Tokens

Defined on `.pivot-ops` in `pivotOpsTokens.scss`.

| Role | Value |
| --- | --- |
| Canvas | `#F5F4F2` |
| Card surface | `#FFFFFF` |
| Ink | `#1A1714` |
| Accent | `#FF4F1F` (Just Go orange only — never Linear purple) |
| Card radius | `22px` |
| Control radius | `14px` |
| Chip radius | `10px` (not full pills for status) |
| Corner shape | `squircle` (progressive — circular `border-radius` fallback) |
| Type | Inherit the admin shell — do not force Instrument Sans / display fonts on cards |

## House rules

1. **White rounded cards** are the primary section surface (`PivotOpsCard` / `PivotOpsSection`).
2. **Sentence case** on labels, chips, and table headers. No `text-transform: uppercase` eyebrows.
3. **Orange, not purple.** Charts, funnels, focus, and CTAs use `--pivot-ops-accent`.
4. **Status chips** use soft radius + muted fills (`PivotOpsStatus`). Reserve pills for primary CTAs only.
5. **No scrapbook chrome** on ops pages — no burst stickers, cream washes, glow orbs, or shimmer.
6. **Icons act, they don't decorate.** Prefer text labels for metrics and meta.
7. **Tabular numerals** on every count.
8. **Build from kit primitives** — do not invent a parallel SCSS dialect per tab.

## Primitives

| Component | Use |
| --- | --- |
| `PivotOpsPage` | Sticky header + title/subtitle/actions + scroll body |
| `PivotOpsCard` | White bordered card |
| `PivotOpsSection` | Card with title / description / actions |
| `PivotOpsMetric` / `PivotOpsMetricGrid` | KPI cells |
| `PivotOpsStatus` | Sentence-case status chip |
| `PivotOpsBanner` | Alert / callout |
| `PivotOpsFunnel` | Row-style conversion funnel (journeys / dense lists) |
| `PivotOpsAreaFunnel` | Compact visx area funnel (overview loop) — adapted from ClubDash `FunnelChart` |
| `PivotOpsBarList` | Ranked / rate horizontal bars (prefer over metric grids when comparing) |
| `PivotOpsStack` | Composition stacked bar + legend |
| `PivotOpsHeatRow` | Single-row intensity pulse (retention / activity by week) |

Prefer visual panels (trend + composition + bars) over grids of lone numbers when the payload has mix, rank, or series data.

## Registers (for orientation)

| Register | Surfaces | Look |
| --- | --- | --- |
| Creator Flare | Gates, empties, confirmations | Scrapbook, burst, stamps |
| Creator Reskin | Creator lists / forms | White sharp panels, orange CTAs |
| **Pivot Ops** | Tenant Overview / Curation / Journeys | White rounded cards, orange accent |
