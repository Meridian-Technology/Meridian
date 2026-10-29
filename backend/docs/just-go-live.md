# Just Go Live

A free crowd game for live shows. Fans scan a venue QR code into the Just Go App Clip (or the app), pick who wins each match before the bell, then tap to cheer their corner. A spotter at the show rings the bell and calls the winner from a phone page. Picks score; cheers are just for fun.

The app speaks the protocol in `Meridian-Mobile/src/live/liveProtocol.ts`. Its on-device demo (`liveDemoEngine.ts`) is the reference for how a night behaves; this server behaves the same, with the spotter in place of the demo's clock.

## Pieces

| File | What |
| --- | --- |
| `services/justGoLive/liveEngine.js` | One night in memory: picks, odds, scores, the rope, #1 fans, spotter commands, snapshots. Pure, no I/O. |
| `services/justGoLive/liveHub.js` | Sockets at `/pivot/live/{eventId}/socket`, the 250 ms tick, broadcasts, writes to Mongo. |
| `services/justGoLive/liveStore.js` | `justgo_live_events` (card, spotter state, PIN digest) and `justgo_live_fans` (names, picks). |
| `routes/justGoLiveRoutes.js` | `GET /pivot/live/:id` (polling), `POST …/messages`, and the spotter's `/spot`, `/spot/session`, `/spot/state`, `/spot/command`. |
| `services/justGoLive/spotterPage.js` | The spotter's phone page. |
| `services/justGoLive/liveAdminService.js`, `routes/justGoLiveAdminRoutes.js` | Pivot admin's Live page: cards, hours, PIN, images (S3 `justgo-live/{eventId}`), close, unlock the spotter, reset. Platform admins only. |
| `scripts/justGoLiveEvent.js` | Checks and loads a card from a terminal. |

## Run a night

1. **Set up the card in Pivot admin → Just Go → Live** (fleet view, last item). **New event**: give it an id (it goes in the QR code and can't change), a title, and a spotter PIN. Add matches in running order; each has 2–4 corners with a name, colour, and an image: an upload (PNGs with transparency stay cut-outs), or one of the app's drawn fighters. The opening screen is optional. Save. Saving again mid-night keeps every call and pick, and phones in the event see the change at once.
2. **Set its hours**, in the Hours section: from 2 hours before doors to an hour after the end (24 hours at most). Outside them every live route answers "this one isn't live", the spotter included. With no hours, the night is closed. A phone that scans before the hours open is told the night isn't live and has to scan again, so open early enough.
3. **Share**, on the same page: pick the city, optionally where the code hangs (`door`, `bar`), and download the QR. The fan link is `https://justgo.lol/clip/{city}?live={eventId}`.
4. **Spotter:** open the spotter link from the Share section on a phone and enter the PIN once. It's good for 12 hours, across restarts, until the PIN changes.
5. **After the show**, the hours end on their own: phones get a last word and are hung up on, keeping their last screen. **Close to phones now** does it early.
6. **After a rehearsal**, **Reset the night** at the bottom of the page clears the calls, picks and names (type the event id to confirm). Never during a show.

Don't restart the dyno for a night: it's the whole Meridian API, and the hub unloads idle nights on its own.

Without admin, `scripts/justGoLiveEvent.js check|load card.json --pin=… --ack-write` loads a card JSON (see `docs/just-go-live-card.example.json`) the same way. Set its hours in admin.

During the night the spotter, for each match: **open picks** → **hold to ring the bell** → **hold: {name} wins** (or **no contest**). Optional: a bell countdown, pause/resume, a 20-second surge, knocking a fighter out of a 3–4 way, a notice line, a full-screen hold, switches for chat, #1 fans, moments and the install ask. After the last match, **hold to end the night** shows every phone its finale (the clip asks for the install). Anything can be undone for a minute; every press carries an id, so a retry on bad signal can't apply twice.

## Behavior

- **Odds and points.** Before the bell the pick split is the room's odds (smoothed, kept between 4% and 96%). The bell freezes them. A right pick scores `round(100 / share)`, so underdogs score more. Scores are derived from picks and results, never stored, so undoing a call needs no repair.
- **Cheers.** Capped at 8 taps a second per phone (3 seconds can bank). The rope (two corners) or momentum bands (3–4) compare taps per cheering fan over the last 3 seconds; a surge doubles the swing and each fan's count.
- **Names.** The clip asks for one; the app sends the account's first name. Names go through `profanityFilterService` and can't carry links; a refusal shows inline on the phone. Device ids never reach other phones.
- **Restarts.** The spotter's state is written on every command, picks and names about once a second. A restart loses at most a second of picks and the current cheers; phones reconnect on their own and fall back to polling.

## Limits

Live runs in the same process as the rest of Meridian (`meridian-production`, one web dyno), so nothing a stranger sends grows without a bound. The numbers are in `LIMITS` at the top of `liveHub.js`.

- **One dyno.** Each event lives in one process. Two dynos would split the room. No Redis. Don't scale `web` past 1 during a night's hours.
- **Hours.** Only nights within their hours reach Mongo. Any other id is refused from memory: which nights are open is read at most once a minute, and only when something asks. Admin saves apply at once.
- **500 fans a night.** Past that, new phones are told the room's full (the app stops trying); fans already in always get back in. Fans load and save in batches about once a second. Mongo deletes a fan 30 days after their last save.
- **Sockets.** 1,000 across every night, one per device (a second socket replaces the first), dropped if they don't join within 10 seconds, or if they fall more than 64 KB behind for 15 seconds.
- **Per address,** generously, because a venue's Wi-Fi is one address: 60 new fans and 300 socket opens a minute. The address is the last entry of `X-Forwarded-For`, which Heroku's router appends.
- **Spotter.** The PIN is checked once (scrypt, off the event loop) for a signed token; polls check the token. Eight wrong PINs lock out that address for ten minutes, not the spotter; a hundred a night lock out new sign-ins until **Unlock spotter** in admin. A signed-in spotter is never locked out.
- **Load.** While the rope is live every phone gets 4 snapshots a second; each tick serializes the shared part once. The feed goes out once a second as one shared message. If the event loop's p99 lag passes 100 ms, the rope drops to 1 snapshot a second until it's back under 40 ms, so live slows down before Meridian does.

## During a night

- `heroku logs --tail -a meridian-production | grep '\[live\]'` shows a line a minute: fans and phones per night, sockets, event-loop lag (p99), whether snapshots are slowed, and memory.
- No deploys or restarts while a night is open. Phones would reconnect, but there's no reason to risk it.
- **Off switch:** `heroku config:set JUSTGO_LIVE_DISABLED=1 -a meridian-production`. Every live route answers 404 and the socket isn't attached. Setting a config var restarts the dyno (all of Meridian), so prefer **Close to phones now** in admin, and keep this for when admin can't be reached.
