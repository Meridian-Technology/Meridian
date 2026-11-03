# Just Go NFC invitations: product brief

Status: draft for sign-off (2026-10-17). Recommendations are marked **Rec**.
Nothing here is built yet beyond the server slice in
[`justgo-campaign-admission-api.md`](./justgo-campaign-admission-api.md).
The build sequence is in
[`justgo-nfc-invitations-plan.md`](./justgo-nfc-invitations-plan.md).

## The idea

Just Go hosts a free underground rave for about 100 people. The team posts
where they'll be, meets people in person, and hands out NFC dog tags. Tapping a
tag opens an invitation. Claiming it gives you a personal pass. The tag is how
you got in the door socially; it's not what gets you in the venue.

"Less scrolling, more going": you can only get in by meeting someone, whether
that's the team or a friend who has a tag.

## Decisions to sign off

| # | Question | Rec |
| --- | --- | --- |
| D1 | Who owns a tag? | Guests keep their tag. It has 3 seats: the holder plus 2 friends. |
| D2 | Must a tap prove someone was physically there? | Yes. Use NTAG 424 DNA tags with SUN (signed per-tap URLs). |
| D3 | How do friends claim? | They tap the holder's physical tag on their own phone. There's no share link. |
| D4 | Identity in the App Clip | No sign-in in the Clip. It claims with a device key, and the pass attaches to an account when the user signs in to the full app. |
| D5 | Where staff tools live | In the platform admin web app, including a phone-browser door scanner. |
| D6 | Android guests | Install the full app (Play install referrer carries the tag), with staff help at handout. |
| D7 | Allocation | 30 guest tags × 3 seats = 90. One staff tag holds 10 comp seats. Claim capacity is 100. |
| D8 | Venue disclosure | Neighborhood before claiming. Exact address on the pass from a set reveal time on the day. |
| D9 | Cancellation | "Give my spot back" frees the seat on both the tag and the event. The person can claim again while space remains. |
| D10 | Apple Wallet pass | After launch, not in v1. The in-app pass works offline. |

The rest of this brief explains each recommendation and what it implies.

### D1: guest-owned tags with friend seats

The alternative is tags that only staff hold, so every attendee meets the team.
That's tighter but caps reach at however many people staff can talk to. It also
gives up the tag as a keepsake and the friend-of-a-friend loop.

**Rec:** guests keep their tags. Each tag has three seats. The first person to
claim on a tag becomes its **holder**. Staff hand the tag over and ask the
recipient to tap it right then, which makes the handover the moment the tag
gets bound. Later claims on that tag are the holder's **friends**, and the
invitation screen tells them who invited them.

The same model also covers staff-held tags: that's just a tag with no guest
holder and a bigger allowance (D7's comp tag). If the team later wants
"everyone meets us", they can issue staff tags only. No new build is needed.

**Invariant:** if the seats enrolled across all tags add up to no more than
capacity, no tag holder ever sees "full". The organizer UI warns when issuing
tags would overcommit capacity.

### D2: proof of presence

A normal NTAG21x tag holds a fixed URL. Anyone who taps it once can paste that
URL into a group chat. With friend seats, the damage from that is limited to
three seats per tag. That limit is acceptable for friend seats but fails for a
staff tag with 10 or more seats, and it means "tap" never proves anyone met
anyone.

**Rec:** NTAG 424 DNA tags with SUN/SDM. Each tap generates a URL with an
encrypted tap counter and a CMAC. The server verifies the CMAC with that tag's
key and rejects a counter it has already seen, or one older than the newest
tap. A tap URL is valid for a short window (10 minutes) after the server first
sees it. Copying it gets you nothing once that window closes. For 40 tags, the
price difference over plain NTAG215 is small.

Either way, lock every tag after writing it. An unlocked NTAG can be rewritten
by anyone, for example to point at a phishing page.

If D2 is rejected, the plan still works. Friend seats are the only protection,
and staff tags need a low allowance.

### D3: how friends claim

**Rec:** a friend taps the holder's tag. That makes every claim an in-person
moment and keeps D2 meaningful. There's no "share invite" link. The holder's
pass shows "2 spots left on your tag: have friends tap it."

### D4: identity

Constraints:

- You must be able to claim without installing the full app.
- The pass must survive moving from the Clip to the full app.
- Signing in happens only in the full app. The Clip has no login of any kind.

What exists today:

- The Clip has no auth and no Apple, Google or camera native modules. It stays
  that way.
- The claim API requires a real `globalUserId`. That has to change for the
  Clip.
- The Clip already hands data to the full app through the keychain
  (`justgo_clip_handoff_v1`). From iOS 15.4 the full app can read keychain
  items its Clip wrote.

Signing in at claim time doesn't control abuse. The tag does: each tag has a
fixed number of seats, and with D2 every claim needs a fresh physical tap. An
account at claim time would only help with recovery and reaching people about
the address reveal. The full app covers both.

**Rec:**

1. **Claim in the Clip with a device key.**
   - On first launch, the Clip generates a random 256-bit key and stores it in
     the keychain.
   - The claim sends the key, the tap proof, and the name the door should see.
   - The server stores only a hash of the key. The admission belongs to that
     key until it's attached to an account.
   - Tapping again from the same phone returns the same pass, with no new
     seat.
2. **Attach the pass at sign-in in the full app.**
   - The Clip writes the key and admission reference into the keychain handoff.
   - When someone signs in to the full app, by any method, the app reads the
     key and calls an attach endpoint. The pass moves onto the account and the
     key stops working.
   - If the account already has a pass for that event, the account's pass wins
     and the device pass is cancelled, freeing its seat.
3. **The full app needs sign-in to claim.** If a tag opens the full app while
   it's signed out, the app stashes the token, sends the user through sign-in,
   then claims. Inside the app there's no guest path.
4. **Name at the door.** The Clip asks for the name the door will see. It's
   unverified and stored on the admission for staff lookup. Once attached, the
   app can update it from the account.

### Recovery

- **Before install:** the pass lives on that phone only. If the phone is lost,
  or iOS clears the Clip's data, the pass is gone. The door can still look the
  person up by name, with "who gave you the tag?" as a light check against the
  tag's holder.
- **After sign-in in the full app:** the pass belongs to the account. Signing
  in anywhere shows it. A repeat claim returns the original pass.
- **On the device:** the pass is cached so it renders with no signal.
- **Shared screenshots:** a QR checks in only once, and the door screen shows
  the attendee's name on every scan.

The pitch for installing is therefore direct: "Get Just Go to keep your pass
safe and get the address drop."

### D8: what people see before and after claiming

| Before claiming: anyone holding the tap URL | After claiming: the holder of the pass |
| --- | --- |
| Event title, date, start time, city, neighborhood | Personal QR pass and the name at the door |
| Short vibe or lineup copy, "free", age policy | Exact venue, from the reveal time |
| Who invited you: holder's first name, or "the Just Go team" | Entry instructions |
| Seats left on this tag, plus coarse event status (open / almost full / full) | "Give my spot back" |
| | Holders also see friend seats left and who used them |

Never shown: the attendee list, other people's passes, exact counts per tag
beyond the one you tapped.

**Leak to fix:** the public preview returns `eventId`. If the linked catalog
event is public and carries the real address, the secret location leaks. Keep
the venue on the campaign (a private field with a reveal time). Keep the
catalog event's location at neighborhood level, or unpublished, and remove
`eventId` from the public preview.

The venue reveal is also a natural reason to install the full app. App Clip
notifications only last about 8 hours after launch, so "Get Just Go for the
address drop" is a real reason, not a growth nag.

### D5: staff tools

The Just Go binary deliberately excludes camera modules
(`withJustGoExcludeUnusedNative`). Bringing the camera back for a staff-only
feature would add native size and a camera-permission explanation for App
Review in a consumer app.

**Rec:** organizer controls and the door scanner live in the platform admin web
app (`frontend/src/pages/PlatformAdmin/PivotLab`). The door mode runs in a
phone browser: a JS QR decoder (iOS Safari has no `BarcodeDetector`), name
lookup, and an offline roster. This is a staff tool. It doesn't revisit the
decision against a web claim page for guests.

### D6: Android

There's no App Clip on Android. Google Play Instant is being retired, so
there's no instant-app path to build toward. Just Go Android App Links are also
unverified: `assetlinks.json` still has placeholder fingerprints.

**Rec:** the tag URL opens a minimal web page for Android and other non-iOS
browsers. It does no claiming; it only links to Play. Pass the tag through Play
Install Referrer so the installed app opens the invitation. Staff carry the
comp tag for anyone who gets stuck. Before any build work, decide how many
Android guests are expected.

### D9: cancellation and lifecycle

- **Self-cancel** ("give my spot back") sets the admission to `cancelled` and
  frees one seat on the event and one on the source tag, in the same
  transaction. The same person can claim again while space remains.
- **Organizer revoke** sets `revoked`. That person can't claim again for this
  event.
- **Closing the campaign** stops new claims. Existing passes still work.
- **Revoking a tag** stops new claims through that tag. Existing passes still
  work.
- **No-shows:** free events often lose a large share of claims. For the first
  event, keep claim capacity at 100, send a "can't make it?" nudge on the day,
  and measure the show rate before trying overbooking.

### Reuse across events

The tag must outlive this event, so the URL can't encode the campaign. A tag is
a durable object with a stable token, an optional SUN key, and a holder. Each
event **enrolls** tags with a per-tag allowance. Tapping a tag with no active
enrollment shows "Your tag is live. Next drop soon." plus the city deck the
Clip already has. Future events can enroll every holder who came.

The App Clip card (title and image before launch) is set per URL prefix in App
Store Connect. That means one experience for `justgo.lol/tag/`, with the art
swapped per event. Swapping art needs no new build.

## Journey

1. Tap the tag. The App Clip card appears. Open it.
2. See the invitation: event, who invited you, seats left. "Claim my spot."
3. Confirm the name the door will see. There's no sign-in.
4. See your pass: QR, name, event, "address drops at {time}". Holders see
   "2 friends can tap your tag".
5. Get Just Go and sign in. The pass attaches to your account, and the app opens on it.
6. On the day: address reveal and reminder. At the door: scan → checked in.

Tapping again in the Clip opens straight to the pass. If the full app is
installed, the tap opens the same journey inside the app.

## Out of scope for v1

Paid tickets, waitlists, Wallet passes (D10), any sign-in in the Clip,
reveal by SMS, dynamic or rotating QR codes, overbooking.
