# Pivot tenant dashboard: Growth outcome

Launch (`?page=6`) and Analytics (`?page=11`) are one city **Growth** panel at
`?page=6`: everything before a person is in the app. (Audience covers what
happens after.) Each view loads only its own data, so waitlist contacts are
fetched only on the Waitlist view.

| View | URL | Contents |
| --- | --- | --- |
| Overview | `growth` absent (default) | Investor view: weekly actives, activation, cohort retention, growth accounting, weeks active, value delivered. See `pivot-growth-overview-metrics.md`. |
| Landing | `growth=landing` | Landing mode switch; public link (copy, open); 28-day landing funnel, views chart, views by source. |
| Waitlist | `growth=waitlist` | Paged signups, CSV download, remove row. |
| QR codes | `growth=qr` | QR views and legacy hops; QR-attributed views by code; tracking QR manager. |
| Acquisition | `growth=acquisition` | Monthly acquisition funnel with month picker (← / →, R). |

The header shows Refresh for the open view (Overview, Landing, Waitlist, or QR codes)
or the month picker and Refresh on Acquisition.

Sources: `PivotTenantGrowthPage.jsx` (was `PivotTenantLaunchPage.jsx`),
`PivotAcquisitionFunnel.jsx` (funnel data hook, header controls and body,
shared with fleet Growth), `PivotLandingQrManager.jsx`, and
`PivotTenantViewTabs.jsx` (the view switch, shared with Audience).

## All cities

The fleet dashboard (`/platform-admin/pivot`) has the same Growth panel at
`?page=2`, with the city-safe views only:

| View | URL | Contents |
| --- | --- | --- |
| Overview | `growth` absent (default) | The investor overview across every Pivot city (`GET /admin/pivot/analytics/overview`). Names the cities included; warns if any failed to load. |
| Landing | `growth=landing` | Fleet landing totals and one row per city (former fleet Launch). |
| Acquisition | `growth=acquisition` | All-cities monthly acquisition funnel (former fleet Analytics). |

Waitlist and QR codes stay per city. Fleet `?page=4` (former Analytics)
redirects to `?page=2&growth=acquisition`; index 4 stays reserved and hidden.
Sources: `PivotFleetGrowthPage.jsx`, `PivotFleetLaunchPanel.jsx` (was
`PivotFleetLaunchPage.jsx`). The standalone `PivotTenantAnalyticsPage.jsx` is
removed; its stylesheet is now `PivotAcquisitionFunnel.scss`.

## Old bookmarks and the city switcher

Growth is the second sidebar item in both shells (`navOrder: 0.5`, right after
Overview). That only changes the sidebar order: the city page stays `?page=6`
and the fleet page `?page=2`, so links and bookmarks are unchanged.

- `?page=11` redirects to `?page=6&growth=acquisition`. Index 11 stays
  reserved (`analytics`, hidden from nav, highlights Growth).
- Fleet Growth (2) ↔ city Growth (6), keeping the `growth` view when the other
  shell has it. City-only views (Waitlist, QR codes) land on fleet Overview.
- Legacy Analytics bookmarks (fleet 4, city 11) land on Growth → Acquisition
  in either shell.
- City → city keeps the Growth view.
- Fleet Landing city rows open that city's Growth → Landing.

## Phase 0 parity mapping

| Phase 0 control | Destination |
| --- | --- |
| (new) City growth overview | Overview |
| Launch: landing-mode switch | Landing |
| Launch: traffic, conversion, views chart, source attribution | Landing |
| Launch: QR attribution | QR codes |
| Launch: paged waitlist, CSV export, row removal | Waitlist |
| Launch: copy / open public URL | Landing |
| Launch: QR management | QR codes |
| Launch: refresh | Header (refreshes the open view) |
| Analytics: UTC month picker and refresh, stage counts, funnel, step drop-off, counting notes | Acquisition |

Changed: removing a waitlist row no longer reloads the landing totals (they
are not on that view; they reload when Landing opens). The Waitlist
description now says contacts are visible on this tab and in the CSV only.

## Parity check before release

1. Open `?page=6` with each `growth` value; refresh and use Back/Forward.
2. Open `?page=11`; confirm Acquisition, the month picker, and ← / → / R.
3. Switch landing mode both ways; copy and open the public link.
4. Page through the waitlist, download the CSV, and remove a test row;
   confirm no full email appears in confirms, toasts, or the console.
5. Create, edit, and copy a tracking QR; confirm attribution appears.
6. Switch between the fleet and a city from every Growth view and from fleet
   Launch and Analytics; switch cities from each view.
