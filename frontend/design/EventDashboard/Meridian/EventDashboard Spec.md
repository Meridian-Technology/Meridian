# EventDashboard — Lifecycle Redesign Spec

**Status:** Ready for implementation
**Owner:** Design → Eng handoff
**Scope:** Replace the current monolithic `EventDashboard` (and the parallel `EventDashboardFocused` variant) with four state-aware surfaces driven by a single component that branches on event lifecycle.

---

## 1. Problem statement

The current `EventDashboard` is a single dense surface that renders the same nine-tab layout regardless of where an event is in its lifecycle. This causes:

1. **Decision fatigue** — 9 tabs + 5 header CTAs visible at all times.
2. **No focus** — equal-weight panels for unrelated tasks (Event Preview vs. Registration Chart).
3. **Status-blind chrome** — a concluded event still pushes "Send announcement" and "Preview" as primaries.
4. **Stat noise** — 3+ stats above the chart with similar visual weight.
5. **Wasted vertical space** — sidebar + ambient header + title + meta strip + banner + tabs ≈ 480px before content.
6. **No "what now" surface** — pending follow-ups (feedback, thank-yous, returns) hide inside tabs.

## 2. Solution overview

The dashboard becomes **four products that share a data layer**:

| Code | Lifecycle state | Trigger condition | Primary jobs |
|---|---|---|---|
| `created` | Just created (draft) | `event.status === 'draft'` and required fields incomplete | Complete setup checklist; reach a publishable state |
| `preparing` | Published, future-dated | `status === 'published'` && `start_time > now` | Outreach, tasks, run-of-show prep |
| `live` | Day-of, in progress | `start_time <= now <= end_time` | Check-in, agenda advance, issue triage |
| `concluded` | Past | `end_time < now` | Post-mortem, feedback collection, wrap-up tasks |

A single `EventDashboard` component reads `dashboardData.stats.operationalStatus` (and existing `event.status`) and routes to one of four `DashboardShell` variants. The existing `useFetch('/org-event-management/${orgId}/events/${eventId}/dashboard')` call is unchanged.

## 3. Visual reference

Designs live in `EventDashboard Redesign.html` (this project). Each artboard is 1440×980 and is the source of truth. Take inspiration from styling but re-imagine it in Meridian's existing design language

### 4.3 Components to build (shared across all four states)

Build these as small presentational components in `components/EventDashboard/components/shared/`:

- **`<WorkspaceRail items={...} label />`** — left rail of workspace areas, replaces `TabbedContainer`. Each item: `{key, label, count?, active?, disabled?, alert?, live?}`. Width 184px. Disabled items show "LOCKED" mono microlabel.
- **`<StatusPill tone="draft|prep|live|past" label dot />`** — status badge. Live tone has pulsing 0 0 0 3px tint shadow on dot.
- **`<HeroNumber value delta tone subtitle />`** — Fraunces big number + tinted delta chip.
- **`<MeterBar value max tone />`** — 4–6px filled bar.
- **`<EyebrowLabel>`** — mono 10.5px uppercase eyebrow.
- **`<AttentionItem tag body cta primary />`** — used in "Needs attention" / "Wrap-up" panels.
- **`<RailLabel><RailValue>`** — for stat rows in readiness panels.

### 4.4 Header pattern (all four states)

Top of canvas, padding `24px 40px 0`:

```
[← back btn] [breadcrumb mono]
[H1 Fraunces 44px] [StatusPill]
[meta strip: date · time · venue · host (state-dependent)]
                                                    [secondary btns] [primary CTA]
```

Primary CTA is **state-specific** (see each state below). Secondary buttons collapse into a "More" overflow on viewports < 1280px.

## 5. State-by-state spec

### 5.1 `created` — Just created (empty event)

**Trigger:** `event.status === 'draft'`.

**Header**
- Breadcrumb: `EVENTS / NEW · DRAFT`
- StatusPill: `tone="draft"`, label = `Draft · not visible to anyone`
- Meta: `Created {relative time} · Auto-saved`
- Secondary: `Discard`
- Primary: `Publish · {N} steps left` — **disabled** until checklist complete; computes `N = totalSteps - completedSteps`.

**WorkspaceRail items**
```js
[
  { key: 'overview',  label: 'Setup',  count: '2/8', active: true },
  { key: 'schedule',  label: 'Schedule',     disabled: true },
  { key: 'tasks',     label: 'Tasks',        disabled: true },
  { key: 'people',    label: 'People',       disabled: true, count: 0 },
  { key: 'jobs',      label: 'Jobs',         disabled: true },
  { key: 'comms',     label: 'Communications', disabled: true },
  { key: 'insights',  label: 'Insights',     disabled: true },
]
```

**Body — two stacked panels:**

1. **Progress hero** (white card)
   - Eyebrow `SETUP · {done} OF {total}`
   - H2 Fraunces 28px: `"You're ~{minutes} minutes away from a publishable event."` (computed from sum of remaining `mins`)
   - 8-segment progress meter (filled = green primary, unfilled = bg-soft)
   - Right-aligned: small empty poster placeholder (replaced when uploaded).

2. **Setup checklist card** (white card, divider rows)
   Each row: `[circle: checkmark / number / current dot] [title + sub] [~Xmin] [CTA]`
   - Done rows: title strikethrough, ink-3.
   - Current row: full row tinted `--ed-primary-tint`, primary "Continue →" CTA on right.
   - Future rows: muted, "Open" ghost button.
   - Final row tagged `FINAL STEP` mono microlabel.

   Steps (this order, this copy):
   1. Name your event
   2. Pick a date
   3. Add a location *(required to publish)*
   4. Write a description
   5. Upload a poster or hero image *(optional but events with a poster see 3× more registrations)*
   6. Build a registration form
   7. Set capacity & expected attendance
   8. Publish

**Footer note:** `ⓘ Tasks, registrations, communications and insights unlock once your event is published.`

**Backend hooks**
- Each step maps to a field on the event document. "Done" rule:
  - `name`: `event.event_name?.trim().length > 0`
  - `date`: `event.start_time && event.end_time`
  - `location`: `event.location?.trim().length > 0`
  - `description`: `event.description?.length >= 100`
  - `poster`: `event.poster_image_url`
  - `regForm`: `event.registrationFormId`
  - `capacity`: `event.expectedAttendance > 0`
  - `publish`: requires above + `event.status !== 'draft'`
- "Add location" CTA opens the existing `EventEditorTab` scrolled to the location field.

---

### 5.2 `preparing` — Before the event

**Trigger:** `event.status === 'published'` and `start_time > now`.

**Header**
- StatusPill: `tone="prep"`, label = `"Published · {daysOut} days out"` (or hours if < 1 day).
- Meta: full date/time/venue.
- Secondary: `Preview page`
- Primary: `Send announcement` (paper-airplane icon).

**WorkspaceRail**
```js
[
  { key: 'overview', label: 'Overview', active: true },
  { key: 'schedule', label: 'Schedule', count: agenda.items.length },
  { key: 'tasks',    label: 'Tasks', count: openTaskCount, alert: hasOverdueTasks },
  { key: 'people',   label: 'People', count: registrationCount },
  { key: 'jobs',     label: 'Jobs', count: openJobCount },
  { key: 'comms',    label: 'Communications', count: pendingAnnouncementCount },
  { key: 'insights', label: 'Insights' },
]
```

**Body:**

1. **Countdown hero** (white card, two columns split by vertical divider)
   - **Left column (1.1fr):**
     - Eyebrow `EVENT STARTS IN`
     - Big number: days remaining (96px Fraunces)
     - Inline: `days` + `{hours} hrs · {minutes} min`
     - 30-segment progress bar showing position from creation date → start date. Filled segments = primary.
     - Footer: `{createdDate} · created` — `today` — `{startDate} · live`
   - **Right column (1fr):** "This week — {N} items need you"
     - Up to 4 task rows: `[avatar circle][body][due chip]`. Avatar background = warn-soft for urgent, bg-soft for normal.
     - Pull from `tasks` filtered to `dueDate <= now + 7d`, ordered by due date.

2. **Three-panel row (1.3fr / 1fr / 1fr):**
   - **Registration pace** — title, big number `registrationCount`, sub `of {expected} expected · {pct}%`, delta line (this week + on-track copy), small sparkline with goal dashed line. Reuse existing `EventDashboardChart` rendered at small height (~110–130px) with no header/legend.
   - **Outreach** — list of `Announcement` rows: initial / mid-cycle / final push / day-of. Done rows show date sent + reach; current row primary-bordered; future rows muted with suggested send date. Wires to `Communications` data.
   - **Run-of-show readiness** — 5-row checklist of: Schedule blocks, Speakers confirmed, Volunteer roles, Equipment booked, Venue walkthrough. Each row: label + ratio in primary (good) or warn (incomplete).

---

### 5.3 `live` — During the event

**Trigger:** `start_time <= now <= end_time`.

**Visual identity:** dark slim live header, lighter body. This is the only state with a colored chrome.

**Header (replaces standard header — full-width dark bar, padding `14px 32px`):**
- Background `#1c2520`, color white.
- Left: back button (transparent border) + live pulse pill (`LIVE · DAY {N}`) + event name (medium weight, opacity 0.85) + `{wallClockTime} · {elapsed} elapsed` (mono).
- Right: `Page volunteers` (ghost) + `Send announcement` (orange `--ed-live-accent` solid).

**WorkspaceRail** (label `LIVE OPS`, white card panel)
```js
[
  { key: 'live',     label: 'Live ops',  active: true, live: true, count: 'NOW' },
  { key: 'checkin',  label: 'Check-in',  count: checkedInCount, live: true },
  { key: 'schedule', label: 'Schedule',  count: `${currentBlockIdx}/${totalBlocks}` },
  { key: 'tasks',    label: 'Tasks',     count: liveTaskCount, alert: true },
  { key: 'people',   label: 'People',    count: registrationCount },
  { key: 'jobs',     label: 'Jobs',      count: jobCount },
  { key: 'comms',    label: 'Communications', count: 0 },
]
```

**Body:**

1. **"Happening now" command bar** (dark gradient card)
   - Eyebrow `HAPPENING NOW · {room}`
   - H2 Fraunces 28px: current agenda block title + speaker
   - Sub: `{startTime} – {endTime} · ends in {N} minutes` (red-tinted if running over)
   - Right: `View slot` (ghost) + `Advance →` (mint solid, advances to next agenda item).

2. **4-tile readiness row** (white cards, equal width)
   - `Checked in`: count / total registered, meter, `{pct}%` accent.
   - `Capacity`: `{checkedIn}/{venueCapacity}` ratio.
   - `On schedule`: `+{minutes}` running over (warn tone if > 0). Meter shows position in day.
   - `Issues`: count of open ops issues, warn tone, sub = top issue summary.

3. **Two-column row (1.2fr / 1fr):**
   - **Check-in flow · last 60 min** — sparkline (`color="#c4533a"`), three sub-stats: peak rate, current rate, no-shows. `Open scanner` button.
   - **Up next** — agenda from current block onward (next 6 items). The next block has primary-tint background + `NEXT` mono badge. Each row: `[time mono][title + room]`.

**Polling:** check-in count and "happening now" should poll every 15s while user is on this view.

---

### 5.4 `concluded` — Post-mortem

**Trigger:** `end_time < now`.

**Header**
- Breadcrumb: `EVENTS / RETROSPECTIVE`
- StatusPill: `tone="past"`, label = `"Concluded · {daysAgo} days ago"`
- Meta: full date/time/venue.
- Secondary: `Duplicate for {nextYear}`
- Primary: `Share report` (dark `--ed-ink` solid, NOT primary green).

**WorkspaceRail**
```js
[
  { key: 'overview',  label: 'Retrospective', active: true },
  { key: 'feedback',  label: 'Feedback', count: feedbackResponseCount },
  { key: 'people',    label: 'Attendees', count: checkedInCount },
  { key: 'tasks',     label: 'Wrap-up', count: openWrapupTasks, alert: true },
  { key: 'insights',  label: 'Insights' },
  { key: 'archive',   label: 'Archive' },
]
```

**Body:**

1. **Outcome statement** (white card, 1.4fr / auto)
   - Eyebrow `OUTCOME` (primary green)
   - H1 Fraunces 36px: one-sentence summary template:
     `"{registrationCount} {audience} showed up — {deltaPct}% over your {expectedAttendance}-attendee goal, with a {showRate}% show-rate and {avgRating} / 5 average rating."`
   - Where `{audience}` is auto-picked from event template/tags ("builders", "guests", "attendees", default "people").
   - Sub: list of remaining wrap-up follow-ups in plain English.
   - Right: poster thumbnail tilted 2°, drop-shadow.

2. **Scoreboard** (white card, 4 columns separated by `1px solid --ed-line`)
   Each column: eyebrow / Fraunces 44px value / delta chip / "expected X" / italic 12px explainer.
   Required metrics:
   - Registrations (vs. expected).
   - Showed up (count + show-rate %).
   - Avg. rating (from feedback).
   - NPS (warn tone if response rate < 30%).

3. **Two-column row (1.4fr / 1fr):**
   - **What attendees said** — top 4 feedback themes as horizontal bar rows: `{themeText} ··· {pct}%`. Bar color: primary (>50% positive), `#c4a44a` mixed, warn negative. Theme extraction = backend job (out of scope here; for v1, use response tags).
   - **Wrap-up** — `<AttentionItem>` list. Top item primary-tinted ("Send feedback follow-up to {N} silent attendees"), rest are neutral ("$X prize disbursement", "Equipment return — {N} items").

## 6. Architecture

### 6.1 File structure

```
components/EventDashboard/
  EventDashboard.jsx              ← thin router
  EventDashboard.scss             ← tokens + base
  shells/
    CreatedShell.jsx
    PreparingShell.jsx
    LiveShell.jsx
    ConcludedShell.jsx
  components/shared/
    WorkspaceRail.jsx
    StatusPill.jsx
    HeroNumber.jsx
    MeterBar.jsx
    EyebrowLabel.jsx
    AttentionItem.jsx
    DashboardHeader.jsx           ← shared layout, slots for state-specific bits
  state/
    useEventLifecycleState.js     ← derives 'created' | 'preparing' | 'live' | 'concluded'
    useSetupChecklist.js          ← created-state checklist completeness
    useThisWeekTasks.js
    useLiveOpsPolling.js
```

### 6.2 Routing logic

```js
function getLifecycleState(event, stats) {
  if (event.status === 'draft') return 'created';
  if (stats?.operationalStatus === 'completed') return 'concluded';
  const now = Date.now();
  const start = new Date(event.start_time).getTime();
  const end   = new Date(event.end_time || event.start_time).getTime();
  if (now >= start && now <= end) return 'live';
  if (start > now) return 'preparing';
  return 'concluded';
}
```

`EventDashboard.jsx` keeps the data fetch, onboarding, error handling, and announcement spotlight. The router only chooses a shell:

```jsx
const state = getLifecycleState(event, dashboardData?.stats);
const Shell = { created: CreatedShell, preparing: PreparingShell,
                live: LiveShell, concluded: ConcludedShell }[state];
return <Shell event={event} dashboardData={dashboardData} ... />;
```

### 6.3 Migration

- `EventDashboardFocused` is deprecated and routed through the new component. Delete after one release.
- The `overlayRegistry.js` `default` and `focused` variants both resolve to the new `EventDashboard`.
- `useDashboardOverlay.showEventDashboardFocused` becomes an alias for `showEventDashboard`.
- The current `EventDashboardHeader` is retired; only `DashboardHeader` (shared) remains.
- The old tab system (`TabbedContainer` of 9 tabs) is replaced with the rail. All nine tab bodies are kept and rendered when the corresponding rail item is active. Routing inside the dashboard remains URL-driven (`?tab=` param).

## 7. Behaviour & data

### 7.1 Existing endpoints reused

- `GET /org-event-management/${orgId}/events/${eventId}/dashboard` — primary fetch (unchanged).
- `GET /org-event-management/${orgId}/events/${eventId}/registrations/growth` — for sparklines.
- `GET .../checkins/recent?window=60m` — **new lightweight endpoint** for the Live state's check-in flow chart.
- `GET .../tasks?dueWithin=7d` — for "this week" panel (preparing state).

### 7.2 New endpoints

- `GET /org-event-management/${orgId}/events/${eventId}/setup-progress` — returns `{ completed: [...stepKeys], total: N, etaMinutes: M }`. The frontend can compute this client-side too; surface it as an endpoint so it can be cached.
- `POST .../advance-agenda` — advances the current agenda block. Used by Live state's `Advance →` button.
- `GET .../feedback-themes` — returns top 4 themes with pct + tone for the concluded state. v1 may compute this from response tags; v2 = ML.

### 7.3 Polling

- Live state polls `/dashboard` and `/checkins/recent` every 15s. All other states do not poll.
- Pause polling when `document.hidden`.

### 7.4 Empty / loading / error

- Loading: keep the existing skeleton but adapt per shell (e.g., the Created shell shows skeletons of checklist rows).
- Errors: existing `addNotification` toast + retry on dashboard fetch; preserved from current implementation.

## 8. Accessibility

- All state pills have `aria-label` including the readable status ("Event status: live, day 1").
- Live pulse uses `prefers-reduced-motion: reduce` to disable the box-shadow pulse animation.
- WorkspaceRail items are `<a>` with `aria-current="page"` on the active item. Disabled items use `aria-disabled="true"` and are non-tabbable.
- All big-number tiles have a hidden `<span class="visually-hidden">` describing the relationship ("177 registrations, 77% over goal").
- Color is never the sole indicator — every warn-toned item has a text label or icon.

## 9. Analytics

Add events:
- `event_dashboard_state_view` `{state, eventId, orgId}` — fired once per state per session.
- `event_dashboard_state_transition` `{from, to, eventId}` — for Live ↔ Concluded transitions.
- `event_dashboard_setup_step_complete` `{step, eventId}` — Created state.
- `event_dashboard_advance_agenda` `{fromBlockId, toBlockId}` — Live state.

Existing `event_workspace_view` and `event_workspace_tab_view` are kept; rename the latter to `event_dashboard_rail_view` if convenient.

## 10. Acceptance criteria

- [ ] Lifecycle state is correctly derived from `event.status`, `start_time`, `end_time`, and `stats.operationalStatus`.
- [ ] Each shell matches the corresponding artboard at 1440×980 within 4px tolerance.
- [ ] No header has more than one primary CTA.
- [ ] WorkspaceRail count badges reflect live data.
- [ ] Created state's `Publish` button is disabled until all required steps complete.
- [ ] Live state polls and pauses when tab is hidden.
- [ ] Concluded state's outcome sentence renders correctly when any of `expectedAttendance`, `feedbackCount`, or `avgRating` is missing (graceful fallback copy: "showed up — feedback collection in progress").
- [ ] Existing `EventDashboardOnboarding`, announcement spotlight, and post-mortem overlay continue to work.
- [ ] Existing analytics events continue to fire; new events fire once per state.
- [ ] `EventDashboardFocused` consumers redirect to the new `EventDashboard` with no behavioral regression.

## 11. Out of scope (v1)

- ML-powered feedback theme extraction (v1 = response tags).
- Multi-day live state UX (Day 2 chips, between-days "lull" view) — v1 treats every day-of as Day 1.
- Mobile layout — v1 is desktop-only; the existing mobile preview component is unchanged.
- Operator/admin variants (`AdminEventOperatorPage`) — out of scope; they will continue using the legacy components until a follow-up.

---

**Reference:** see `EventDashboard Redesign.html` in this project for the four artboards, the diagnosis card, and the shared chrome components.
