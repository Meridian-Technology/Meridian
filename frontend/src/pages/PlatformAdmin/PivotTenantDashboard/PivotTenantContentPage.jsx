import React, { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import PivotTenantViewTabs from './PivotTenantViewTabs';
import PivotTenantCurationPage from './PivotTenantCurationPage';
import PivotTenantCatalogPage from './PivotTenantCatalogPage';
import PivotTenantLocationMigrationPage, {
  RICH_LOCATION_MIGRATION_UI_ENABLED,
} from './PivotTenantLocationMigrationPage';

/*
 * `content` URL param. Events is the default and has no param. Events and
 * Sources are one page component (shared week state); Organizers is the city
 * catalog; Locations only exists while the rich-location UI flag is on.
 */
const ALL_CONTENT_VIEWS = Object.freeze([
  { id: 'events', label: 'Events' },
  { id: 'sources', label: 'Sources' },
  { id: 'organizers', label: 'Organizers' },
  { id: 'locations', label: 'Locations', flag: () => RICH_LOCATION_MIGRATION_UI_ENABLED },
]);

export function contentViews() {
  return ALL_CONTENT_VIEWS.filter((view) => !view.flag || view.flag());
}

// Params owned by one tab family. Curation (Events/Sources) and Organizers both
// use `filter` and `source` with different meanings, so crossing between the
// families clears them; Events ↔ Sources keeps them.
const TAB_PARAMS = ['filter', 'source', 'eventId', 'organizerId', 'q', 'claimStatus', 'sort'];
const CURATION_VIEWS = new Set(['events', 'sources']);

/**
 * Per-tenant Content: the week's events (review queue), where they come from
 * (sources and saved crawl jobs), the city's organizers, and — behind a flag —
 * location migration. Replaces the former Curation (1), Catalog (4), and
 * Location migration (7) panels; 4 and 7 redirect here.
 */
function PivotTenantContentPage({ tenantKey, cityDisplayName, onTenantUpdated }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const views = useMemo(() => contentViews(), []);
  const viewIds = useMemo(() => new Set(views.map((view) => view.id)), [views]);
  const rawView = searchParams.get('content');
  const view = viewIds.has(rawView) ? rawView : 'events';

  const setView = useCallback(
    (nextView) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (CURATION_VIEWS.has(view) !== CURATION_VIEWS.has(nextView)) {
            TAB_PARAMS.forEach((key) => next.delete(key));
          }
          if (nextView === 'events') next.delete('content');
          else next.set('content', nextView);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, view],
  );

  const nav = (
    <PivotTenantViewTabs views={views} value={view} onChange={setView} ariaLabel="Content view" />
  );

  if (view === 'organizers') {
    return (
      <PivotTenantCatalogPage
        tenantKey={tenantKey}
        cityDisplayName={cityDisplayName}
        title="Content"
        nav={nav}
      />
    );
  }
  if (view === 'locations') {
    return (
      <PivotTenantLocationMigrationPage
        tenantKey={tenantKey}
        cityDisplayName={cityDisplayName}
        onTenantUpdated={onTenantUpdated}
        title="Content"
        nav={nav}
      />
    );
  }
  return (
    <PivotTenantCurationPage
      tenantKey={tenantKey}
      cityDisplayName={cityDisplayName}
      view={view}
      title="Content"
      nav={nav}
    />
  );
}

export default PivotTenantContentPage;
