# Just Go NFC invitations: implementation plan

The build order for
[`justgo-nfc-invitations-brief.md`](./justgo-nfc-invitations-brief.md). It
assumes the **Rec** answers to D1–D10. Steps that depend on a different answer
say so.

Repos:

- server and admin web: `Meridian`. The foundation is `aac1a3f4` on
  `justgo-app-clip`, already contained in `justgo-onboarding-journey`.
- Clip and app: `Meridian-Mobile`. `justgo-app-clip` is contained in
  `justgo-deck-first-onboarding`.

Pick the base branch for each repo before Phase 1.

## Phase 0: before code

- Sign off D1–D10.
- Order tags. For D2 that's NTAG 424 DNA with SUN, keys provisioned by us or
  by the vendor, and permanent write-lock after writing. Order spares.
- App Store Connect: add an advanced App Clip experience for
  `https://justgo.lol/tag/` with the event's art. The Clip needs no new
  capabilities.
- Set the venue reveal time, age policy and door staff list.

## Phase 1: server

The foundation hasn't been deployed and holds no data, so the collections can
change shape without a migration.

1. **Durable tags and enrollments.**
   - Split `justgo_campaign_invites` into two collections:
     - `justgo_tags`: `tokenHash`, printed `label`, `status`
       (active/revoked/lost), `holderAdmissionId`, `holderBoundAt`, optional
       SUN key reference and `lastCounter`. The holder is an admission, not an
       account, because a holder may claim from the Clip before they have one.
     - `justgo_campaign_enrollments`: `campaignId`, `tagId`,
       `admissionLimit`, `admissionCount`, `active`, unique per
       `(campaignId, tagId)`.
   - The tag URL is `https://justgo.lol/tag/{token}`.
   - A tap resolves to the active enrollment that starts soonest.
2. **Tokens out of URL paths.** Heroku's router logs request paths, and the
   app's logger can't redact those. Preview and claim take the token in the
   body. Raw tag tokens never appear in an API path.
3. **Holder binding and admission roles.**
   - The first claim on a tag with no holder binds the holder in the same
     transaction.
   - Each admission gets a `role` (holder/friend/comp) and a `displayName`.
   - Preview returns tag context: the holder's first name (from their
     admission's `displayName`), or the team for comp tags, and seats left on
     the tag.
4. **Private venue.**
   - Add to the campaign: `publicDetails` (neighborhood, blurb, age policy),
     private `venue`, `venueRevealAt`.
   - Drop `eventId` from the public preview.
   - Audit what the public event routes expose for the linked catalog event.
5. **SUN verification.** Only if D2 is accepted.
   - Verify the CMAC with the tag's key, and enforce that the tap counter only
     moves forward.
   - A verified preview returns a short-lived tap proof, and the claim
     requires it.
   - Keys are encrypted at rest and never returned.
6. **Attendee endpoints.**
   - Add `GET` my admissions and `GET` one admission. They accept either an
     account token or a device key. The venue is gated by `venueRevealAt`.
   - Add self-cancel, which releases both counters in one transaction.
   - Claiming after a self-cancel reactivates the same row with a new pass
     token. Revoked admissions stay revoked.
   - Add a `revoked` status.
7. **Guest claims from the Clip.**
   - The claim accepts either an account token or a device key: a random
     256-bit key generated on the phone, sent with the tap proof and
     `displayName`. The server stores only `guestKeyHash`.
   - An admission has exactly one owner: `globalUserId` or `guestKeyHash`.
     Replace the unique `(campaignId, globalUserId)` index with partial unique
     indexes on each.
   - The same device key claiming again returns the same pass, with no new
     seat.
   - Device-key requests get their own rate limit.
8. **Attach at sign-in.**
   - Add an attach endpoint. It's authenticated as the account and presents the
     device key.
   - Attaching moves every admission owned by that key onto the account and
     clears `guestKeyHash`, so the key stops working.
   - If the account already has an admission for the campaign, the account's
     admission is kept and the device one is cancelled, freeing its seat, in
     the same transaction.
   - Log every attach. Attaching again with a key that's already been used is
     a no-op.
9. **Campaign staff roles.**
   - Add `justgo_campaign_staff`: `(campaignId, globalUserId, role)`, where
     role is organizer or door.
   - Add middleware: platform admins count as organizers. Door staff can only
     scan, look up and undo.
10. **Organizer lifecycle.**
    - Close or reopen a campaign.
    - Edit capacity (never below confirmed admissions) and the claim window.
    - Enroll tags in bulk.
    - Edit allowances.
    - Revoke or reactivate a tag.
    - Revoke an admission.
    - Return an overcommit warning when enrolled seats exceed capacity.
11. **Check-in.**
    - Scanning a pass token is an atomic confirmed → checked-in update. Results:
      ok, already checked in (time and by whom), cancelled, revoked, other
      event, unknown.
    - Add undo and search by name or email.
    - Add a roster export: SHA-256 of each pass token, name and status. Raw
      tokens are never sent to staff devices.
    - Add a batch sync for offline scans. The earliest scan wins, and every
      conflict is logged.
    - Keep a check-in audit log of every attempt.
12. **Day-of messages.** Push the venue reveal and the "can't make it?" nudge
    to full-app users. Clip-only guests have no channel; they see the address
    when they open the Clip after the reveal time.
13. **Deploy readiness.**
    - Confirm the production global DB supports transactions.
    - Create indexes.
    - Add upstream log redaction.
    - Add `/tag/*` to the `app.justgo` applinks in AASA only.
    - Add a minimal `/tag/*` web page for non-iOS browsers: Play link with
      install referrer, no claiming.
    - Deploy before any app build that depends on these changes.

Every step comes with tests in the existing real-replica-set integration suite.

## Phase 2: shared mobile module

14. **`src/admission/`, safe to import from the Clip.** This means no auth
    context, navigation or notifications. It holds:
    - the API client and types
    - a keychain pass cache, so the pass renders offline
    - claim and recovery state
    - a QR renderer built on a JS matrix and a `View` grid. The Clip doesn't
      link `react-native-svg`.
15. **Screens.**
    - Main screens: invitation, name confirmation, pass, holder's friend
      seats.
    - Every state: not open, closed, full, tag exhausted, tag revoked, between
      events, cancelled, revoked, offline, retryable error.

## Phase 3: App Clip

16. **Invocation.** Parse `/tag/{token}` and the SUN parameters in
    `clipInvocation.ts`. Route tag launches to the admission flow. `/clip/`
    and `/qr/` keep the drop.
17. **Device key and guest claim.**
    - Generate the device key once and keep it in the keychain with
      `expo-secure-store`, which the Clip already links. No new native modules.
    - Ask for the name the door will see, then claim.
    - Tapping again, or reopening the Clip, lands straight on the pass.
18. **Handoff v2.** Extend `clipHandoff.ts` with the device key and admission
    reference. Keep v1 swipes working. The install CTA on the pass leads with
    "keep your pass safe and get the address drop".
19. **Size check.** Check the App Thinning Size Report against the 15 MB limit
    after adding the admission UI.

## Phase 4: full app

20. **Linking.** Add a `tag/:token` route in `pivotInviteLinking.ts`. If the
    user isn't signed in, stash the token, the same way event links already
    work, so it isn't lost on the trip through auth.
21. **Same journey in the app.** Use the `src/admission/` screens. Claiming
    in the app needs sign-in; a signed-in user claims in one tap. A tag
    arrival shows the pass first; the onboarding journey comes after it.
22. **Attach the Clip pass.**
    - After any sign-in, and on launch when already signed in, read the device
      key from handoff v2 and call attach (step 8). Then clear the key from the
      keychain.
    - Before sign-in, show the Clip pass read-only from the cached handoff, so
      a fresh install opens on the pass with "sign in to keep it".
    - If attach finds the account already had a pass, say which one was kept.
23. **Passes in the app.**
    - Entry point from Week/Profile, and a pass CTA on the event detail
      screen.
    - Give my spot back.
    - Holder view of friends who joined through their tag.
    - Venue reveal state.

## Phase 5: organizer and door tools (admin web)

24. **Campaigns page.** Create, edit, close and reopen. Public details,
    venue and reveal time. Live counts.
25. **Tags page.**
    - Issue tags and get a CSV of URLs, labels and SUN provisioning data for
      writing.
    - Enroll tags and set allowances.
    - Show the holder and claims per tag.
    - Revoke a tag.
    - Show the overcommit warning.
26. **Roster.** Search, revoke, see sources (holder → friends) and check-in
    state.
27. **Staff.** Add or remove organizer and door roles.
28. **Door mode.**
    - Phone-browser camera scanner and name lookup.
    - The roster loads before doors open. Scans queue offline and sync later.
    - Large result screens for duplicate, cancelled and revoked passes.

## Phase 6: Android (scope depends on D6)

29. Handle the `/tag/*` App Link and Play install referrer in the Android app.
    Replace the placeholder fingerprints in `assetlinks.json`.

## Phase 7: test and release

30. **Device matrix.**
    - Physical tags on an iPhone with Just Go installed and without it.
    - Clip already cached; a new Clip version.
    - App Clips disabled; Low Power Mode.
    - The same tag tapped repeatedly.
    - Expired SUN URLs.
    - Locked tags.
    - Android tap.
31. **Identity matrix.**
    - Clip claim, then install and sign in with each method (Apple, Google,
      email): the pass attaches.
    - Install and sign in to an account that already has a pass for the event.
    - Full app already installed and signed in when the Clip claimed.
    - Sign out of the app and back in; sign in on a new device.
    - Clip claim, then the phone is lost before install: door name lookup.
    - How long the Clip's keychain items survive Clip inactivity and data
      purge.
32. **Load and races.** Concurrent claims on one tag and across tags at
    capacity. Cancel, then claim again. Attach racing a claim, and two
    attaches with the same key. Scanning the
    same pass on two door devices, online and offline.
33. **Venue rehearsal.**
    - Test signal at the actual venue.
    - Rehearse the door with the offline roster and a lost connection.
    - Scan duplicate screenshots.
    - Look up someone who has no phone.
34. **Release order.**
    1. Server and AASA.
    2. App and Clip build. The Clip ships inside the app build.
    3. Point the App Clip experience at it and swap in the event art.
    4. Dry run with about 10 people and real tags.
    5. Write and lock the tags.
    6. Hand them out.

## Risks to watch

- **The Clip's 15 MB limit** after adding the admission UI.
- **Passes lost before install.** A Clip-only pass lives on one phone. Door
  name lookup is the fallback; the install pitch is the real fix.
- **Unverified door names.** Anyone can type any name in the Clip. That's
  acceptable for a free event, but the door lookup shows the source tag and
  holder so staff have something to check against.
- **Location leaks** from the linked catalog event (brief, D8).
