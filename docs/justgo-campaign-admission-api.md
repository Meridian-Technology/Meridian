# Just Go campaign admission API

This first server slice exchanges an NFC tag invitation for an individual free
admission. It contains no landing page, App Clip changes, guest email verification,
notification delivery, QR rendering, or door-scanning UI.

## Identity and storage

Claims require existing Just Go authentication (`verifyToken`) with a
`globalUserId` that resolves to a real global account. The request body cannot
choose the attendee: names, emails and IDs supplied there are ignored. Anonymous
App Clip/browser claims will need a verified guest identity flow before they can
use this API without signing in. Legacy tenant-only tokens return
`GLOBAL_ACCOUNT_REQUIRED`.

All three collections live in the global/platform database:

- `justgo_campaigns`: city, event, public title/date, claim window, capacity and
  admission counter. Default capacity is 100. One campaign per city/event ensures
  tags share the same capacity pool.
- `justgo_campaign_invites`: SHA-256 digest of a random 256-bit tag token,
  campaign, active flag, admission allowance and counter. Default allowance is 3.
- `justgo_admissions`: campaign, source invitation, global attendee, unique pass
  token and status (`confirmed`, `checked-in`, `cancelled`). One admission per
  account/campaign is enforced by a unique index.

The pass token is a different random 256-bit bearer credential. It is stored for
authenticated recovery but excluded from ordinary model queries. Treat it as a
secret; do not use the invitation token as the door credential. The QR renderer
can encode the returned pass token when a staff validation API is added.

## Provisioning (platform admin)

`POST /admin/pivot/campaigns`

```json
{
  "tenantKey": "sf",
  "eventId": "507f1f77bcf86cd799439011",
  "title": "Just Go underground",
  "capacity": 100,
  "startsAt": "2026-11-08T05:00:00.000Z",
  "claimsOpenAt": "2026-11-01T17:00:00.000Z",
  "claimsCloseAt": "2026-11-08T04:00:00.000Z"
}
```

Use an actual event ID in an active Just Go city and future dates. The claim
window must satisfy `claimsOpenAt < claimsCloseAt <= startsAt`; opening defaults
to now. Dates must be strings. Capacity must be an integer from 1 to 100000.
Returns `201 {success: true, data: {campaign: {...}}}`. Re-provisioning the same
city/event returns `409 CAMPAIGN_EXISTS`.

`POST /admin/pivot/campaigns/:campaignId/invites`

```json
{"admissionLimit": 3}
```

Returns `201 {success: true, data: {invite: {id, campaignId, admissionLimit,
token}}}`. Save the raw token securely at issuance; only its digest is retained
in the invitation collection. Issue one invitation per physical tag. Issuing a
tag does not reserve capacity; only successful claims consume places. Multiple
tags can offer more invitations than capacity, but confirmed admissions cannot
exceed the campaign limit. Closed/expired campaigns cannot issue tags.

The NFC destination page is a separate implementation. The API lookup URL below
returns JSON and is not an App Clip invocation or a guest-facing pass page.

## Public preview

`GET /pivot/campaign-invites/:token`

Returns `200 {success: true, data: {campaign, availability}}`. Campaign fields
include `id`, `tenantKey`, `eventId`, `title`, `startsAt`, `claimsOpenAt`,
`claimsCloseAt`, and `status`. No exact venue address or attendee data is exposed.
The supplied public title should be suitable for anyone holding the tag URL.

Availability is `available`, `not-open`, `closed`, `revoked`, `full`, or
`exhausted`. It is informational; claims recheck the state transactionally.
Unknown/malformed tokens return `404 INVITE_NOT_FOUND`. Previews never consume a
place, including link previews and repeated reads.

## Claim or recover an admission

`POST /pivot/campaign-invites/:token/claim`

Send the existing authentication cookie or bearer access token. No body is
required. New claims return:

```json
{
  "success": true,
  "data": {
    "existing": false,
    "admission": {
      "id": "...",
      "campaignId": "...",
      "status": "confirmed",
      "passToken": "...",
      "checkedInAt": null,
      "createdAt": "..."
    }
  }
}
```

New claims return 201. Repeated claims by the same account for the same campaign
return 200 with `existing: true` and the original pass, including when using a
different tag for that campaign. They consume no additional capacity and keep
the original source attribution. Existing admissions remain recoverable after
closure or tag revocation; cancelled passes stay cancelled.

New claims against unavailable invitations return 409 with `CAMPAIGN_REVOKED`,
`CAMPAIGN_CLOSED`, `CAMPAIGN_NOT_OPEN`, `CAMPAIGN_FULL`, or `CAMPAIGN_EXHAUSTED`.
`CAMPAIGN_UNAVAILABLE` is the conditional-write fallback. Infrastructure failures
return 503 `CAMPAIGN_SERVICE_UNAVAILABLE`; clients may retry the same request.
There is no automatic waitlist enrollment in this slice.

Preview and claim responses use `Cache-Control: no-store` and
`Referrer-Policy: no-referrer`. Each endpoint has its own existing-style 60/minute
per-IP process-local rate limit. Campaign invitation path tokens are redacted in
the backend's Pivot request logger. Configure any upstream access logs to redact
these bearer URLs too.

## Atomicity and deployment

The global database must support MongoDB transactions (replica set or sharded
cluster). There is no standalone-server fallback that can partially reserve
places. A claim increments campaign capacity, increments the source tag's usage,
and inserts the admission in one transaction. Transient write conflicts retry;
any failed insert rolls back both counters. Operations within the transaction
are sequential.

Collections and indexes initialize before provisioning/claiming. If automatic
index creation is disabled in deployment, create the schema indexes before
enabling this feature, especially unique `(tenantKey, eventId)`, `tokenHash`,
`(campaignId, globalUserId)` and `passToken` indexes. No existing data backfill or
new application secret is required.

Campaign closure, tag revocation, cancellation, capacity release, and check-in
management APIs are not part of this slice. The stored state supports rejecting
unavailable invitations, but cancelled admissions continue to occupy capacity;
they are not automatically reissued.

## Verification

From `backend/`, using the repository's Node 20 runtime:

```sh
NODE_ENV=test node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/integration/justGoCampaign.test.js tests/unit/pivotLogger.test.js
```

The integration suite uses a real temporary MongoDB replica set and actual
Mongoose models. It checks public previews, identity boundaries, issuance
authorization, tag and event quotas under concurrency, repeat claims across
tags, uniqueness, rollback, invalid provisioning, and closed/revoked/expired
states. Existing authentication is mocked at the integration boundary; it does
not replace production token verification.
