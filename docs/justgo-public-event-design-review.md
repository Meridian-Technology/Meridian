# Just Go public event design and content review

Status: Phase 6.2 approved from repository reference review on 2026-08-27.

## Reference set and method

The comparison used the current standalone sources side by side:

- Native event detail: `Meridian-Mobile/src/pivot/screens/PivotEventDetailScreen.tsx`
- Native semantic tokens: `Meridian-Mobile/src/pivot/theme/pivotTheme.ts`
- Native event metadata and CTA patterns: `PivotEventMetaPills.tsx`, `PivotButton.tsx`
- Deployed web language: `JustGoLanding.scss`, its wordmark/font/grain assets, and store actions
- Public page: `JustGoPublicEvent.jsx`, `JustGoPublicEvent.scss`, and its ready/unavailable/loading tests

The managed environment did not permit localhost listeners or Safari WebDriver, so new bitmap browser/simulator captures could not be produced in-session. The review therefore used the same source-backed mobile/web reference mapping approved in Phase 1, responsive CSS inspection at the 760 px breakpoint, DOM-state tests, and the production web build. Bitmap capture remains a release-checklist item on a production-equivalent host; no claim of device screenshot approval is made here.

## Side-by-side findings

| Element | Native / deployed reference | Public page result | Decision |
| --- | --- | --- | --- |
| Product shell | Dark cream `#1e1a16`, light ink `#faf6ef`, standalone wordmark | Same scoped values and Just Go vector wordmark | Approved |
| Typography | Instrument Sans UI, Les Flos event display, Space Mono metadata/prose | Same three-family roles; description corrected to Space Mono | Approved |
| Poster | 4:5 scrapbook image, 2.5 px hard border, tilt and hard shadow, sharp frame | Same; one-off 18/24 px rounding removed | Approved |
| Information order | Poster, title, host, when/where, action, description | Organizer moved immediately below title; private/social controls absent | Approved |
| CTA hierarchy | Orange, bordered, hard-shadow pill as primary | Registration/app CTA and unavailable acquisition use the same pill; stores remain secondary | Approved |
| Status | Compact textual sticker; ended remains fully legible | Ongoing/ended labels use semantic copy and distinct sticker colors | Approved |
| Responsive behavior | Single-column mobile; bounded desktop composition | One column below 760 px, two-column bounded layout above; content wraps naturally | Approved |
| Missing image | Warm near-black branded placeholder, never Meridian artwork | Branded text fallback with no broken image or Meridian mark | Approved |
| Loading | Branded shell with concise live status | Polite live status and reduced-motion fallback; geometry is not skeletonized | Approved with follow-up option |
| Unavailable | Generic Just Go empty state and acquisition action | Identical visitor treatment for all causes, no event data, primary store action | Approved |
| Long/configured copy | Preserve configured casing and allow growth | Semantic-key resolution, token interpolation, wrapping CTA and long-content tests | Approved |
| Accessibility | Semantic structure, visible focus, 44 px actions, reduced motion | Header/main/article/H1, skip link, visible focus, live status, accessible image/action names | Approved |

## Content and branding audit

- Visitor-facing labels come from the public-event semantic key allowlist and preserve configured casing.
- User-authored title, venue, organizer, and description casing is untouched.
- Registration capability controls CTA semantics; external/in-app registration is not inferred from copy or URL shape.
- Unavailable states do not disclose whether an event is private, missing, removed, colliding, or inaccessible.
- The public component and stylesheet contain no `Meridian`, `Meridian Go`, campus navigation, campus logo, Satoshi font, attendee, friend, or crew UI references.
- Store URLs remain shared configuration values; no one-off destination was introduced during review.

## State approvals

Approved by source, DOM, accessibility, and build evidence for desktop and mobile compositions:

- Default upcoming/registerable event
- Configured language overrides and configured casing
- Missing and failed imagery
- Long title, venue, organizer, description, and CTA copy
- Generic unavailable state
- Ended/non-registerable event

Remaining production-like visual check: record actual iOS, Android, 390 px web, and 1440 px web bitmap captures once a host/simulator with network listeners is available, and attach them to the release checklist without changing these acceptance rules.
