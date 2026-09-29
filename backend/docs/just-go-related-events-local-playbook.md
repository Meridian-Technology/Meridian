# Just Go related events: local Atlas playbook

This slice adds curator-initiated suggestions to Carousel Studio. It uses Atlas Vector Search Automated Embedding on public event text. It does not change Explore or Drop, publish anything, or create a draft on its own.

## 1. Set up a search-capable development tenant

For the first experiment, use a **nonproduction Atlas cluster** with one development city database and safe test events. Run the backend and frontend locally against that cluster. Atlas manages `mongot` and automated embedding, so no local server upgrade or Voyage API key setup is needed. The same index definition and query shape can be used on an Atlas production city database after the application and operational checks below. The Preview warning in the [Automated Embedding overview](https://www.mongodb.com/docs/vector-search/crud-embeddings/automated-embedding/) appears in the **Self-Managed** tab, not the Atlas tab. MongoDB separately describes Atlas Automated Embedding as [Public Preview](https://www.mongodb.com/products/updates/now-in-public-preview-automated-embedding-in-mongodb-vector-search-on-atlas/); account for that status when deciding production support expectations.

If the test needs realistic production data, use the [production-to-staging copy playbook](copy-prod-tenant-to-staging.md), which requires an explicit macOS confirmation dialog before copying data.

A supported local MongoDB Community Search deployment is also possible. A plain standalone `mongod` cannot run `$vectorSearch`; Community needs a compatible `mongod`, a single-node replica set for local testing, and `mongot`. MongoDB documents the `mongodb/mongodb-atlas-local:preview` image, which bundles both processes. Automated embedding on self-managed Community also requires a Voyage AI embedding API key configured for `mongot` and outbound access to the provider. The installed Homebrew `mongod` on this machine is 7.0.14, so it cannot run this slice as-is. See [MongoDB's local development quickstart](https://www.mongodb.com/docs/search/self-managed/current/installation/quick-start/) and [compatibility requirements](https://www.mongodb.com/docs/search/self-managed/current/deployment/compatibility-requirements/).

This repository includes a [local Compose setup](../local-search/README.md) that can replace the current Homebrew service on port 27017 **after migrating the local application databases**. Its named volumes do not overwrite the Homebrew server's data. The ignored `.env` already has a generated local database password; add only the Voyage API key and start Docker Desktop before running the commands there.

Set an explicit `MONGO_URI_<CITY>` for the backfill and point the local backend's tenant connection at the same development database. Do not paste credentials or API keys into logs or source files. Run the backend locally with `PIVOT_CURATION_RELATED_ENABLED=true`.

The backfill in step 2 can run from your laptop against the staging Atlas database; deploying to Heroku is not required for that database update. Set `MONGO_URI_<CITY>` to the **staging tenant database URI**, including the database path (for example `/sf`), then run the script from this checkout. The `prod.yml` and `staging.yml` files used by `mongodump` are not read by the Node backfill. To test the hosted staging API and Carousel UI, deploy this feature to staging; alternatively run the backend and frontend locally against staging Atlas.

Check that the tenant's `events` collection has published upcoming Just Go events. The operator account must allow this tenant in `sourceTenantKeys`.

## 2. Materialize public text

From `Meridian/backend`:

```sh
node scripts/backfillJustGoSemanticText.js --tenant=<city>
node scripts/backfillJustGoSemanticText.js --tenant=<city> --apply --ack-write
node scripts/backfillJustGoSemanticText.js --tenant=<city>
```

The last run should report `changed: 0`. The script touches only published, nondeleted events and does not print the connection string. Ingested events and creator listing edits also refresh this text. Re-run the backfill after any other admin operation that bulk-edits searchable event fields until those paths are wired to the same helper.

## 3. Create the Atlas index

Create a **Vector Search** index on each development city database's `events` collection named `just_go_event_autoembed_v1` with this definition. Use Atlas Search & Vector Search for Atlas, or `db.events.createSearchIndex('just_go_event_autoembed_v1', 'vectorSearch', <definition>)` in `mongosh` for local Community Search:

```json
{
  "fields": [
    { "type": "autoEmbed", "modality": "text", "path": "customFields.pivot.semanticText", "model": "voyage-4" },
    { "type": "filter", "path": "customFields.pivot.ingestStatus" }
  ]
}
```

Wait for the index to be `READY` before testing. MongoDB Search generates and updates vectors from the text field and embeds query text; the app never stores raw vectors. Index each city collection separately because events are tenant-local.

In `mongosh` connected to that development city database, smoke-test the index:

```js
db.events.getSearchIndexes().forEach(printjson)
db.events.aggregate([
  { $vectorSearch: {
    index: 'just_go_event_autoembed_v1',
    path: 'customFields.pivot.semanticText',
    query: { text: 'intimate live jazz' },
    filter: { 'customFields.pivot.ingestStatus': 'published' },
    numCandidates: 100,
    limit: 5
  } },
  { $project: { name: 1, score: { $meta: 'vectorSearchScore' } } }
])
```

## 4. Run tests and exercise the UI

```sh
cd Meridian/backend
npx jest --runInBand tests/unit/pivotCarouselRelated.test.js tests/unit/justGoPhase6PrivacyBoundaries.test.js
```

Start the backend and frontend normally, sign in as a platform admin, open Carousel Studio for an account that includes the development city, and click **Find related** on a published upcoming event. Verify that the proposal contains no seed event, no unpublished/deleted/hidden events, no event from another city, and no duplicate title/date rows. **Add suggested bundle** should put the candidates in the existing editable tray and suggest a name only if the name is blank. Remove or reorder candidates, then close and regenerate the proposal; the draft should remain intact. Disable `PIVOT_CURATION_RELATED_ENABLED` and verify the button disappears while existing catalog search still works.

The feature is intentionally a bounded five-neighbor proposal. Atlas scores are retrieval hints, not curator quality judgments. Review a representative sample for coherent themes, duplicate coverage, and stale descriptions. There is no automatic carousel publication.

## 5. Production readiness

Atlas `autoEmbed` is the intended route for this slice; no application-managed embedding pipeline is required. Before a production release, wire any remaining event edit paths that change title, description, tags, host, or rich location into `setJustGoSemanticText`. In particular, batch release and location updates currently bypass the helper. Compare backfill dry-run output with the published catalog. Create the index per production city and wait for readiness before enabling the endpoint. On dedicated Atlas clusters (`M10+`), enable storage auto-scaling as required by [MongoDB's Atlas documentation](https://www.mongodb.com/docs/vector-search/crud-embeddings/automated-embedding/). Monitor index state, query failures, latency, curator acceptance, and embedding usage. To roll back, turn the flag off; existing catalog curation remains available. Remove the index only after traffic has stopped.

Atlas reference: https://www.mongodb.com/docs/vector-search/tutorials/quick-start/?deployment-type=atlas&embedding=auto&interface=driver&language=nodejs
