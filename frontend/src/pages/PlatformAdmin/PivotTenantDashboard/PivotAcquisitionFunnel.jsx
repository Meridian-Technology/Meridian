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
import PivotAnalyticsMonthPicker, {
  isValidUtcMonth,
  shiftUtcMonth,
} from './PivotAnalyticsMonthPicker';
import usePivotTenantWeekKeybinds from './usePivotTenantWeekKeybinds';
import KeybindTooltip from '../../../components/Interface/KeybindTooltip/KeybindTooltip';
import { formatRate } from './pivotOverviewFormat';
import '../PivotLab/PivotLabPage.scss';
import './PivotAcquisitionFunnel.scss';

const NO_FETCH_CACHE = { enabled: false };

/** Counting notes — shown from the info affordance, not a page banner. */
export const FUNNEL_COUNTING_NOTES = `UTC month [start, end).
Uniques per stage. Not a closed identity funnel: landing visitors are not joined to app users, so a later step can be larger than the one before it.
deck = first-ever pass or interested decision per actor, attributed to that month.
app activity = unique actors with a production Just Go app event in-window. It is not a verified install count.`;

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

/**
 * Monthly acquisition funnel data for one city, or every city when
 * `tenantKey` is empty. ← / → step the month and R refreshes while `enabled`.
 */
export function usePivotAcquisition({ tenantKey, month, setMonth, enabled = true }) {
  const monthValid = isValidUtcMonth(month);
  const params = useMemo(() => ({ month }), [month]);
  const url = !enabled || !monthValid
    ? null
    : tenantKey
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/analytics/acquisition`
      : '/admin/pivot/analytics/acquisition';

  const { data: response, loading, error, refetch } = useFetch(url, {
    params,
    cache: NO_FETCH_CACHE,
  });

  const stepMonth = useCallback((delta) => {
    setMonth((current) => shiftUtcMonth(current, delta));
  }, [setMonth]);

  const { keyboardNavActive } = usePivotTenantWeekKeybinds({
    enabled: enabled && monthValid,
    onStepWeek: stepMonth,
    onRefresh: refetch,
  });

  return {
    url,
    month,
    monthValid,
    data: payload(response),
    loading,
    error,
    refetch,
    keyboardNavActive,
  };
}

/** Month picker and Refresh for a page header. */
export function PivotAcquisitionControls({ acquisition, onMonthChange }) {
  const { url, month, data, loading, refetch, keyboardNavActive } = acquisition;
  return (
    <>
      <PivotAnalyticsMonthPicker
        month={month}
        onChange={onMonthChange}
        keyboardNavActive={keyboardNavActive}
        pending={loading && Boolean(data)}
      />
      <button
        type="button"
        className="linear-btn linear-btn--secondary pivot-tenant-kbd-btn"
        onClick={() => refetch()}
        disabled={!url || loading}
      >
        Refresh
        <KeybindTooltip label="Refresh" keybind="R" />
      </button>
    </>
  );
}

/** Stage metrics, acquisition area funnel, and step drop-off for one month. */
function PivotAcquisitionFunnel({ acquisition }) {
  const { month, monthValid, data, loading, error } = acquisition;
  const stages = useMemo(() => data?.stages || [], [data?.stages]);
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
    <>
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
          <p className="pivot-tenant-analytics__range">
            {data.range?.label || month}
            {data.overall?.rate != null
              ? ` · landing → deck ${formatRate(data.overall.rate)}`
              : ''}
          </p>

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
              <div className="pivot-tenant-analytics__panel-head">
                <h2 className="pivot-ops-section__title">Acquisition</h2>
                <FunnelNotesButton />
              </div>
              <p className="pivot-ops-section__description">
                Unique counts by step this month. Deck is first decision only.
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
    </>
  );
}

export default PivotAcquisitionFunnel;
