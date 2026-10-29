# Just Go Live

A free crowd game for live shows. Fans scan a venue QR code into the Just Go App Clip (or the app), pick who wins each match before the bell, then tap to cheer their corner. A spotter at the show rings the bell and calls the winner from a phone page. Picks score; cheers are just for fun.

The app speaks the protocol in `Meridian-Mobile/src/live/liveProtocol.ts`. Its on-device demo (`liveDemoEngine.ts`) is the reference for how a night behaves; this server behaves the same, with the spotter in place of the demo's clock.

## Pieces

| File | What |
| --- | --- |
| `services/justGoLive/liveEngine.js` | One night in memory: picks, odds, scores, the rope, #1 fans, spotter commands, snapshots. Pure, no I/O. |
| `services/justGoLive/liveHub.js` | Sockets at `/pivot/live/{eventId}/socket`, the 250 ms tick, broadcasts, writes to Mongo. |
| `services/justGoLive/liveStore.js` | `justgo_live_events` (card, spotter state, PIN digest) and `justgo_live_fans` (names, picks). |
| `routes/justGoLiveRoutes.js` | `GET /pivot/live/:id` (polling), `POST …/messages`, and the spotter's `/spot`, `/spot/state`, `/spot/command`. |
| `services/justGoLive/spotterPage.js` | The spotter's phone page. |
| `services/justGoLive/liveAdminService.js`, `routes/justGoLiveAdminRoutes.js` | Pivot admin's Live page: cards, PIN, images (S3 `justgo-live/{eventId}`), reset. Platform admins only. |
| `scripts/justGoLiveEvent.js` | Checks and loads a card from a terminal. |

## Run a night

1. **Set up the card in Pivot admin → Just Go → Live** (fleet view, last item). **New event**: give it an id (it goes in the QR code and can't change), a title, and a spotter PIN. Add matches in running order; each has 2–4 corners with a name, colour, and an image: an upload (PNGs with transparency stay cut-outs), or one of the app's drawn fighters. The opening screen is optional. Save. Saving again mid-night keeps every call and pick, and phones in the event see the change at once.
2. **Share**, on the same page: pick the city, optionally where the code hangs (`door`, `bar`), and download the QR. The fan link is `https://justgo.lol/clip/{city}?live={eventId}`.
3. **Restart the dyno the morning of the show**, so the night starts on a fresh process.
4. **Spotter:** open the spotter link from the Share section on a phone and enter the PIN.
5. **After a rehearsal**, **Reset the night** at the bottom of the page clears the calls, picks and names (type the event id to confirm). Never during a show.

Without admin, `scripts/justGoLiveEvent.js check|load card.json --pin=… --ack-write` loads a card JSON (see `docs/just-go-live-card.example.json`) the same way.

During the night the spotter, for each match: **open picks** → **hold to ring the bell** → **hold: {name} wins** (or **no contest**). Optional: a bell countdown, pause/resume, a 20-second surge, knocking a fighter out of a 3–4 way, a notice line, a full-screen hold, switches for chat, #1 fans, moments and the install ask. After the last match, **hold to end the night** shows every phone its finale (the clip asks for the install). Anything can be undone for a minute; every press carries an id, so a retry on bad signal can't apply twice.

## Behavior

- **Odds and points.** Before the bell the pick split is the room's odds (smoothed, kept between 4% and 96%). The bell freezes them. A right pick scores `round(100 / share)`, so underdogs score more. Scores are derived from picks and results, never stored, so undoing a call needs no repair.
- **Cheers.** Capped at 8 taps a second per phone (3 seconds can bank). The rope (two corners) or momentum bands (3–4) compare taps per cheering fan over the last 3 seconds; a surge doubles the swing and each fan's count.
- **Names.** The clip asks for one; the app sends the account's first name. Names go through `profanityFilterService` and can't carry links; a refusal shows inline on the phone. Device ids never reach other phones.
- **Restarts.** The spotter's state is written on every command, picks and names about once a second. A restart loses at most a second of picks and the current cheers; phones reconnect on their own and fall back to polling.

## Limits

- **One dyno.** Each event lives in one process. Two dynos would split the room. No Redis.
- **Load.** While the rope is live every phone gets 4 snapshots a second; each tick serializes the shared part once. The feed goes out once a second as one shared message.
- **No IP rate limits on fan endpoints**: a venue's phones often share one address. The spotter PIN locks for ten minutes after eight wrong tries per event.
