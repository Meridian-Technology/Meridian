import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../hooks/useFetch';
import {
  PivotOpsAreaFunnel,
  PivotOpsCard,
  PivotOpsFunnel,
  PivotOpsMetric,
  PivotOpsMetricGrid,
} from '../../../components/PivotOps';
import PivotTenantPage from './PivotTenantPage';
import PivotAnalyticsMonthPicker, {
  isValidUtcMonth,
  shiftUtcMonth,
  toUtcMonth,
} from './PivotAnalyticsMonthPicker';
import usePivotTenantWeekKeybinds from './usePivotTenantWeekKeybinds';
import KeybindTooltip from '../../../components/Interface/KeybindTooltip/KeybindTooltip';
import { formatRate } from './pivotOverviewFormat';
import '../PivotLab/PivotLabPage.scss';
import './PivotTenantDashboard.scss';
import './PivotTenantAnalyticsPage.scss';
import './PivotTenantPage.scss';

const NO_FETCH_CACHE = { enabled: false };

/** Counting notes — shown from the info affordance, not a page banner. */
export const FUNNEL_COUNTING_NOTES = `UTC month [start, end).
Uniques per stage. Not a closed identity funnel: landing visitors are not joined to app users, so a later step can be larger than the one before it.
deck = first-ever swipe per actor (min ts of pivot_card_view | pass | interested), attributed to that month.
app open = unique actors with a Just Go app event in-window. session_start is not written.`;

export { shiftUtcMonth, toUtcMonth };

function FunnelNotesButton() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={`pivot-tenant-analytics__notes${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="pivot-tenant-analytics__notes-btn"
        aria-label="How counts are defined"
        aria-expanded={open}
        aria-controls="pivot-analytics-funnel-notes"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon icon="mdi:information-outline" aria-hidden="true" />
      </button>
      {open ? (
        <pre id="pivot-analytics-funnel-notes" className="pivot-tenant-analytics__notes-panel" role="note">
          {FUNNEL_COUNTING_NOTES}
        </pre>
      ) : null}
    </div>
  );
}

function payload(response) {
  if (!response?.success || !response.data) return null;
  return response.data;
}

function PivotTenantAnalyticsPage({
  tenantKey,
  cityDisplayName,
  scope = 'city',
}) {
  const isFleet = scope === 'fleet' || !tenantKey;
  const [month, setMonth] = useState(() => toUtcMonth());
  const monthValid = isValidUtcMonth(month);
  const params = useMemo(() => ({ month }), [month]);
  const funnelUrl = !monthValid
    ? null
    : isFleet
      ? '/admin/pivot/analytics/acquisition'
      : `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/analytics/acquisition`;

  const {
    data: funnelResponse,
    loading,
    error,
    refetch,
  } = useFetch(funnelUrl, {
    params,
    cache: NO_FETCH_CACHE,
  });

  const stepMonth = useCallback((delta) => {
    setMonth((current) => shiftUtcMonth(current, delta));
  }, []);

  const { keyboardNavActive } = usePivotTenantWeekKeybinds({
    enabled: monthValid,
    onStepWeek: stepMonth,
    onRefresh: refetch,
  });

  const data = payload(funnelResponse);
  const stages = data?.stages || [];
  const funnelStages = useMemo(
    () =>
      stages.map((stage) => ({
        key: stage.key,
        label: stage.label,
        hint: stage.hint,
        value: stage.unique ?? 0,
      })),
    [stages],
  );

  return (
    <PivotTenantPage
      title="Analytics"
      tenantKey={isFleet ? '' : tenantKey}
      cityDisplayName={isFleet ? 'All cities' : cityDisplayName}
      className="pivot-tenant-analytics"
      actions={
        <>
          <PivotAnalyticsMonthPicker
            month={month}
            onChange={setMonth}
            keyboardNavActive={keyboardNavActive}
            pending={loading && Boolean(data)}
          />
          <button
            type="button"
            className="linear-btn linear-btn--secondary pivot-tenant-kbd-btn"
            onClick={() => refetch()}
            disabled={!funnelUrl || loading}
          >
            Refresh
            <KeybindTooltip label="Refresh" keybind="R" />
          </button>
        </>
      }
    >
      {!monthValid ? (
        <p className="pivot-lab__error" role="alert">
          Month must be YYYY-MM.
        </p>
      ) : null}

      {error ? (
        <p className="pivot-lab__error" role="alert">
          {typeof error === 'string' ? error : 'Unable to load acquisition funnel.'}
        </p>
      ) : null}

      {loading && !data ? (
        <p className="pivot-lab__empty">Loading acquisition funnel…</p>
      ) : null}

      {data ? (
        <>
          <div className="pivot-tenant-analytics__range-row">
            <p className="pivot-tenant-analytics__range">
              {data.range?.label || month}
              {data.overall?.rate != null
                ? ` · landing → deck ${formatRate(data.overall.rate)}`
                : ''}
            </p>
            <FunnelNotesButton />
          </div>

          <PivotOpsMetricGrid className="pivot-tenant-analytics__metrics">
            {stages.map((stage) => (
              <PivotOpsMetric
                key={stage.key}
                label={stage.label}
                value={stage.unique ?? 0}
                hint={
                  stage.conversionFromPrev != null
                    ? `${formatRate(stage.conversionFromPrev)} of previous · ${stage.events ?? 0} events`
                    : `${stage.events ?? 0} events`
                }
              />
            ))}
          </PivotOpsMetricGrid>

          <div className="pivot-tenant-analytics__funnel-grid">
            <PivotOpsCard className="pivot-tenant-analytics__panel pivot-tenant-analytics__panel--funnel">
              <h2 className="pivot-ops-section__title">Acquisition</h2>
              <p className="pivot-ops-section__description">
                Unique counts by step this month. Deck is first swipe only.
              </p>
              <div className="pivot-tenant-analytics__funnel-wrap">
                <PivotOpsAreaFunnel
                  stages={funnelStages}
                  ariaLabel="Acquisition volume funnel"
                  fill
                />
              </div>
            </PivotOpsCard>

            <PivotOpsCard className="pivot-tenant-analytics__panel">
              <h2 className="pivot-ops-section__title">Step drop-off</h2>
              <p className="pivot-ops-section__description">
                Conversion from the previous step
              </p>
              <PivotOpsFunnel
                stages={funnelStages}
                ariaLabel="Acquisition step drop-off"
              />
            </PivotOpsCard>
          </div>
        </>
      ) : null}
    </PivotTenantPage>
  );
}

export default PivotTenantAnalyticsPage;
