# Just Go dog tags API

Physical NFC dog tags. A tag is a durable record that belongs to one Just Go
city (`tenantKey`) but not to any campaign, so the same tag can open that
city's future events. Each tag has a public `number`, sequential within its
city (printed as `№018`; SF and Iowa City each start at №001), and a random
128-bit `code` written on the tag as
`https://justgo.lol/pivot/tag/{code}`. Only a SHA-256 digest of the code is
stored, so codes can't be listed or guessed from numbers; the raw code is
returned only when it's issued or rotated for writing.

Collection: `justgo_tags` in the global database (`(tenantKey, number)` unique,
`tokenHash` unique). Override the link base with `JUSTGO_TAG_URL_BASE`. The link
has no city in it: the code alone finds the tag.

A local database used before tags had cities still has the old unique `number`
index and city-less rows. Drop the `justgo_tags` collection there.

## Admin (platform admin)

All under `/admin/pivot/tenants/:tenantKey/tags` (an active Just Go city, else
`404 TENANT_NOT_FOUND`), `Cache-Control: no-store`. Changes by tag id only touch
that city's tags.

| Route | Does |
| --- | --- |
| `GET /` | `{tenantKey, cityDisplayName, tags}`: the city's newest 500, `id, tenantKey, number, status, note, writtenAt, createdAt`. Never codes. |
| `POST /` `{note?}` | The city's next number, new code. `201 {tag, code, url}`. Concurrent creates retry on the unique number. |
| `POST /erase` `{code}` | A phone wiped the tag holding `code`: the code dies and the tag reads as not written. Finds the tag in any city (it's already wiped); the response carries its `tenantKey`. |
| `POST /erase` `{code}` | An admin phone wiped the tag carrying `code`: that code stops resolving and `writtenAt` clears; the number stays. `{tag}`, or `TAG_NOT_FOUND`. |
| `POST /:tagId/code` | New code for rewriting; the old code stops resolving; clears `writtenAt`. `{tag, code, url}`. |
| `POST /:tagId/written` | Records that an admin phone wrote and verified the tag. |
| `POST /:tagId/status` `{status: active\|revoked}` | Retire or restore a tag. |

Errors: `TAG_NOT_FOUND` (404), `INVALID_TAG_INPUT` (400), `TAG_NUMBER_CONFLICT`
(409), `TAG_SERVICE_UNAVAILABLE` (503).

## Public lookup

`POST /pivot/tags/lookup` `{code}` → `200 {tag: {number, status, tenantKey,
cityDisplayName}}` or
`404 TAG_NOT_FOUND`. No account (the App Clip calls it). The code travels in
the body so it never lands in request-path logs. Rate limited per IP like the
landing routes. Returns nothing about who holds a tag.

Platform admins see each city's tags on the web too: pivot tenant dashboard →
Growth → Dog tags (counts, list, retire/restore). Writing needs a phone, so it
stays in the app: Ops → tags.

Not here yet: binding a tag to its holder, membership, or admissions. The app's
"tagged" state is still a keychain prototype.

## Verification

From `backend/` on Node 20:

```sh
NODE_ENV=test node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/integration/justGoTag.test.js
```
