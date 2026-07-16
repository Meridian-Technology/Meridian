import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFetch } from '../../../hooks/useFetch';
import IphoneDeviceFrame from '../../../components/IphoneDeviceFrame';
import PivotExploreCompactRow from './PivotExploreCompactRow';
import {
  buildExploreFilterChips,
  buildExploreRailSections,
  exploreChipToFetchParams,
  shouldShowExploreRails,
} from './pivotExplorePreviewUtils';
import './PivotBatchExplorePreview.scss';

const NO_FETCH_CACHE = { enabled: false };
const SEARCH_DEBOUNCE_MS = 320;
const EXPLORE_PREVIEW_LIMIT = 100;

function ExploreChip({
  label,
  selected,
  onClick,
}) {
  return (
    <button
      type="button"
      className={`pivot-explore-preview__chip${selected ? ' pivot-explore-preview__chip--selected' : ''}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/**
 * Mobile-faithful Explore tab preview for a tenant batch week (platform admin).
 */
function PivotBatchExplorePreview({
  tenantKey,
  batchWeek,
  cityDisplayName,
  weekRangeLabel,
  layout = 'inline',
}) {
  const [activeChip, setActiveChip] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [exploreSort, setExploreSort] = useState('for_you');
  const [showPassed, setShowPassed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setActiveChip('all');
    setSearchInput('');
    setSearchQuery('');
    setExploreSort('for_you');
    setShowPassed(false);
  }, [batchWeek, tenantKey]);

  const fetchParams = useMemo(
    () => ({
      batchWeek,
      sort: exploreSort,
      limit: String(EXPLORE_PREVIEW_LIMIT),
      ...exploreChipToFetchParams(activeChip, searchQuery, !showPassed),
    }),
    [activeChip, batchWeek, exploreSort, searchQuery, showPassed],
  );

  const exploreUrl =
    tenantKey && batchWeek
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/explore`
      : null;

  const {
    data: exploreResponse,
    loading,
    error: fetchError,
    refetch,
  } = useFetch(exploreUrl, { params: fetchParams, cache: NO_FETCH_CACHE });

  const exploreData = exploreResponse?.success ? exploreResponse.data : null;
  const events = exploreData?.events ?? [];
  const rails = exploreData?.rails ?? [];
  const chips = useMemo(() => buildExploreFilterChips(rails), [rails]);
  const showRails = shouldShowExploreRails(activeChip, searchQuery);
  const railSections = useMemo(
    () => (showRails ? buildExploreRailSections(events, rails) : []),
    [events, rails, showRails],
  );

  const cityLabel = (cityDisplayName || exploreData?.cityDisplayName || tenantKey || 'city')
    .trim()
    .toLowerCase();
  const eventCount = exploreData?.total ?? null;
  const hiddenPassedCount = exploreData?.hiddenPassedCount ?? 0;
  const showPassedEmpty =
    !showPassed && hiddenPassedCount > 0 && activeChip === 'all' && !searchQuery.trim();

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const errorMessage = fetchError || (!exploreResponse?.success && exploreResponse?.message);

  return (
    <section
      className={`pivot-explore-preview${
        layout === 'panel' ? ' pivot-explore-preview--panel' : ''
      }`}
      aria-labelledby={layout === 'panel' ? undefined : 'pivot-explore-preview-title'}
    >
      {layout !== 'panel' ? (
        <div className="pivot-explore-preview__head">
          <div>
            <h2 id="pivot-explore-preview-title" className="linear-section__title">
              Explore preview
            </h2>
            <p className="pivot-lab__section-hint">
              Published events users see on the Explore tab for{' '}
              <strong>{batchWeek}</strong>
              {weekRangeLabel ? ` (${weekRangeLabel})` : ''}. Ranked without a signed-in user profile.
            </p>
          </div>
          <button
            type="button"
            className="linear-btn linear-btn--ghost"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      ) : (
        <div className="pivot-explore-preview__panel-toolbar">
          <p className="pivot-lab__section-hint">
            Published events on the Explore tab — ranked without a signed-in user profile.
          </p>
          <button
            type="button"
            className="linear-btn linear-btn--ghost"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      )}

      <div className="pivot-explore-preview__layout">
        <IphoneDeviceFrame
          className="pivot-explore-preview__device"
          screenClassName="pivot-explore-preview__screen"
          ariaLabel="Mobile explore preview"
          maxScreenHeight={layout === 'panel' ? 'min(78vh, 760px)' : '720px'}
          statusBarTheme="light"
        >
          <div className="pivot-explore-preview__screen-body">
            <div className="pivot-explore-preview__scroll">
              <header className="pivot-explore-preview__hero-copy">
                <p className="pivot-explore-preview__city-chip">this week in {cityLabel}</p>
                {eventCount != null ? (
                  <p className="pivot-explore-preview__count">
                    {eventCount} {eventCount === 1 ? 'event' : 'events'}
                  </p>
                ) : null}
              </header>

              <label className="pivot-explore-preview__search">
                <span className="pivot-explore-preview__search-label">search</span>
                <input
                  className="pivot-explore-preview__search-input"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="search events or hosts"
                  autoComplete="off"
                />
              </label>

              <div className="pivot-explore-preview__sort-row" role="group" aria-label="Sort">
                <ExploreChip
                  label="for you"
                  selected={exploreSort === 'for_you'}
                  onClick={() => setExploreSort('for_you')}
                />
                <ExploreChip
                  label="soonest"
                  selected={exploreSort === 'soonest'}
                  onClick={() => setExploreSort('soonest')}
                />
              </div>

              <div className="pivot-explore-preview__chips-scroll">
                <div className="pivot-explore-preview__chips-row">
                  {chips.map((chip) => (
                    <ExploreChip
                      key={chip.id}
                      label={chip.label}
                      selected={activeChip === chip.id}
                      onClick={() => setActiveChip(chip.id)}
                    />
                  ))}
                </div>
              </div>

              {loading && !exploreData ? (
                <p className="pivot-explore-preview__status">loading this week&apos;s events</p>
              ) : null}

              {errorMessage ? (
                <p className="pivot-explore-preview__status pivot-explore-preview__status--error">
                  {errorMessage}
                </p>
              ) : null}

              {!loading && !errorMessage && showRails && railSections.length > 0 ? (
                <div className="pivot-explore-preview__rails">
                  {railSections.map((section) => (
                    <div key={section.id} className="pivot-explore-preview__rail">
                      <h3 className="pivot-explore-preview__rail-title">{section.title}</h3>
                      <div className="pivot-explore-preview__rail-track">
                        {section.events.map((event) => (
                          <div key={event._id} className="pivot-explore-preview__rail-card">
                            <PivotExploreCompactRow event={event} compact />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {showRails && railSections.length > 0 && events.length > 0 ? (
                <h3 className="pivot-explore-preview__list-title">all events</h3>
              ) : null}

              <button
                type="button"
                className={`pivot-explore-preview__passed-toggle${
                  showPassed ? ' pivot-explore-preview__passed-toggle--selected' : ''
                }`}
                aria-pressed={showPassed}
                onClick={() => setShowPassed((current) => !current)}
              >
                {showPassed ? 'hide passed' : 'show passed'}
              </button>

              {!loading && !errorMessage ? (
                events.length ? (
                  <div className="pivot-explore-preview__list">
                    {events.map((event) => (
                      <PivotExploreCompactRow key={event._id} event={event} />
                    ))}
                  </div>
                ) : (
                  <div className="pivot-explore-preview__empty">
                    <p className="pivot-explore-preview__empty-title">
                      {showPassedEmpty ? 'you passed these' : 'nothing matches'}
                    </p>
                    <p className="pivot-explore-preview__empty-body">
                      {showPassedEmpty
                        ? 'deck passes hide events here by default — show passed to browse them again'
                        : 'clear filters or try another tag'}
                    </p>
                    {showPassedEmpty ? (
                      <button
                        type="button"
                        className="pivot-explore-preview__empty-action"
                        onClick={() => setShowPassed(true)}
                      >
                        show passed
                      </button>
                    ) : activeChip !== 'all' || searchQuery ? (
                      <button
                        type="button"
                        className="pivot-explore-preview__empty-action"
                        onClick={() => {
                          setActiveChip('all');
                          setSearchInput('');
                          setSearchQuery('');
                        }}
                      >
                        clear filters
                      </button>
                    ) : null}
                  </div>
                )
              ) : null}
            </div>

            <nav className="pivot-explore-preview__tab-bar" aria-hidden="true">
              <span>week</span>
              <span className="pivot-explore-preview__tab-bar-active">explore</span>
              <span>you</span>
            </nav>
          </div>
        </IphoneDeviceFrame>

        <aside className="pivot-explore-preview__meta">
          <dl>
            <div>
              <dt>Batch</dt>
              <dd>{batchWeek}</dd>
            </div>
            <div>
              <dt>Catalog (published + upcoming)</dt>
              <dd>{exploreData?.catalogTotal ?? '—'}</dd>
            </div>
            <div>
              <dt>Visible in explore</dt>
              <dd>{exploreData?.total ?? '—'}</dd>
            </div>
            <div>
              <dt>Hidden (passed)</dt>
              <dd>{hiddenPassedCount || 0}</dd>
            </div>
            <div>
              <dt>Sort</dt>
              <dd>{exploreSort.replace('_', ' ')}</dd>
            </div>
          </dl>
          <p className="pivot-explore-preview__meta-note">
            Only <strong>published</strong> events with a host and upcoming start time appear here —
            same rules as the app feed.
          </p>
        </aside>
      </div>
    </section>
  );
}

export default PivotBatchExplorePreview;
