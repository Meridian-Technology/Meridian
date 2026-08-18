import React, { useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { Link } from 'react-router-dom';
import PivotScrapbookTitle from '../../components/PivotBranding/PivotScrapbookTitle';
import { getCurrentTenantDisplayName, getCurrentTenantKey } from '../../config/tenantRedirect';
import { useFetch } from '../../hooks/useFetch';
import useAuth from '../../hooks/useAuth';
import JustGoCreatorGate from './JustGoCreatorGate';
import { buildDemoListingsResponse, useCreatorDemoMode } from './demo';
import justGoCreatorCopy from './justGoCreatorCopy';
import {
  CREATOR_LIST_FILTERS,
  countListingsByStatus,
  describeIngestStatus,
  formatListingWhen,
} from './justGoCreatorListings';
import {
  JUSTGO_CREATOR_API_PREFIX,
  JUSTGO_CREATOR_ROUTES,
  justGoCreatorEventPath,
} from './justGoCreatorRoutes';
import './JustGoCreatorHome.scss';

const LISTINGS_URL = `${JUSTGO_CREATOR_API_PREFIX}/events`;
const SKELETON_ROWS = 3;

function ListingRow({ event }) {
  const copy = justGoCreatorCopy.home;
  const status = describeIngestStatus(event.ingestStatus);
  const when = formatListingWhen(event.start_time);
  const interested = event.intentStats?.interested ?? 0;

  return (
    <li className="jg-listings__row">
      <Link
        className="jg-listings__row-link"
        to={justGoCreatorEventPath(event._id)}
        aria-label={`${copy.openListing}: ${event.name}`}
      >
        <div className="jg-listings__row-main">
          <div className="jg-listings__row-heading">
            <h2 className="jg-listings__row-name">{event.name}</h2>
            <span
              className={`jg-status jg-status--${status.tone}`}
              title={status.help || undefined}
            >
              {status.label}
            </span>
            {event.readOnly ? (
              <span className="jg-status jg-status--unknown">{copy.claimedLabel}</span>
            ) : null}
          </div>

          <p className="jg-listings__row-meta">
            {[when, event.location].filter(Boolean).join(' · ')}
          </p>
        </div>

        <div className="jg-listings__row-side">
          {/* Compact token to scan a column of weeks; the full week stays available to screen
              readers and on hover, since the number alone is ambiguous out of context. */}
          <span
            className={`jg-listings__week${event.batchWeek ? '' : ' jg-listings__week--none'}`}
            title={event.batchWeek ? `${copy.weekLabel} ${event.batchWeek}` : copy.weekUnassigned}
          >
            <span className="jg-visually-hidden">
              {event.batchWeek ? `${copy.weekLabel} ${event.batchWeek}` : copy.weekUnassigned}
            </span>
            <span aria-hidden="true">
              {event.batchWeek ? `W${event.batchWeek.slice(-2)}` : 'W—'}
            </span>
          </span>
          <span className="jg-listings__count">
            <strong>{interested}</strong> {copy.interestedLabel}
          </span>
          <Icon className="jg-listings__row-chevron" icon="mdi:chevron-right" />
        </div>
      </Link>
    </li>
  );
}

/** Creator home — own host-created listings for the current city. */
function JustGoCreatorHome() {
  const copy = justGoCreatorCopy.home;
  const { user } = useAuth();
  const [activeFilter, setActiveFilter] = useState('all');

  const { active: demoActive } = useCreatorDemoMode();

  // Demo mode short-circuits before the request, so no grant is needed and nothing hits the network.
  const fetched = useFetch(demoActive ? null : LISTINGS_URL);
  const demoResponse = useMemo(
    () => (demoActive ? buildDemoListingsResponse() : null),
    [demoActive],
  );
  const { data, loading, error, errorCode, errorStatus, refetch } = demoActive
    ? { data: demoResponse, loading: false, error: null, errorCode: null, errorStatus: null, refetch: () => {} }
    : fetched;

  const events = useMemo(() => data?.data?.events ?? [], [data]);
  const claimedOrganizerCount = data?.data?.claimedOrganizerCount ?? 0;
  const counts = useMemo(() => countListingsByStatus(events), [events]);

  const visibleEvents = useMemo(() => {
    const filter = CREATOR_LIST_FILTERS.find((entry) => entry.id === activeFilter);
    if (!filter?.ingestStatus) return events;
    return events.filter((event) => event.ingestStatus === filter.ingestStatus);
  }, [events, activeFilter]);

  const cityLabel = useMemo(() => {
    const displayName = getCurrentTenantDisplayName();
    return (
      (displayName && displayName !== 'Institution' ? displayName : null) || getCurrentTenantKey() || null
    );
  }, []);

  if (errorStatus === 403) {
    return (
      <JustGoCreatorGate
        code={errorCode}
        city={cityLabel}
        signedInAs={user?.email || user?.name || null}
      />
    );
  }

  // Primary "New listing" CTA lives in the sticky shell nav — not repeated here.
  const header = (
    <header className="jg-listings__head">
      <h1 className="justgo-creator__page-title">{copy.title}</h1>
      <p className="justgo-creator__page-subtitle">{copy.subtitle}</p>
    </header>
  );

  if (loading) {
    return (
      <section className="jg-listings">
        {header}
        <ul className="jg-listings__rows" aria-busy="true" aria-label={copy.loading}>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <li key={index} className="jg-listings__row jg-listings__row--skeleton" />
          ))}
        </ul>
      </section>
    );
  }

  if (error) {
    return (
      <section className="jg-listings">
        {header}
        <div className="justgo-creator__panel">
          <h2 className="justgo-creator__panel-title">{copy.errorTitle}</h2>
          <p className="justgo-creator__panel-body">{copy.errorBody}</p>
          <button type="button" className="justgo-creator__cta" onClick={() => refetch()}>
            <Icon icon="mdi:refresh" />
            {copy.errorRetry}
          </button>
        </div>
      </section>
    );
  }

  // Flare register: first-run empty state, before any filtering exists to explain.
  // Claimed catalog with no events is not a blank start — don't lead with "create your first".
  if (events.length === 0) {
    const claimedEmpty = claimedOrganizerCount > 0;
    return (
      <section className="jg-listings">
        {header}
        <div className="jg-listings__empty">
          <PivotScrapbookTitle
            title={claimedEmpty ? copy.claimedEmptyTitle : copy.emptyTitle}
            as="h2"
          />
          <p className="jg-listings__empty-body">
            {claimedEmpty ? copy.claimedEmptyBody : copy.emptyBody}
          </p>
          {claimedEmpty ? null : (
            <Link className="justgo-creator__cta" to={JUSTGO_CREATOR_ROUTES.newListing}>
              <Icon icon="mdi:plus" />
              {copy.emptyCta}
            </Link>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="jg-listings">
      {header}

      <div className="jg-listings__filters" role="group" aria-label={justGoCreatorCopy.filters.label}>
        {CREATOR_LIST_FILTERS.map((filter) => {
          const count = counts[filter.id] ?? 0;
          const isActive = activeFilter === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              className={`jg-chip${isActive ? ' jg-chip--active' : ''}`}
              aria-pressed={isActive}
              onClick={() => setActiveFilter(filter.id)}
            >
              <span>{filter.label}</span>
              <span className="jg-chip__count">{count}</span>
            </button>
          );
        })}
      </div>

      {visibleEvents.length === 0 ? (
        <div className="justgo-creator__panel">
          <h2 className="justgo-creator__panel-title">{copy.filteredEmptyTitle}</h2>
          <p className="justgo-creator__panel-body">{copy.filteredEmptyBody}</p>
          <button
            type="button"
            className="justgo-creator__cta"
            onClick={() => setActiveFilter('all')}
          >
            {copy.filteredEmptyCta}
          </button>
        </div>
      ) : (
        <ul className="jg-listings__rows">
          {visibleEvents.map((event) => (
            <ListingRow key={event._id} event={event} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default JustGoCreatorHome;
