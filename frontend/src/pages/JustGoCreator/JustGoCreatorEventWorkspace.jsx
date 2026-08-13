import React, { useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { Link, useParams } from 'react-router-dom';
import { getCurrentTenantDisplayName, getCurrentTenantKey } from '../../config/tenantRedirect';
import useAuth from '../../hooks/useAuth';
import { useFetch } from '../../hooks/useFetch';
import JustGoCreatorGate from './JustGoCreatorGate';
import JustGoCreatorListingForm from './JustGoCreatorListingForm';
import { DEMO_CAPABLE, buildDemoListingResponse, isDemoEventId } from './demo';
import justGoCreatorCopy from './justGoCreatorCopy';
import { JUSTGO_CREATOR_API_PREFIX, JUSTGO_CREATOR_ROUTES } from './justGoCreatorRoutes';
import WorkspaceComingSoon from './workspace/WorkspaceComingSoon';
import WorkspaceHeader from './workspace/WorkspaceHeader';
import WorkspaceInsightsTab from './workspace/WorkspaceInsightsTab';
import WorkspaceInterestsTab from './workspace/WorkspaceInterestsTab';
import WorkspaceOverviewTab from './workspace/WorkspaceOverviewTab';
import WorkspacePhaseRail from './workspace/WorkspacePhaseRail';
import WorkspacePromoTab from './workspace/WorkspacePromoTab';
import {
  WORKSPACE_TAB_IDS,
  inferCreatorPhase,
  resolveWorkspaceNav,
} from './workspace/workspaceUtils';
import './workspace/workspace.scss';

/** Scroll distance before the header collapses, matching the ported dashboard's feel. */
const HEADER_CONDENSE_SCROLL = 56;

/**
 * Event workspace — port of `EventDashboardFocused` onto the creator APIs.
 *
 * Composition is preserved: condensed header, a phase-filtered sidebar of grouped nav sections, and
 * keep-alive tab panels in a scrolling main region. What changed is the data and the authority — every
 * read is `GET /pivot/creator/events/:eventId` (never `/org-event-management/...`), the phase comes
 * from `ingestStatus` instead of campus approval state, and there are no publish, cancel, or delete
 * actions because no creator API grants them.
 */
function JustGoCreatorEventWorkspace() {
  const { eventId } = useParams();
  const copy = justGoCreatorCopy.workspace;
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState(WORKSPACE_TAB_IDS.OVERVIEW);
  const [headerCondensed, setHeaderCondensed] = useState(false);
  const contentRef = useRef(null);

  // A demo id resolves from fixtures whether or not the toggle is on, so the URL alone is shareable.
  const demoEvent = DEMO_CAPABLE && isDemoEventId(eventId);
  const fetched = useFetch(
    eventId && !demoEvent ? `${JUSTGO_CREATOR_API_PREFIX}/events/${eventId}` : null,
  );
  const demoResponse = useMemo(
    () => (demoEvent ? buildDemoListingResponse(eventId) : null),
    [demoEvent, eventId],
  );
  const { data, loading, error, errorCode, errorStatus, refetch } = demoEvent
    ? { data: demoResponse, loading: false, error: null, errorCode: null, errorStatus: null, refetch: () => {} }
    : fetched;

  const event = data?.data?.event;
  const stats = data?.data?.stats;
  const phase = useMemo(() => inferCreatorPhase(event), [event]);
  const { sections, visibleTabs } = useMemo(() => resolveWorkspaceNav(phase), [phase]);

  // A tab can vanish when the phase changes (Promo leaves Post Mortem), so fall back like the original.
  const effectiveTab = visibleTabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : visibleTabs[0]?.id;

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setHeaderCondensed(false);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  };

  const handleContentScroll = (scrollEvent) => {
    setHeaderCondensed(scrollEvent.currentTarget.scrollTop > HEADER_CONDENSE_SCROLL);
  };

  if (errorStatus === 403 && errorCode !== 'CREATOR_NOT_OWNER') {
    const displayName = getCurrentTenantDisplayName();
    return (
      <JustGoCreatorGate
        code={errorCode}
        city={
          (displayName && displayName !== 'Institution' ? displayName : null) ||
          getCurrentTenantKey() ||
          null
        }
        signedInAs={user?.email || user?.name || null}
      />
    );
  }

  const backLink = (
    <p className="justgo-creator__back">
      <Link className="justgo-creator__text-link" to={JUSTGO_CREATOR_ROUTES.home}>
        {copy.backToList}
      </Link>
    </p>
  );

  if (loading) {
    return (
      <section aria-busy="true">
        <p className="justgo-creator__page-subtitle">{copy.loading}</p>
      </section>
    );
  }

  if (error || !event) {
    const notFound = !error || errorStatus === 404 || errorStatus === 403;
    return (
      <section>
        <div className="justgo-creator__panel">
          <h1 className="justgo-creator__panel-title">
            {notFound ? copy.notFoundTitle : copy.errorTitle}
          </h1>
          <p className="justgo-creator__panel-body">
            {notFound ? copy.notFoundBody : copy.errorBody}
          </p>
          {notFound ? null : (
            <button type="button" className="justgo-creator__cta" onClick={() => refetch()}>
              <Icon icon="mdi:refresh" />
              {copy.errorRetry}
            </button>
          )}
        </div>
        {backLink}
      </section>
    );
  }

  const goToDetails = () => handleTabChange(WORKSPACE_TAB_IDS.DETAILS);

  const tabContent = {
    [WORKSPACE_TAB_IDS.OVERVIEW]: <WorkspaceOverviewTab event={event} stats={stats} />,
    [WORKSPACE_TAB_IDS.DETAILS]: (
      <div className="jg-workspace-tab">
        <JustGoCreatorListingForm
          mode="edit"
          event={event}
          onSaved={() => refetch({ silent: true })}
          saveDisabledReason={
            demoEvent ? 'Demo data — this listing has no server record, so edits are not saved.' : undefined
          }
        />
      </div>
    ),
    [WORKSPACE_TAB_IDS.INSIGHTS]: <WorkspaceInsightsTab event={event} stats={stats} />,
    [WORKSPACE_TAB_IDS.INTERESTS]: <WorkspaceInterestsTab event={event} stats={stats} />,
    [WORKSPACE_TAB_IDS.COMMUNICATIONS]: (
      <WorkspaceComingSoon
        title={copy.comingSoon.communicationsTitle}
        body={copy.comingSoon.communicationsBody}
      />
    ),
    [WORKSPACE_TAB_IDS.PROMO]: <WorkspacePromoTab event={event} />,
  };

  return (
    <div className="jg-workspace">
      <WorkspaceHeader
        event={event}
        stats={stats}
        condensed={effectiveTab !== WORKSPACE_TAB_IDS.OVERVIEW || headerCondensed}
        onRefresh={() => refetch()}
        onUpdateListing={goToDetails}
      />

      <div className="jg-workspace__body">
        <aside className="jg-workspace__sidebar">
          <WorkspacePhaseRail phase={phase} />
          <nav className="jg-workspace__nav" aria-label={copy.navLabel}>
            {sections.map((section) => (
              <div key={section.id} className="jg-workspace__nav-section">
                <p className="jg-workspace__nav-section-title">{section.label}</p>
                <div className="jg-workspace__nav-section-items">
                  {section.tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`jg-workspace__nav-item${effectiveTab === tab.id ? ' is-active' : ''}`}
                      aria-current={effectiveTab === tab.id ? 'page' : undefined}
                      onClick={() => handleTabChange(tab.id)}
                    >
                      <Icon icon={tab.icon} />
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <section className="jg-workspace__main">
          <div
            className="jg-workspace__content"
            ref={contentRef}
            onScroll={handleContentScroll}
          >
            {visibleTabs.map((tab) => (
              <div
                key={tab.id}
                className={`jg-workspace__tab-panel${effectiveTab === tab.id ? ' is-active' : ''}`}
                style={{ display: effectiveTab === tab.id ? 'block' : 'none' }}
              >
                {tabContent[tab.id]}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default JustGoCreatorEventWorkspace;
