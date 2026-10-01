# Pivot tenant dashboard: Audience outcome

User journeys (`?page=2`) and Drop deck (`?page=3`) are one **Audience** panel
at `?page=2`. Both pages had their own user search, active-user list, week
picker and selected-user state; Audience has one of each. The Journeys
inspector, with its deck replay, is the base; the Drop deck's scored deck is a
pane inside it.

| View | URL | Contents | Source |
| --- | --- | --- | --- |
| Week | `audience=week` (default) | Week snapshot, intent funnel, analytics steps. | `PivotTenantAudiencePage.jsx` |
| Users | `audience=users&userId=…` | Search / most active list; selected user with Clear and Wipe week. Panes: **Replay** (default), **Ranking** (`userPane=ranking`), **Activity** (`userPane=activity`). | `PivotAudienceUserInspector.jsx`, `PivotDeckReplay.jsx`, `PivotDeckRankingPanel.jsx` |
| Deck rules | `audience=rules` | Length, score weights, formula, review/save, discard, reset to defaults. | `PivotDeckRulesPanel.jsx` |

The week picker and Refresh sit in the page header on Week and Users. Deck
rules are city-wide, so that view hides them and does not load week data.

Ranking asks for the week the app would open by default. The **App week ·
W37 / W36** switch pins it to the page week (`deckWeek=page`), which replaces
the Drop deck page's separate "App week / Pinned week" picker.

The Audience-only parameter names (`audience`, `userPane`, `deckWeek`) are
deliberate: the dashboard shell carries every query parameter across nav
clicks.

## Old bookmarks

- `?page=2&batchWeek=…&userId=…` opens Users on that user's replay.
- `?page=3` redirects to `?page=2&audience=rules`.
- `?page=3&userId=…` redirects to that user's Ranking pane; if the bookmark
  also had `batchWeek`, it is pinned with `deckWeek=page`, as before.
- Index 3 stays reserved (`dropDeck`, hidden from nav, highlights Audience).

## Phase 0 parity mapping

| Phase 0 control | Destination |
| --- | --- |
| Journeys: batch week, refresh | Header (Week, Users) |
| Journeys: weekly snapshot, both funnels | Week |
| Journeys / Drop deck: user search, active-user list | Users (one list) |
| Journeys: deck replay | Users → Replay |
| Journeys: intents, recent analytics | Users → Activity |
| Journeys: link to Curation | Users section header; each intent's Catalog link |
| Journeys: wipe interactions for week | Users → selected user header |
| Drop deck: app-week or selected-week preview | Users → Ranking week switch |
| Drop deck: frozen vs. live rebuild, score breakdown, intent state | Users → Ranking |
| Drop deck: length, weights, formula, review/save, discard, reset | Deck rules |

Retired: the Drop deck page's link to User journeys (both are now the same
place). In app-week mode, the page week no longer jumps to the week the
preview resolved; the resolved week shows on the switch instead.

## Parity check before release

1. Open `?page=2` with no params, with `userId`, and with each `audience` and
   `userPane` value. Refresh and use Back/Forward.
2. Open `?page=3`, `?page=3&userId=…`, and `?page=3&batchWeek=…&userId=…`.
3. On Ranking, compare a user who already opened the drop (saved deck, then
   "Show what they'd see now") and one who has not.
4. Wipe a test user's week and confirm Activity, Replay and the Week snapshot
   update.
5. Edit, review, save, discard and reset deck rules; confirm the tenant
   `pivotDeckConfig` patch is unchanged from the old page.
6. Switch cities from each view.
