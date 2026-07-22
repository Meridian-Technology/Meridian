# Pivot contacts match — privacy notes

Task 5.1 (`just-go-crew-social-plan.mdx`) implements privacy-preserving contact discovery for Just Go.

## What we collect

- **Address book:** Read on-device only when the user taps an optional contacts CTA and grants permission.
- **In transit:** Only **SHA-256 hex digests** of normalized emails and phone numbers are sent to `POST /pivot/contacts/match`. Raw contact names, numbers, and emails are never uploaded or logged.
- **At rest:** The global `pivot_contact_hashes` collection stores **one-way hashes** of each user's own registered email (and future verified phone). Uploaded address-book entries are **not** stored.

## Normalization (shared client + server)

| Type | Rule |
| --- | --- |
| Email | trim + lowercase |
| Phone | digits only; 10-digit US numbers prefixed with country code `1` |

Hash: `SHA-256(normalizedValue)` as lowercase hex.

## What we never do

- Store raw contacts or address-book snapshots
- Auto-message or SMS/email contacts
- Expose which hash matched which contact row to other users
- Block onboarding when contacts permission is denied

## Match flow

1. User opts in → device reads contacts → normalizes + hashes locally.
2. Hash list POSTed to `/pivot/contacts/match` (optional server-side re-hash path accepts normalized values in memory only for legacy clients).
3. Server compares against registered user hashes, maps to tenant profiles, returns friend/crew invite suggestions with existing friendship status.
4. User explicitly sends a friend request or crew invite — no automated outreach.

## Ops / review checklist

- [ ] Confirm production logs redact request bodies for `/pivot/contacts/match`
- [ ] Confirm App Store / Play contacts usage strings mention find-friends-only purpose
- [ ] Retention: contact hashes tied to account deletion policy for `GlobalUser`
