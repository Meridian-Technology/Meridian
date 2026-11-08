# Grokbot carousel connector

Grokbot reaches carousel drafts only through `POST /mcp/carousel`. Meridian keeps the drafts, the jobs, and the audit. The connector queues work and reads it back. It does not publish to Instagram.

## Token

Create the token in Platform Admin → Integrations → Grokbot connector. Changes on that page need a platform admin session that passed admin MFA. An admin with no MFA set up is refused. Enter a label and choose Create token. A dialog shows the secret once. Copy it into the connector. It cannot be shown again.

A token is always minted for the admin who creates it. Each admin has one unrevoked token. It expires one year after minting, is stored only as a hash, and is accepted only on this route. The token table shows label, owner, prefix, expiry, last use, and status. To rotate, revoke the token, then create another. The owner or a root admin can revoke. The token row records who minted it, who revoked it, and when. Every request rechecks the owner's platform role. A revoked, expired, or non-admin token is rejected. Actions are stored as that owner, and the audit names the token label.

## Connector

In grokbot, add a custom connector:

- Transport: Remote HTTPS
- Server URL: copy it from the Grokbot connector card (`https://<meridian-host>/mcp/carousel`)
- Header: `Authorization: Bearer <token>`
- Client ID: empty

The server is stateless. Each call is one JSON POST and returns JSON. Do not send `mcp-session-id`. Other HTTP methods answer 405. A session cookie or an admin JWT is not this token.

## Webhook

Grokbot's webhook routines accept only a POST that carries `Authorization: Bearer <routine key>`. In grokbot, open the routine that presents results and copy the URL and the key from its Webhook section. In Platform Admin → Integrations → Grokbot webhook, paste both, turn on Send notices, and Save. The key is stored encrypted and is never shown again; the card shows only its last four characters. Leave the key field blank to keep the current key. The URL must be `https://` on a public host name. IP addresses, localhost, and names that resolve to private addresses are refused. Send test posts `{ "event": "test" }` with the key, even while notices are off, and shows the HTTP status grokbot returned.

After a job write, Meridian POSTs one notice with that bearer key. The body is only `event`, `accountKey`, `jobId`, and `issues` (`issueId`, `revision`). It never includes captions, reasons, or URLs. The same event is not sent again if apply or export runs twice. The POST runs in the background, so the job never waits on it. A failed POST is retried with backoff for about 30 seconds. If every attempt fails, the event is released and the next trigger for that job sends it; until then, use the missed-notice routine below. With Send notices off, nothing is sent. A saved change reaches every Meridian process within 30 seconds.

Recent deliveries on the card lists the last 20 attempts, including retries and tests: time, event, job id, and the HTTP status or error. It never stores the body. A 401 there means the key does not match the routine.

`preview-ready` means an agent-written revision's slides are ready. `jobId` is the compose job for the first revision and the revise job after that. `issues` names the revision that just became ready. `wait`, `needs-editor`, `cannot-revise`, `conflict`, and `failure` mean the job ended with no new draft. `failure` covers both a worker failure and a result Meridian refused to apply. `test` comes only from Send test and carries nothing else; the routine can ignore it.

### Backup: CLI and env vars

If the page is unavailable, mint, list, and revoke from `backend/` against that environment's database. `mint` prints the secret once on stdout.

```bash
node scripts/platformAccessToken.js mint --global-user-id <id> --label grokbot --ack-write
node scripts/platformAccessToken.js list
node scripts/platformAccessToken.js revoke --id <id> --ack-write
```

`GROKBOT_CAROUSEL_WEBHOOK_URL` applies only until the webhook settings are first saved on the page, and it sends no bearer key, so grokbot routines reject it. `GROKBOT_CAROUSEL_WEBHOOK_SECRET`, if set, still adds `X-Meridian-Signature: sha256=<hex>`; grokbot does not use it. `INTEGRATION_ENCRYPTION_KEY` encrypts the stored routine key and falls back to `JWT_SECRET`. If it changes, save the key again.

## Daily routine

Once a day, call `list_editorial_accounts`, then `start_compose` for each account that has an account id. Pass `accountKey`, an ISO-8601 `publicationTime` for the draft, and an `idempotencyKey` of 8–128 characters (`^[a-zA-Z0-9:_-]{8,128}$`), stable for that account and day, such as `compose:just.go.ic:2026-11-07`. The call returns a `jobId` and queues the job. It does not write a draft. Keep the job id and stop. The webhook routine presents the result. The same key returns the first result and does not queue a second job. A server error is not stored, so retry with the same key. While a call with that key is still running, another returns `IN_PROGRESS`; retry it shortly with the same key. `just.go.ic` and `just.go.sf` are the city accounts. An account with no owner tenant cannot start a compose.

## Webhook routine

On `preview-ready`, call `get_compose_run` with `jobId`. For a compose decision, that returns each option's issue id, revision, theme, rationale, caption, and events (one to three). Call `get_issue` for each option. Download `preview.slideImageUrls` in order and show the slides with that option's issue id and revision. If `get_compose_run` reports the job is not a compose run, the notice is for a revision: call `get_issue` with the issue id in the notice and show that revision the same way. URLs last about an hour (`expiresInSeconds`). Call `get_issue` again for fresh ones.

On `wait` or `needs-editor`, call `get_compose_run` and show the decision and reason. There is no draft to approve. On `cannot-revise`, `conflict`, or `failure`, call `get_issue` when the notice includes an issue. Say that revision did not change. A conflict means a hand edit, or an approval given after the request, already won.

## Edits and approvals

Relay a person's change with `request_revision`: the issue id, the revision they were shown, the text (2,000 characters at most), and a new idempotency key. That appends the request, saves it as editorial feedback, and queues a revise job. The draft text stays until the agent writes the next revision, which returns to unapproved. Show the new slides only after the next `preview-ready`. A posted draft cannot be revised. A draft generated before Meridian stored the agent's composition returns `REVISE_COMPOSITION_MISSING`; nothing is recorded, and only a new compose can replace it. A draft edited by hand in the studio since the agent last wrote it returns `EDITS_SINCE_AGENT`.

`pick_option` archives the other options in the set, except one already posted. A refused pick archives nothing. Restoring a sibling leaves the pick in place, and the restored option can still be revised. `approve` approves that exact revision and, for an option, then picks it and archives the others the same way. It does not post. After a person has posted that revision by hand, `mark_posted` records it. Pass the revision that was shown. A newer revision returns `REVISION_CONFLICT`; read the issue again and ask with the current revision.

## If a notice is missed

Call `list_awaiting_review`. It returns every unapproved, unarchived generated issue, with issue id and revision, and every compose or revise job still running, with job id and, for a revise job, the issue id and revision it is bound to. Then call `get_compose_run` or `get_issue` as above. A finished `wait`, `needs-editor`, `cannot-revise`, `conflict`, or `failure` is not in that list. Use the job id the daily routine stored and call `get_compose_run`.

## Staging checklist

Use synthetic accounts and drafts on staging. Keep Send notices off in production until every line below has been seen there.

- Transport: a POST to `/mcp/carousel` returns one JSON body, and a GET returns 405 with no session id.
- Headers: the connector sends `Authorization: Bearer <token>`, Client ID is empty, and that token is rejected on an admin route.
- Webhook: Send test returns a 2xx from the routine, and a real notice shows in Recent deliveries with a 2xx.
- Images: `get_issue` on a ready synthetic revision shows `slideImageUrls` in slide order, and the routine displays those images beside the issue id and revision.
- Approvals: the daily routine and the webhook routine require a person before `start_compose`, `request_revision`, `pick_option`, `approve`, and `mark_posted`. Declining leaves the draft unchanged.
- Timeouts: a timed-out daily run, retried with the same idempotency key, does not create a second job. A missed webhook still shows the draft or the running job in `list_awaiting_review`.
