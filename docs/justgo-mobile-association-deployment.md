# justgo.lol mobile association deployment

The Meridian backend serves these before tenant/database middleware:

- `/.well-known/apple-app-site-association`
- `/.well-known/assetlinks.json`

Both responses are JSON, cacheable, and available without authentication. The Apple
declaration uses team ID `S22WF3L7P9` and includes both `com.meridian.mobile` and
`app.justgo`. Existing invite and pivot routes remain associated; public event links
are scoped to `/events/*`.

## Required Android release configuration

Set both production environment variables before deployment:

- `ANDROID_MERIDIAN_SHA256_CERT_FINGERPRINTS`
- `ANDROID_JUSTGO_SHA256_CERT_FINGERPRINTS`

Each value is a comma-separated list of colon-delimited SHA-256 certificate
fingerprints. Use the **App signing key certificate** SHA-256 value from Google Play
Console for the matching package. Include an additional fingerprint only while a
real signing-certificate rotation requires both. Do not use an upload-key, OAuth
SHA-1, debug certificate, or placeholder.

The Android endpoint intentionally returns `503` with `Cache-Control: no-store` if
either variable is absent or malformed, so a deployment cannot silently advertise
an invalid app association.

## Production-equivalent verification

Run these against the HTTPS deployment and confirm there is no redirect:

```sh
curl --fail --silent --show-error --dump-header - \
  https://justgo.lol/.well-known/apple-app-site-association
curl --fail --silent --show-error --dump-header - \
  https://justgo.lol/.well-known/assetlinks.json
```

Both requests must return `200` and `Content-Type: application/json`. Confirm the
Apple app IDs, Android package names, release fingerprints, and `/events/*` rules in
the bodies. Then validate Android's published statement with the Digital Asset Links
API using `return_relation_extensions=true`.
