# Copy a production tenant and global data to staging

Use [`copy-tenant-prod-to-staging`](../../bin/copy-tenant-prod-to-staging) on a Mac with MongoDB Database Tools installed. It opens a macOS confirmation dialog before running any database command. The dialog shows the production and staging cluster hosts, the database names, what staging will replace, and the backup directory. Click **Copy** and type `COPY PROD TO STAGING` to proceed; Cancel or a mismatched phrase exits without running a dump or restore.

Create two private MongoDB Database Tools config files outside the repository. Obtain each connection string from its Atlas cluster's **Connect** screen. The URI must not include a database path:

```yaml
uri: "mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority"
```

Save the production URI in `~/.config/meridian-mongo/prod.yml` and the staging URI in `~/.config/meridian-mongo/staging.yml`. Create the directory before opening either file in Vim:

```sh
mkdir -p "$HOME/.config/meridian-mongo"
chmod 700 "$HOME/.config/meridian-mongo"
vim "$HOME/.config/meridian-mongo/prod.yml"
vim "$HOME/.config/meridian-mongo/staging.yml"
chmod 600 "$HOME/.config/meridian-mongo/prod.yml" "$HOME/.config/meridian-mongo/staging.yml"
```

The script reads these files via `--prod-config` and `--staging-config`; it does not read Meridian's `MONGO_URI_*` environment variables. Use separate Atlas clusters. The script rejects matching URI host lists.

Stop staging app writers and workers, then run from `Meridian` (replace `sf` with the **actual tenant database name**, which may differ from the tenant key):

```sh
./bin/copy-tenant-prod-to-staging \
  --tenant-db sf \
  --global-db meridian_platform \
  --prod-config "$HOME/.config/meridian-mongo/prod.yml" \
  --staging-config "$HOME/.config/meridian-mongo/staging.yml"
```

After confirmation, the script saves archives of both staging databases and both production databases under `~/meridian-mongo-backups/`, checks the production archives with `mongorestore --dryRun`, then restores into staging with `--drop`. It preserves the staging `meridian_platform.tenant_config` collection so its `mongoUri` values are not replaced with production routing. Collections present only in staging remain. The copy is not atomic across the two databases; pause production writes if a consistent point-in-time snapshot is required.

Before starting staging services again, check its tenant routing and disable any outbound staging jobs or notifications that should not operate on copied production data. Recreate the Atlas Vector Search index on the staging tenant's `events` collection; MongoDB dump/restore does not carry Search index definitions. Then run the related-events backfill and smoke test in the [related-events playbook](just-go-related-events-local-playbook.md).
