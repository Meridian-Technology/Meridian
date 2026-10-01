# Growth → Overview: metrics, sources, and caveats

The city Growth page opens on an investor-style overview
(`/platform-admin/pivot/:tenantKey?page=6`). It answers the questions a
consumer investor asks, in the order they ask them: is usage growing, do new
people stick, where does growth come from, is it a habit, and does it deliver
value to both sides.

API: `GET /admin/pivot/tenants/:tenantKey/analytics/overview?weeks=12` for a
city, `GET /admin/pivot/analytics/overview?weeks=12` for all cities (platform
admin; `weeks` = cohort window, 4–26). Definitions live in
`backend/utilities/pivotGrowthMetrics.js` (pure, unit-tested); loading in
`backend/services/pivotGrowthOverviewService.js`; UI in
`frontend/.../PivotGrowthOverview.jsx`.

## Unit of time: the drop week

Just Go is used once a week, so every metric is weekly. DAU/MAU would make a
healthy weekly product look broken; investors expect a product to be measured
at its natural frequency. A drop week runs from the city's drop day 00:00 UTC to
the next drop day, keyed by the same `YYYY-Www` as `batchWeek`. The drop day
comes from the tenant's drop schedule (`resolvePivotDropConfig`).

## Launch date

Each city can have a launch date (`tenant.pivotLaunchDate`, `YYYY-MM-DD`). Set,
change, or clear it on Growth → Overview; it saves through
`PUT /admin/platform/tenants/:tenantKey` with `{ "pivotLaunchDate": "2026-09-24" }`
(`null` clears it). When set, counting starts with the **drop week that contains
the launch date**:

- **Activity:** opens, swipes, and plans from earlier drop weeks are ignored. A
  pilot user's first counted week is the launch week, so they show up as *new*
  there in growth accounting.
- **Cohorts:** people who joined in an earlier week are left out of cohorts.
  Their count is shown as "N people who joined earlier are not in cohorts". They
  still count as weekly actives once they're active after launch.
- **Windows:** trends, the cohort triangle, and weeks active start no earlier than
  the launch week. Weeks active uses at most the complete weeks since launch.
- **Future launch:** if the launch week hasn't started, the Overview says when
  counting starts and shows no metrics.
- **No launch date:** all history is counted, as before.

All cities: each city's launch date is applied to that city before merging, and
the city list shows it. The fleet window starts at the earliest launch week only
when every city has a launch date.

## Activity definitions

| Definition | A person is active in a drop week when… | Source |
| --- | --- | --- |
| Opened the drop (default, = weekly active) | their app loaded that week's drop, or they acted on a card in it | `PivotDeckSnapshot` (written only by real app loads, never admin previews) ∪ `PivotEventIntent` |
| Swiped | they made any decision: pass, interested, or going | `PivotEventIntent` |
| Saved a plan | they marked a card interested or going | `PivotEventIntent.status` |

Cohort join date is `TenantMembership.createdAt` for the city.

## Metrics

| Metric | Calculation | Why investors look at it |
| --- | --- | --- |
| Weekly actives | Distinct people active (opened) in the last complete drop week. Delta vs the prior week. | The north-star count for a weekly product. |
| New members | Memberships created in the week. Hint: share who redeemed a referral (`PivotReferralRedemption`). | Top of funnel; referral share is a proxy for organic/viral growth. |
| Activation | Active in the join week ÷ joined, weighted over the 4 most recent complete cohorts. | Whether sign-ups reach the core experience. |
| Week-1 retention | Active the next drop week ÷ joined, weighted over the 4 most recent cohorts with a finished week 1. | The earliest read on stickiness. |
| Cohort retention (triangle) | Row = join week, cell = active N weeks later ÷ cohort size. The top row is weighted by cohort size and uses only finished weeks. The in-progress cell is dashed; future cells are blank, never 0%. | The most important consumer chart: a curve that flattens means a lasting core. A single week-over-week "retention" number hides this and mixes new and old users. |
| Growth accounting | Weekly actives split into new (first active week ever), retained (also active last week), resurrected (back after a gap), churned (active last week, not this week). | Shows whether growth is acquisition-driven or retention-driven. |
| Quick ratio | (new + resurrected) ÷ churned. | > 1 means the active base is growing. Mature consumer products sit around 1; fast-growing ones well above it. |
| Weeks active | Of people active at least once in the last 4 complete weeks, how many weeks each was active (1–4). | The a16z power-user curve at weekly grain: weight on the right is a habit. |
| Plan rate | People who saved a plan ÷ weekly actives. | Demand-side conversion: users getting value, not just browsing. |
| Plans saved, ticket click-throughs | Interested/going intents; people with `externalOpenCount > 0`. | Value delivered to users and to organizers (the supply side). |

## All cities

The all-cities view combines every Pivot city:

- **People count once.** Someone is identified by their global user, so a person
  in two cities is one weekly active and one member.
- **Earliest join wins.** A person in two cities joins the cohort of their first
  city, using that city's drop day.
- **Each city keeps its own week.** Activity is already keyed by drop week
  (`batchWeek`) in each city.
- **One fleet "current week".** The fleet's current and last-complete week use
  the pilot default drop day (Thursday). Cities with other drop days can sit a
  few days off that boundary.
- **Failures are visible.** A city that fails to load is listed in
  `failedCities` and shown as a warning, not silently dropped.

## Caveats to state when sharing

- **In-progress week.** The current week shows gains so far. Its churn and quick
  ratio are null until the week ends, because people who haven't opened the drop
  *yet* have not churned.
- **Join dates.** Cohorts use `TenantMembership.createdAt`. If memberships were
  backfilled for early users, their cohorts land in the backfill week.
- **"New" differs between two views.** New members count joins; growth
  accounting's new counts first *active* week. Someone can join and first
  open the drop a week later.
- **Opening the app without loading the drop is not activity.** Weekly actives
  are drop opens or card actions, not generic app events.
- **Small cohorts are noisy.** Late columns of the average come from few
  cohorts; hover a cell for its people count.
- **Scale.** Each request reads the city's full snapshot and intent history.
  That's fine for pilot cities; add weekly rollups before this runs across a
  large fleet.
- **Not covered:** revenue, CAC, and LTV (no monetization yet).

## Colors

Charts use Just Go brand tokens from `Meridian-Mobile/src/pivot/theme/pivotTheme.ts`:
- **Cohort retention:** Just Go orange `#FF4F1F` only. Each cell's opacity
  follows its rate (8% at 0%, solid at 100%). Text is ink, except white on a
  solid 100% cell. On the
  curve, the weighted average is solid orange and recent cohorts are faint orange.
- **Growth accounting:** new = `#FF4F1F`, resurrected = `#9A4B00`,
  churned = editorial blue `#1689D9`, retained = ink at 20%. The three hues pass
  the dataviz palette checker on all pairs against white.
- Every chart has a legend or a table view, and hover/focus tooltips.

## Sources

- a16z, [16 Startup Metrics](https://a16z.com/16-startup-metrics/) and
  [The Power User Curve](https://a16z.com/the-power-user-curve-the-best-way-to-understand-your-most-engaged-users/)
- Social Capital, [Diligence at Social Capital Part 1: Accounting for User Growth](https://medium.com/swlh/diligence-at-social-capital-part-1-accounting-for-user-growth-4a8a449fddfc)
- Amplitude, [Growth accounting](https://amplitude.com/blog/growth-accounting)
- Lenny Rachitsky, [What is good retention](https://www.lennysnewsletter.com/p/what-is-good-retention-issue-29)
  (6-month benchmarks; consumer social ~25% good, ~45% great)
- Sequoia, [Retention](https://articles.sequoiacap.com/retention)
- PostHog, [Retention docs](https://posthog.com/docs/product-analytics/retention)
- Headline, [Why you most likely have been calculating your average retention inaccurately](https://headline.com/blog-latest/article-latest/average-retention)
  (weighted averages over complete periods)

## Weekly report email

A weekly email to platform admins with the last complete drop week across all
cities. It's meant to go out on Sunday, but **there is no scheduler yet**. It
contains:

- the six headline numbers with week-over-week change
- where the week's actives came from (growth accounting)
- cohort retention for weeks 0–4
- a per-city table (weekly actives, new, week-1, plan rate, landing views, waitlist)
- landing totals
- a link to the fleet Growth page

Its numbers come from the same services as Growth → Overview, so the email and
the dashboard agree.

How to send it:

- **UI:** All cities → Growth → **Weekly report** previews the email and its
  recipients. "Send test to me" goes to your account only. "Send to N admins"
  asks for confirmation first.
- **CLI** (from `backend/`, with the server's env):
  - `npm run report:weekly -- --dry-run [--out=report.html]` builds it and sends
    nothing.
  - `npm run report:weekly -- --to=you@example.com` sends to those addresses only.
  - `npm run report:weekly` sends to every platform admin.
  - `--now=<ISO date>` reports as of another time.
- **API** (platform admin): `GET /admin/pivot/reports/weekly/preview` and
  `POST /admin/pivot/reports/weekly/send` with `{ "audience": "me" | "admins" }`.
  There's no default audience, so a request can't email everyone by accident.

Recipients are every platform admin (`platform_admin` or `root`, plus open
nominations), the same list as compute-job notifications. Set `FRONTEND_URL` so
the dashboard link points at production. Sending twice sends twice; there's no
"already sent this week" guard yet.

Source: `backend/services/pivotWeeklyReportService.js`,
`backend/scripts/sendWeeklyReport.js`, `PivotWeeklyReportButton.jsx`.
