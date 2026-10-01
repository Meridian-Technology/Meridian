import React, { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PivotTenantPage from './PivotTenantPage';
import PivotTenantViewTabs from './PivotTenantViewTabs';
import PivotGrowthOverview from './PivotGrowthOverview';
import PivotFleetLaunchPanel from './PivotFleetLaunchPanel';
import PivotWeeklyReportButton from './PivotWeeklyReportButton';
import { toUtcMonth } from './PivotAnalyticsMonthPicker';
import PivotAcquisitionFunnel, {
  PivotAcquisitionControls,
  usePivotAcquisition,
} from './PivotAcquisitionFunnel';
import './PivotTenantGrowthPage.scss';
import './PivotTenantPage.scss';

/*
 * Same `growth` URL param and view ids as the city Growth page, so the city
 * switcher can keep the view. Waitlist and QR codes are per-city only.
 */
export const FLEET_GROWTH_VIEWS = Object.freeze([
  { id: 'overview', label: 'Overview' },
  { id: 'landing', label: 'Landing' },
  { id: 'acquisition', label: 'Acquisition' },
]);
const VIEW_IDS = new Set(FLEET_GROWTH_VIEWS.map((view) => view.id));

/**
 * All-cities Growth: the investor overview across every Pivot city, the fleet
 * landing funnel with per-city rows, and the monthly acquisition funnel.
 * Replaces the fleet Launch (page 2) and Analytics (page 4) panels.
 */
function PivotFleetGrowthPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawView = searchParams.get('growth');
  const view = VIEW_IDS.has(rawView) ? rawView : 'overview';
  const setView = useCallback(
    (nextView) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (nextView === 'overview') next.delete('growth');
          else next.set('growth', nextView);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const refetchOverviewRef = useRef(null);
  const refetchLandingRef = useRef(null);
  const [month, setMonth] = useState(() => toUtcMonth());
  const acquisition = usePivotAcquisition({
    tenantKey: '',
    month,
    setMonth,
    enabled: view === 'acquisition',
  });

  const refreshView = () => {
    const ref = view === 'landing' ? refetchLandingRef : refetchOverviewRef;
    ref.current?.();
  };

  return (
    <PivotTenantPage
      title="Growth"
      tenantKey=""
      cityDisplayName="All cities"
      className="pivot-tenant-launch pivot-fleet-launch"
      actions={
        <>
          <PivotWeeklyReportButton />
          {view === 'acquisition' ? (
            <PivotAcquisitionControls acquisition={acquisition} onMonthChange={setMonth} />
          ) : (
            <button type="button" className="linear-btn linear-btn--secondary" onClick={refreshView}>
              Refresh
            </button>
          )}
        </>
      }
    >
      <PivotTenantViewTabs
        views={FLEET_GROWTH_VIEWS}
        value={view}
        onChange={setView}
        ariaLabel="Growth view"
      />

      {view === 'overview' ? <PivotGrowthOverview refetchRef={refetchOverviewRef} /> : null}
      {view === 'landing' ? <PivotFleetLaunchPanel refetchRef={refetchLandingRef} /> : null}
      {view === 'acquisition' ? <PivotAcquisitionFunnel acquisition={acquisition} /> : null}
    </PivotTenantPage>
  );
}

export default PivotFleetGrowthPage;
