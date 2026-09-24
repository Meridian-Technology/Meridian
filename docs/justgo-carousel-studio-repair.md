# Carousel studio repair — September 24, 2026

This is local implementation and verification evidence. No deployment, Relay operation, production migration, or live account edit was performed. Existing uncommitted library/curation work was retained.

## Repair

- Replaced lab-dependent production rendering with absolute logical-pixel wrappers on a 1080 × 1350 surface and one outer zoom. Artwork, controls, and thumbnail labels have separate selectors. Canvas, previews, thumbnails, and the verification surface use `StudioSlide`.
- Shared normalization/reflow, geometry, date formatting, and preset construction between browser and server. Loading preserves saved geometry. Revised presets retain schema version 2 and have preset version 2. Legacy typography units remain supported.
- Added all nine Round 05 cover variations and three Round 06 event arrangements, including mixed fonts, letter rotations, masks, prints and captions, paper title strips, grain, and independently editable stickers. Templates show the current slide's content. Reset and shuffle are explicit history entries; existing issues are not regenerated on load.
- Rebuilt the bounded Pivot Ops shell, independently scrolling panels, fit/zoom, visual Templates, Assets, and Layers. Added direct text/label editing, text insertion, pointer transforms, slide-space snapping, parent selection/locking, grouping, clipboard commands, numeric alternatives, pointer cancellation, and pointer-driven slide reorder.
- Text is measured after fonts settle. Flow children reflow; detached elements keep their frames. Fixed-card overflow has explicit resize/font-fit actions. Empty logistics disappear. New blurbs are blank: source event descriptions are never inserted into new artwork. Authored recap notes/blurbs survive template changes.
- Newly generated dates use source-city timezone information and bold type. Legacy standalone ISO lines in logistics display as readable, bold dates without rewriting the saved string. Other authored date strings remain unchanged.
- “Add a photograph” is an actual file-picker action. Authenticated account upload/list endpoints store stable S3 references and metadata, with an isolated 8 MB studio limit. Failed uploads do not replace a photo. Removing artwork does not delete files.
- Edit selection uses a non-writing preview and enters editor history as document + curation metadata together. Revision-checked Save commits both atomically. It preserves edits made during a request, retains conflicts, and guards navigation. Export is unavailable for v2 in both UI and legacy token endpoints until the exact-revision pipeline exists.
- Account isolation tests exposed the existing sparse unique `migrationKey` default-null bug. New accounts now omit an absent migration key; no index or production data migration was run.

## Automated evidence

Run from `Meridian/frontend`:

```sh
npx --no-install jest -c jest.carousel.config.js --runInBand
NODE_ENV=test npx --no-install eslint --ext .js,.jsx src/pages/PlatformAdmin/PivotTenantDashboard/carousel/studio src/shared/carouselStudio src/pages/PlatformAdmin/PivotTenantDashboard/carousel/PivotCarouselCurationWorkspace.jsx src/pages/PlatformAdmin/PivotTenantDashboard/carousel/PivotCarouselPage.jsx
```

Run from `Meridian`:

```sh
NODE_ENV=test ./backend/node_modules/.bin/jest --config backend/jest.config.js --runInBand --testPathPatterns='pivotCarousel(StudioPersistence|Document|Presets|Issue|CurationDraft|CurationQuery|Export)'
```

Frontend: 241 tests across 23 suites. Backend: 44 tests across 9 suites. Focused lint and `git diff --check` pass. The existing CRA dependency, AWS SDK, Mongoose reserved-field, and unrelated development-build warnings remain.

Coverage includes exact undo restoration, retained authored/removed content, unique IDs after grouped preset changes, rotated coordinate conversion, document round-trip, upload replacement/failure, account isolation (including stripped asset metadata), concurrent-save compare-and-swap, non-writing curation preview, atomic selection save, pending-save edits, explicit conflict/failure state, legacy date rendering, source-description omission, and the image-placeholder picker action.

Backend integration tests use ephemeral MongoDB with the existing S3 adapter mocked. Frontend request tests also mock transport. They do not establish live S3 connectivity or a signed-in browser-to-storage round-trip.

## Browser evidence

Development-only route: `http://localhost:3000/dev/justgo-studio`.

- Compared all nine covers and three event layouts side-by-side with the approved lab and matching content. Fixed print dimensions/captions, text-strip width, photo focal points, text measurement, and event layout issues found visually. These were visual comparisons, not a zero-pixel-difference assertion; editable field boundaries and bold date treatment are deliberate differences.
- Confirmed drag, rotated resize, rotation, and undo/redo against rendered geometry. A 38-screen-pixel move at 76% zoom changed the group position by 50 logical pixels. Earlier checks used fit zoom near 46%; the narrower workspace fit near 39%.
- Confirmed inline multiline text and emoji, editing a logistics label, text insertion, fixed-card overflow/font-fit, group/ungroup, parent lock/unlock, rotated group movement, image crop mode, template switching, and authored blurb preservation.
- Confirmed pointer-based slide reorder and keyboard alternatives in a 20-slide issue; add/duplicate controls disable at the cap. Large canvases scroll independently of the rail and inspector.
- Confirmed “Add a photograph” emits a file chooser. Upload success/failure and persistence were checked by the automated transport/storage tests, not by uploading to a live account.
- Confirmed local fixture Save returns Saved, and the full-resolution surface has width 1080px, height 1350px, and scale(1), without editor handles or blank-blurb prompts.

Local screenshot artifacts (ignored by Git): `out/carousel-studio/editor.png`, `approved-comparison.png`, `event-comparison.png`, and `full-resolution.png`. The fixture includes a blank new event and a 20-slide stress case. Lab copy is confined to verification fixtures.

## Remaining release verification

A signed-in staging session must still exercise real upload/list/save/reload/replacement against configured S3, account authorization middleware, and deployment packaging. Full touch-device coverage and the complete release matrix remain in phase 6.1. Autosave/recovery, immutable export jobs, deployment, and Relay operations remain separate work. The local fixture deliberately cannot serve as evidence of those operations.
