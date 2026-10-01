# Pivot tenant dashboard: Phase 1 outcome

Voice and Carousels remain separate city dashboard panels. The combined
Creative studio entry and its view switch have been removed.

| Panel | URL | Capability |
| --- | --- | --- |
| Voice | `?page=5` | City app-copy catalog, search and filters, inheritance layers, interpolation preview, review/save, reset. |
| Carousels | `?page=8` | Library, account and edition selection, legacy and Studio editors, curation, archive/delete, export and job state. `deckId`, `curation`, and `account` stay in the URL. |
| Design review, development only | `?page=12` | Cover Lab rounds, studies, gallery, previews, browser-local shortlist. |

The pages no longer show an uppercase parent label above their titles. Their
headers use an opaque surface so text and controls remain readable.

Bookmarks made during the brief combined-view implementation still work:
`?page=8&creative=copy` redirects to Voice, and
`?page=8&creative=design` redirects to the development-only Design review.
Outside development, Design review URLs redirect to Carousels. Numeric page
indexes for all other dashboard panels remain unchanged.

## Parity check before release

1. Open `page=8` with and without `deckId`, `curation`, and `account`; create,
   edit, save, archive/delete, export, and inspect job status.
2. Open `page=5`; search, edit, preview, save, reset, and check that city and
   platform copy layers resolve correctly.
3. In development, open `page=12`; switch review rounds, preview covers, and
   check the shortlist. Verify this UI is unavailable in production.
4. Refresh each URL, use Back/Forward, switch cities, and check later panel
   indexes and header contrast.

The Phase 0 inventory in `pivot-tenant-dashboard-phase0-parity.md` remains
the complete control and API checklist.
