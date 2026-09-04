# Temporary rich-location migration UI

The Platform Admin tenant pivot dashboard includes a tenant-specific
**Location migration** page for Just Go (`pivot`) tenants. Both halves of the
feature are off unless explicitly enabled at deployment time:

```sh
# Backend runtime
ENABLE_RICH_LOCATION_MIGRATION_UI=true

# Frontend build time (requires rebuilding the frontend)
REACT_APP_ENABLE_RICH_LOCATION_MIGRATION_UI=true
```

The backend also requires `GOOGLE_MAPS_SERVER_API_KEY`. Keep that credential
server-only and restrict it by Google API and backend egress IP.

## Operator flow

1. Open `/platform-admin/pivot/:tenantKey?page=7`, or select the tenant's
   **Location migration** dashboard item.
2. Save valid city constraints while rollout and all capabilities remain off.
3. Preserve the generated ISO cutoff and dry-run the live scope.
4. Type the tenant key, apply one live batch, and repeat until completed.
5. Resolve items in the review queue.
6. Enable reads, then writes/autocomplete, then search.
7. Confirm live stability and repeat dry-run/apply for historical scope.
8. Disable both feature flags after the migration interface is no longer needed.

Each request processes at most 50 records. Applied batches use the durable
`PivotLocationBackfillRun` checkpoint. UI requests use an expiring database
lease to prevent two web operators from running the same tenant/scope at once.
The command-line migration does not participate in this UI lease, so do not run
the CLI and web interface concurrently.

Applied batches require the operator to type the exact tenant key. Historical
batches retain the service's existing requirements: the live run must be
completed and the operator must explicitly confirm live-catalog stability.

The emergency **Disable rollout** action only changes rich-location controls;
it does not depend on the unsaved constraints editor and does not delete any
migrated data.
