# Temporary rich-location migration UI

The Platform Admin tenant pivot dashboard includes a tenant-specific
**Location migration** page for Just Go (`pivot`) tenants. Both halves of the
feature are off unless explicitly enabled at deployment time:

```sh
# Backend runtime
ENABLE_RICH_LOCATION_MIGRATION_UI=true

# Frontend build time (requires rebuilding the frontend)
REACT_APP_ENABLE_RICH_LOCATION_MIGRATION_UI=true

# Optional map previews in the review inspector (frontend build time)
REACT_APP_GOOGLE_MAPS_EMBED_API_KEY=browser-restricted-key
```

The backend also requires `GOOGLE_MAPS_SERVER_API_KEY`. Keep that credential
server-only and restrict it by Google API and backend egress IP.

The optional frontend key is a separate credential for the Maps Embed API.
Restrict it to the deployed frontend origins with HTTP referrer restrictions;
never put the server key in a `REACT_APP_*` variable. Without the embed key,
the reviewer still provides a link to the exact Google Maps listing.

## New discovery and refresh events

Discovery and curation refresh runs resolve rich locations while staging new
events whenever the tenant has valid `richLocationConstraints`. Intentional
online, TBD, and approximate text is classified without a provider call;
physical text is resolved with the server-side Google credential and paced at
the same default interval as the migration. Unique, confident, in-bound matches
are saved immediately. Ambiguous, low-confidence, out-of-bound, and provider
failure results are staged with comparison candidates in **Decisions needed**.

Existing resolved locations are preserved during refresh and do not trigger a
new Google call. Tenants without valid city constraints retain legacy ingest
behavior until they are configured.

Successful request, provider, and per-event ingest logs are disabled by
default. Set `PIVOT_REQUEST_LOG=true` for successful request summaries or
`PIVOT_DETAIL_LOG=true` for provider/per-event success detail during a bounded
debugging session; warnings, errors, and aggregate run summaries remain on.

## Operator flow

1. Open `/platform-admin/pivot/:tenantKey?page=7`, or select the tenant's
   **Location migration** dashboard item.
2. Choose an event batch with the week picker. The choice is bookmarkable as
   `?page=7&batchWeek=YYYY-Www`.
3. Save valid city constraints while rich-location rollout remains off.
4. Preview the next event group. Previewing calls the same matching path but
   does not write events or advance the week's checkpoint.
5. Type the tenant key, process one group, and repeat until the coverage bar
   has no events left to evaluate.
6. Resolve **Decisions needed** by comparing the original event information
   with the proposed Google listing and map. Weak or unmatched locations may
   require a manual rich-location correction.
7. Enable the required rich-location capabilities when the tenant is ready.
8. Disable both feature flags after the migration interface is no longer needed.

Each request processes at most 50 records. Applied batches use a durable
`PivotLocationBackfillWeekRun` checkpoint per tenant and batch week. The
coverage bar counts an event as evaluated when it has either received a rich
location or been routed to human review; it reports ready, review, and
remaining counts separately. UI requests use an expiring database lease to
prevent two web operators from running the same tenant concurrently.
The command-line migration does not participate in this UI lease, so do not run
the CLI and web interface concurrently.

Applied batches require the operator to type the exact tenant key. The older
live/historical checkpoint remains available to the command-line migration;
the tenant UI uses the selected batch week instead.

The emergency **Disable rollout** action only changes rich-location controls;
it does not depend on the unsaved constraints editor and does not delete any
migrated data.
