# Grokbot carousel connector

Grokbot reaches carousel drafts only through `POST /mcp/carousel`. Meridian keeps the drafts, the jobs, and the audit. The connector queues work and reads it back. It does not publish to Instagram.

## Token

Mint from `backend/` against the database for that environment. The owner must be a platform admin. Each admin has one unrevoked token. It expires one year after minting, is stored only as a hash, and is accepted only on this route.

```bash
node scripts/platformAccessToken.js mint --global-user-id <id> --label grokbot --ack-write
```

The secret is printed once on stdout. The id, prefix, and expiry go to stderr. Put the secret in the connector and do not log it again.

```bash
node scripts/platformAccessToken.js list
node scripts/platformAccessToken.js revoke --id <id> --ack-write
```

`list` shows id, prefix, label, owner, expiry, last use, and whether it is active. Revoke, then mint, to rotate. Every request rechecks the owner's platform role. A revoked, expired, or non-admin token is rejected. Actions are stored as that owner, and the audit names the token label.

## Connector

In grokbot, add a custom connector:

- Transport: Remote HTTPS
- Server URL: `https://<meridian-host>/mcp/carousel`
- Header: `Authorization: Bearer <token>`
- Client ID: empty

The server is stateless. Each call is one JSON POST and returns JSON. Do not send `mcp-session-id`. Other HTTP methods answer 405. A session cookie or an admin JWT is not this token.

## Webhook

On the Meridian process set `GROKBOT_CAROUSEL_WEBHOOK_URL` to grokbot's inbound URL. After a job write, Meridian POSTs one notice. The body is only `event`, `accountKey`, `jobId`, and `issues` (`issueId`, `revision`). It never includes captions, reasons, or URLs. The same event is not sent again if apply or export runs twice. A failed POST is retried briefly and logged. The job still completes. Leave the variable unset and nothing is sent.

`preview-ready` means an agent-written revision's slides are ready. `jobId` is the compose job for the first revision and the revise job after that. `issues` names the revision that just became ready. `wait`, `needs-editor`, `cannot-revise`, `conflict`, and `failure` mean the job ended with no new draft.

## Daily routine

Once a day, call `list_editorial_accounts`, then `start_compose` for each account that has an account id. Pass `accountKey`, an ISO-8601 `publicationTime` for the draft, and an `idempotencyKey` of 8–128 characters (`^[a-zA-Z0-9:_-]{8,128}$`), stable for that account and day, such as `compose:just.go.ic:2026-11-07`. The call returns a `jobId` and queues the job. It does not write a draft. Keep the job id and stop. The webhook routine presents the result. The same key returns the first result and does not queue a second job. A server error is not stored, so retry with the same key. While a call with that key is still running, another returns `IN_PROGRESS`; retry it shortly with the same key. `just.go.ic` and `just.go.sf` are the city accounts. An account with no owner tenant cannot start a compose.

## Webhook routine

On `preview-ready`, call `get_compose_run` with `jobId`. For a compose decision, that returns each option's issue id, revision, theme, rationale, caption, and events (one to three). Call `get_issue` for each option. Download `preview.slideImageUrls` in order and show the slides with that option's issue id and revision. If `get_compose_run` reports the job is not a compose run, the notice is for a revision: call `get_issue` with the issue id in the notice and show that revision the same way. URLs last about an hour (`expiresInSeconds`). Call `get_issue` again for fresh ones.

On `wait` or `needs-editor`, call `get_compose_run` and show the decision and reason. There is no draft to approve. On `cannot-revise`, `conflict`, or `failure`, call `get_issue` when the notice includes an issue. Say that revision did not change. A conflict means a hand edit already won.

## Edits and approvals

Relay a person's change with `request_revision`: the issue id, the revision they were shown, the text (2,000 characters at most), and a new idempotency key. That appends the request, saves it as editorial feedback, and queues a revise job. The draft text stays until the agent writes the next revision, which returns to unapproved. Show the new slides only after the next `preview-ready`. A posted draft cannot be revised. A draft edited by hand in the studio since the agent last wrote it returns `EDITS_SINCE_AGENT`.

`pick_option` archives the other options in the set. Restoring a sibling leaves the pick in place. `approve` approves that exact revision and, for an option, picks it and archives the others. It does not post. After a person has posted that revision by hand, `mark_posted` records it. Pass the revision that was shown. A newer revision returns `REVISION_CONFLICT`; read the issue again and ask with the current revision.

## If a notice is missed

Call `list_awaiting_review`. It returns every unapproved, unarchived generated issue, with issue id and revision, and every compose or revise job still running, with job id and, for a revise job, the issue id and revision it is bound to. Then call `get_compose_run` or `get_issue` as above. A finished `wait`, `needs-editor`, `cannot-revise`, `conflict`, or `failure` is not in that list. Use the job id the daily routine stored and call `get_compose_run`.

## Staging checklist

Use synthetic accounts and drafts on staging. Leave the production webhook unset until every line below has been seen there.

- Transport: a POST to `/mcp/carousel` returns one JSON body, and a GET returns 405 with no session id.
- Headers: the connector sends `Authorization: Bearer <token>`, Client ID is empty, and that token is rejected on an admin route.
- Images: `get_issue` on a ready synthetic revision shows `slideImageUrls` in slide order, and the routine displays those images beside the issue id and revision.
- Approvals: the daily routine and the webhook routine require a person before `start_compose`, `request_revision`, `pick_option`, `approve`, and `mark_posted`. Declining leaves the draft unchanged.
- Timeouts: a timed-out daily run, retried with the same idempotency key, does not create a second job. A missed webhook still shows the draft or the running job in `list_awaiting_review`.
