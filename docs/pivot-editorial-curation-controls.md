# Pivot editorial curation controls

The MER-201 controls let an operator influence unopened weekly Drop decks while preserving the existing personalization model. They are intended as a temporary human steering layer: the ranker still computes an organic score, then records the editorial treatment separately so later analysis can distinguish product judgment from learned relevance.

## Event influence

Open an event in the platform-admin Curation catalog and use **Editorial influence**. Bulk influence is available after selecting multiple rows.

| Tier | Selection behavior | Score adjustment |
| --- | --- | ---: |
| Hidden | Excluded from new Drop decks and Explore | n/a |
| Demote | Remains eligible but ranks lower | -0.7 |
| Standard | Clears the override | 0 |
| Promote | Ranks higher | +0.7 |
| Strong promote | Ranks substantially higher | +1.5 |
| Must show | Guaranteed membership, within the tenant hard maximum | 0 |

Promote and Strong promote can target everyone or only people whose interest tags match at least one event tag. A matching event receives the adjustment once; matching more tags does not stack the boost. Demote, Hidden, and Must show always apply to everyone.

The note is optional and internal. Each saved override also records the operator and time. Moving an event to another batch week clears its override, preventing an old editorial decision from silently carrying into a later Drop.

## Exact editorial set

Select published, visible events in one week and choose **Use selection as exact set**. Every unopened deck receives exactly that event set, capped by the tenant hard maximum; the order within the set remains personalized. The algorithm does not fill a short exact set with other catalog events.

Choose **Return to personalized** to restore normal ranked selection. Event-level Promote, Strong promote, Demote, Must show, and Hidden settings remain in place.

## Frozen decks and visibility

The controls affect only decks that have not been opened. The first Drop request creates a per-user snapshot, and later editorial changes do not rewrite it. This includes Hidden: hiding an event removes it from Explore and from newly created decks, but it remains in an already-frozen deck. An authorized admin refresh is the explicit exception and rebuilds the snapshot.

Hidden is a discovery control, not an unpublish action. The event's direct public page remains available. Use Unpublish when the listing itself should no longer be live.

## Capacity guardrails

- An exact set cannot contain more events than the tenant `hardMax` and may contain only published, non-hidden events from that batch week.
- The service prevents adding more Must show events than `hardMax` in a week.
- Must show consumes normal deck capacity. It does not receive an artificial score and still takes its personalized position among selected events.
- `featured` is independent and continues to control only the public landing deck.

## API and stored data

Event overrides use `PATCH /admin/pivot/ingest/:eventId` with `tenantKey` and an `overrides.rankingOverride` object. Send `null` or `{ "tier": "standard" }` to clear it.

Batch policy uses `PUT /admin/pivot/tenants/:tenantKey/batches/:batchWeek/selection-policy` with `{ "mode": "editorial", "eventIds": [...] }` or `{ "mode": "personalized", "eventIds": [] }`.

Per-user deck snapshots record ranker version `rules_v2_editorial`, selection mode, and one treatment row per candidate: organic score/rank, editorial adjustment, final score/rank, tier, audience match, and inclusion reason. Use those fields for offline evaluation; do not train a later relevance model on final rank without separating the editorial adjustment.

## Suggested operating cadence

Before a Drop, review all non-standard badges, confirm the Must show count and exact-set mode, then preview representative users in the deck inspector. After launch, compare organic versus final rank and note whether promoted events earned positive intent. Prefer Standard once enough intent exists; the controls should narrow as the learned ranker becomes reliable.
