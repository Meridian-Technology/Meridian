# Carousel compose verification paths

Phase 2 spans two packages in Meridian and the sibling Relay repository. Resolve
each check's file operands relative to its declared working directory.

## Shared studio presets

The implementation is in `Meridian/backend/services/` and the shared preset
source is in `Meridian/frontend/src/shared/carouselStudio/`. The backend bridge
at `backend/services/pivotCarouselPresets.js` re-exports that frontend module;
`backend/services/pivotCarouselCompositionService.js` uses its preset catalogs
and generators to build editable compose documents.

From **Meridian**, this read-only check covers both packages:

```sh
rg -n 'generateCoverSlide|COVER_FAMILIES' backend/services/pivotCarouselCompositionService.js frontend/src/shared/carouselStudio/presets.js
```

From **Meridian/backend**, the equivalent check is:

```sh
rg -n 'generateCoverSlide|COVER_FAMILIES' services/pivotCarouselCompositionService.js ../frontend/src/shared/carouselStudio/presets.js
```

Both commands exit 0. Combining `services/...` with `frontend/...` in one check
mixes these two roots: Meridian has no root-level `services/` directory, and
Meridian/backend has no `frontend/` directory. Do not add duplicate source trees
or aliases to make such a command resolve.

Other backend surfaces can be checked from **Meridian** with their full paths:

```sh
rg -n 'carousel-compose|validateComposeResult' backend/utilities/pivotAdminComputeJobContract.js
rg -n 'listEditorialFeedback|searchEditorialCatalogPage|buildCarouselComposeContextSnapshot' backend/services/pivotCarouselComposeContextService.js
rg -n 'searchEditorialCatalogPage' backend/services/pivotCarouselCurationQueryService.js
rg -n 'applyCarouselComposeJob|composeOutcome' backend/services/pivotComputeAdminService.js
```

## Frozen verification evidence

The phase verification commands are unchanged:

| Working directory | Command |
| --- | --- |
| relay | `npx vitest run src/jobs/compute-contract-fixtures.test.ts src/jobs/request.test.ts` |
| Meridian/backend | `npm run test:group -- compute-admin` |
| Meridian/backend | `npm run test:group -- creator-editorial` |
| Meridian/backend | `npm run test:groups:validate` |
| relay | `npm run build` |

Independent judge checks that use test evidence should repeat these commands
exactly, with the listed working directory. Relay reuses their passing phase
results. A focused `npx jest` command is useful during implementation, but it
does not match frozen evidence and attempts fresh writes in the judge's
read-only sandbox.

This guide records runnable evidence paths; it does not replace the independent
phase judgment or authorize edits to its saved verdict.
