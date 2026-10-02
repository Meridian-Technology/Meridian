# Pivot tenant dashboard: Content outcome

Curation (`?page=1`), Catalog (`?page=4`), and Location migration (`?page=7`)
are one **Content** panel at `?page=1`, chosen with the `content` URL param.

| View | URL | Contents | Source |
| --- | --- | --- | --- |
| Events | `content` absent (default) | Week banner and picker, host-live alert, monitor, drop status, readiness, manual add (URL / JSON / form), tag radar, review queue and inspector. Header: Purge, Refresh, Export JSON, Force into review week, Publish week. | `PivotTenantCurationPage.jsx` (`view="events"`) |
| Sources | `content=sources` | Week banner and picker, source discovery and intelligence, saved crawl jobs (create, edit, run, refresh all). Header: Refresh, Force into review week. | `PivotTenantCurationPage.jsx` (`view="sources"`) |
| Organizers | `content=organizers` | Organizer list, unlinked and ambiguous views, merges, backfill, organizer detail and showtime rollups. | `PivotTenantCatalogPage.jsx` |
| Locations | `content=locations` | Rich-location migration. Only shown while `REACT_APP_ENABLE_RICH_LOCATION_MIGRATION_UI=true`. | `PivotTenantLocationMigrationPage.jsx` |

`PivotTenantContentPage.jsx` picks the view and passes the shared tab bar
(`PivotTenantViewTabs`) into each page as `nav`, with the title "Content".

How the tabs behave:

- **Events ↔ Sources:** one mounted component, so the week, loaded events, and
  jobs carry over without refetching.
- **Crossing to or from Organizers:** clears the other family's params (`filter`,
  `source`, `eventId`, `organizerId`, `q`, `claimStatus`, `sort`). Curation and
  Catalog both use `filter` and `source`, with different meanings.
- **Sources in a past week:** saved jobs and sources only apply to weeks being
  curated or live, so Sources explains that and asks for a current week instead
  of showing a blank tab (same rule as before).

## Old bookmarks and links

- `?page=1…` keeps working and opens Events, keeping `batchWeek`, `filter`,
  `source`, and `eventId` (including Catalog's and Audience's links to an event).
- `?page=4…` redirects to `?page=1&content=organizers`, keeping `organizerId`
  and the list filters.
- `?page=7…` redirects to `?page=1&content=locations`, or to Events while the
  flag is off.
- Indexes 4 and 7 stay reserved and hidden; they highlight Content in the nav.
- "Open location review" on a queue event now links straight to
  `?page=1&content=locations&batchWeek=…`.
- `PIVOT_TENANT_PAGES.curation` is now `content`.

## Phase 0 parity mapping

| Phase 0 control | Destination |
| --- | --- |
| Curation: batch week, anchors, refresh, force-review-week | Events and Sources (header / banner) |
| Curation: export JSON, Explore preview, publish week, purge | Events |
| Curation: live alert, monitor, drop status, readiness | Events |
| Curation: source discovery, configuration, health, evidence, tiers, history, scrape learning | Sources |
| Curation: saved-job create / edit / delete / run / refresh with catalog-source linkage | Sources |
| Curation: URL / manual / JSON import and preview | Events |
| Curation: tag radar, queue, inspector, edit / delete, bulk actions, editorial weighting | Events |
| Catalog: every organizer control | Organizers |
| Location migration: every control | Locations (flagged) |

Not yet done from the Content design: monitor metrics as queue filter chips,
an "Add events" drawer, a week-actions menu, and an inspector layout for
Organizers and Sources.

## Parity check before release

1. Open `?page=1`, `?page=4`, `?page=7` (flag on and off) with their params;
   refresh and use Back/Forward.
2. On Events: publish, stage, bulk actions, manual add, purge, export.
3. On Sources: discovery, save / edit / run a saved job, refresh all; switch to
   Events and back and confirm the week and queue don't reload.
4. On Organizers: filters, merge, backfill, open an organizer, rollups; switch to
   Events and confirm the queue's filters aren't polluted.
5. Switch cities from each tab.
