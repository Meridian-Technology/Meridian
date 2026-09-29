# Local MongoDB Search for Just Go

This Compose project runs MongoDB Community Search and `mongot` on **127.0.0.1:27017** as the primary local development database. Your current Homebrew MongoDB 7.0 server already owns that port. The aim is to move **all application databases** into the search-capable deployment so the backend, other local tools, and event search use the same data. The Compose container has separate named volumes; it does not mount or overwrite the Homebrew data directory. The image is for development only.

1. Start Docker Desktop. Add a Voyage model API key to the ignored `.env` in this directory. For a key created in Atlas, keep the default provider endpoint. For a key created directly in Voyage, set `VOYAGE_EMBEDDING_PROVIDER_ENDPOINT=https://api.voyageai.com/v1/embeddings`. Do not commit or paste the key in chat.
2. Make a verified backup of the current local application databases with `mongodump` while the Homebrew server is running. Exclude the internal `admin`, `config`, and `local` databases from cross-version restore. Then stop Homebrew and start Compose:

   ```sh
   brew services stop mongodb-community@7.0
   docker compose --env-file .env -f compose.yaml config -q
   docker compose --env-file .env -f compose.yaml up -d
   docker compose --env-file .env -f compose.yaml ps
   ```

3. Restore the backed-up **application databases** into the Compose deployment. Check collection counts for the city, platform, and other app databases before repointing the backend. Do not restore the old server's `admin`, `config`, or `local` databases. Keep the original Homebrew data directory as the rollback copy.
4. Point local backend URIs at `mongodb://<user>:<password>@127.0.0.1:27017/<database>?authSource=admin&directConnection=true` using the local credentials in `.env`. Existing no-auth localhost URIs need credentials because this Compose deployment enables authentication. Do not repoint a production tenant.
5. Continue with the [related-events playbook](../docs/just-go-related-events-local-playbook.md): backfill public text, create the `autoEmbed` index, enable `PIVOT_CURATION_RELATED_ENABLED=true`, and test in Carousel Studio. Generated embeddings are stored in MongoDB's internal search database on this same local deployment, while event documents stay in their city databases.

To stop this separate search instance without deleting its named data volumes:

```sh
docker compose --env-file .env -f compose.yaml down
brew services start mongodb-community@7.0
```

MongoDB's [local quickstart](https://www.mongodb.com/docs/search/self-managed/current/installation/quick-start/) documents the `preview` image and Voyage key requirement. Pin an image version for reproducible longer-lived use.
