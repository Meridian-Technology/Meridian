import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import {
  PivotOpsAreaFunnel,
  PivotOpsCard,
  PivotOpsMetric,
  PivotOpsMetricGrid,
  PivotOpsSection,
} from '../../../components/PivotOps';
import {
  toIsoWeek,
  isValidIsoWeek,
  shiftIsoWeek,
} from '../../../utils/pivotIsoWeek';
import PivotTenantPage from './PivotTenantPage';
import PivotBatchWeekPicker from './PivotBatchWeekPicker';
import PivotAudienceUserInspector, { AUDIENCE_USER_PANES } from './PivotAudienceUserInspector';
import PivotDeckRulesPanel from './PivotDeckRulesPanel';
import PivotTenantViewTabs from './PivotTenantViewTabs';
import usePivotBatchWeekState from './usePivotBatchWeekState';
import usePivotTenantWeekKeybinds from './usePivotTenantWeekKeybinds';
import { PIVOT_TENANT_PAGES } from './pivotTenantPageRoutes';
import KeybindTooltip from '../../../components/Interface/KeybindTooltip/KeybindTooltip';
import '../PivotLab/PivotLabPage.scss';
import './PivotTenantDashboard.scss';
import './PivotTenantAudiencePage.scss';
import './PivotTenantPage.scss';

const NO_FETCH_CACHE = { enabled: false };
const AUDIENCE_PAGE = String(PIVOT_TENANT_PAGES.audience);

/*
 * Audience URL state. Names are page-specific because the dashboard shell
 * carries every query param across nav clicks.
 *   audience = week | users | rules
 *   userId, userPane = replay | ranking | activity
 *   deckWeek = page  (ranking pinned to the page week; absent follows the app week)
 */
export const AUDIENCE_VIEWS = Object.freeze([
  { id: 'week', label: 'Week' },
  { id: 'users', label: 'Users' },
  { id: 'rules', label: 'Deck rules' },
]);
const VIEW_IDS = new Set(AUDIENCE_VIEWS.map((view) => view.id));
const PANE_IDS = new Set(AUDIENCE_USER_PANES.map((pane) => pane.id));

function formatRate(rate) {
  if (rate == null || Number.isNaN(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}

function formatConversionPct(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(1)}%`;
}

/** Analytics closed-funnel steps (pivot_* event names). */
function AnalyticsFunnelSteps({ steps }) {
  if (!steps?.length) return null;
  const max = Math.max(1, ...steps.map((s) => s.count ?? 0));

  return (
    <div className="pivot-tenant-journeys__analytics-funnel" role="list">
      {steps.map((step) => (
        <div
          className="pivot-tenant-journeys__analytics-row"
          key={step.event || step.key}
          role="listitem"
        >
          <div className="pivot-tenant-journeys__analytics-meta">
            <span className="pivot-tenant-journeys__analytics-key">{step.key}</span>
            <code className="linear-code linear-code--inline">{step.event}</code>
          </div>
          <div className="pivot-ops-funnel__track">
            <div
              className="pivot-ops-funnel__bar"
              style={{ width: `${Math.max(2, ((step.count ?? 0) / max) * 100)}%` }}
            />
            <span className="pivot-ops-funnel__value">{step.count ?? 0}</span>
          </div>
          <span className="pivot-tenant-journeys__analytics-conv">
            {formatConversionPct(step.conversionRate)}
            {step.dropOff > 0 ? ` · −${step.dropOff}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Per-tenant Audience: the week's journey funnel, a user inspector (swipe
 * replay, scored deck, activity log, wipe-week), and the city drop-deck rules.
 * Replaces the former User journeys (page 2) and Drop deck (page 3) panels.
 */
function PivotTenantAudiencePage({
  tenantKey,
  cityDisplayName,
  storedDeckOverrides,
  onDeckSaved,
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initializedWeekRef = useRef(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const urlBatchWeek = searchParams.get('batchWeek');
  const selectedUserId = searchParams.get('userId')?.trim() || null;
  const rawView = searchParams.get('audience');
  // Old User journeys links carry only userId; open them on the inspector.
  const view = VIEW_IDS.has(rawView) ? rawView : selectedUserId ? 'users' : 'week';
  const rawPane = searchParams.get('userPane');
  const pane = PANE_IDS.has(rawPane) ? rawPane : 'replay';
  const followAppWeek = searchParams.get('deckWeek') !== 'page';

  const {
    batchWeek,
    committedWeek,
    setBatchWeek,
    batchWeekValid,
    committedWeekValid,
  } = usePivotBatchWeekState(
    isValidIsoWeek(urlBatchWeek) ? urlBatchWeek.trim() : toIsoWeek(),
  );

  const updateParams = useCallback(
    (patch) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(patch).forEach(([key, value]) => {
            if (value == null) next.delete(key);
            else next.set(key, value);
          });
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Bookmark the committed week (preserve page=2).
  useEffect(() => {
    const pageOk = searchParams.get('page') === AUDIENCE_PAGE;
    const weekOk = !committedWeekValid || searchParams.get('batchWeek') === committedWeek;
    if (pageOk && weekOk) return;
    updateParams({
      page: AUDIENCE_PAGE,
      ...(committedWeekValid ? { batchWeek: committedWeek } : {}),
    });
  }, [committedWeek, committedWeekValid, searchParams, updateParams]);

  // Sync from deep links / tenant switch.
  useEffect(() => {
    if (isValidIsoWeek(urlBatchWeek)) {
      const trimmed = urlBatchWeek.trim();
      setBatchWeek((current) => (current === trimmed ? current : trimmed), {
        immediate: true,
      });
    }
  }, [urlBatchWeek, setBatchWeek]);

  const weekScoped = view !== 'rules';
  const opsParams = useMemo(
    () => ({
      batchWeek: committedWeek,
      include: 'journeys',
    }),
    [committedWeek],
  );
  const opsUrl =
    tenantKey && committedWeekValid && weekScoped
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/ops`
      : null;
  const {
    data: opsResponse,
    loading: opsLoading,
    error: opsError,
    refetch: refetchOps,
  } = useFetch(opsUrl, { params: opsParams, cache: NO_FETCH_CACHE });

  const ops = opsResponse?.success ? opsResponse.data : null;
  const dropDayOfWeek = ops?.weekRange?.dropDayOfWeek ?? ops?.dropSchedule?.dayOfWeek ?? 4;
  const dropTimeZone = ops?.weekRange?.timeZone ?? ops?.dropSchedule?.timezone ?? 'UTC';

  useEffect(() => {
    if (initializedWeekRef.current) return;
    if (isValidIsoWeek(urlBatchWeek)) {
      initializedWeekRef.current = true;
      return;
    }
    if (!ops?.anchors?.liveWeek) return;
    initializedWeekRef.current = true;
    setBatchWeek(ops.anchors.liveWeek, { immediate: true });
  }, [ops?.anchors?.liveWeek, urlBatchWeek, setBatchWeek]);

  const overview = ops?.journey && !ops.journey.error ? ops.journey : null;
  const funnel = ops?.funnel && !ops.funnel.error ? ops.funnel : null;

  const overviewLoading = opsLoading;
  const funnelLoading = opsLoading && !funnel;
  const overviewMessage =
    opsError ||
    (opsResponse && !opsResponse.success
      ? opsResponse.message || 'Unable to load journey overview.'
      : null) ||
    (ops?.journey?.error ? ops.journey.error : null);
  const funnelMessage =
    ops?.funnel?.error ||
    (opsResponse && !opsResponse.success && !overviewMessage
      ? opsResponse.message || 'Unable to load funnel.'
      : null);

  const displayCity = overview?.cityDisplayName || cityDisplayName || tenantKey;
  const kpis = overview?.kpis;
  const conversionRates = overview?.conversionRates;
  const intentFunnel = funnel?.intentFunnel || overview?.funnel || [];
  const analyticsSteps = funnel?.steps || [];

  const stepBatchWeek = useCallback(
    (delta) => {
      setBatchWeek((current) => {
        const next = shiftIsoWeek(current, delta);
        return next || current;
      });
    },
    [setBatchWeek],
  );

  const refreshAll = useCallback(() => {
    if (opsUrl) refetchOps();
    setRefreshKey((key) => key + 1);
  }, [opsUrl, refetchOps]);

  const { keyboardNavActive } = usePivotTenantWeekKeybinds({
    enabled: batchWeekValid && weekScoped,
    onStepWeek: stepBatchWeek,
    onRefresh: refreshAll,
  });

  const curationHref = batchWeekValid
    ? `/platform-admin/pivot/${encodeURIComponent(tenantKey)}?page=${PIVOT_TENANT_PAGES.content}&batchWeek=${encodeURIComponent(batchWeek)}`
    : `/platform-admin/pivot/${encodeURIComponent(tenantKey)}?page=${PIVOT_TENANT_PAGES.content}`;

  return (
    <PivotTenantPage
      title="Audience"
      tenantKey={tenantKey}
      cityDisplayName={displayCity}
      className="pivot-tenant-journeys"
      actions={
        weekScoped ? (
          <>
            <PivotBatchWeekPicker
              batchWeek={batchWeek}
              onChange={setBatchWeek}
              keyboardNavActive={keyboardNavActive}
              anchors={ops?.anchors}
              dropDayOfWeek={dropDayOfWeek}
              timeZone={dropTimeZone}
              pending={batchWeek !== committedWeek}
            />
            <button
              type="button"
              className="linear-btn linear-btn--secondary pivot-tenant-kbd-btn"
              onClick={refreshAll}
              disabled={!opsUrl || overviewLoading || funnelLoading}
            >
              Refresh
              <KeybindTooltip label="Refresh" keybind="R" />
            </button>
          </>
        ) : null
      }
    >
      <PivotTenantViewTabs
        views={AUDIENCE_VIEWS}
        value={view}
        onChange={(nextView) => updateParams({ audience: nextView })}
        ariaLabel="Audience view"
      />

      {weekScoped && !batchWeekValid ? (
        <p className="pivot-lab__error" role="alert">
          Batch week must be ISO format YYYY-Www (e.g. {toIsoWeek()}).
        </p>
      ) : null}

      {view === 'week' ? (
        <>
          {overviewMessage && !overview ? (
            <p className="pivot-lab__error" role="alert">
              {typeof overviewMessage === 'string'
                ? overviewMessage
                : 'Unable to load journey overview.'}
            </p>
          ) : null}

          <PivotOpsSection
            title="Week snapshot"
            titleId="pivot-journeys-kpis"
            actions={
              overviewLoading ? (
                <span className="pivot-tenant-journeys__muted">Loading…</span>
              ) : null
            }
          >
            <PivotOpsMetricGrid>
              <PivotOpsMetric
                label="Active users"
                value={kpis?.activeUsers ?? '—'}
                hint="with intents this week"
              />
              <PivotOpsMetric
                label="Median cards seen"
                value={kpis?.medianCardsSeen ?? '—'}
                hint="pivot_card_view"
              />
              <PivotOpsMetric
                label="Swipes"
                value={kpis?.swipeCount ?? '—'}
                hint="pass + interested + going"
              />
              <PivotOpsMetric
                label="Interest rate"
                value={formatRate(conversionRates?.interestRate)}
                hint="right-swipe / swipes"
              />
              <PivotOpsMetric
                label="Ticket open rate"
                value={formatRate(conversionRates?.ticketOpenRate)}
                hint="openers / interested"
              />
              <PivotOpsMetric
                label="Register rate"
                value={formatRate(conversionRates?.registerRate)}
                hint="going / openers"
              />
            </PivotOpsMetricGrid>
          </PivotOpsSection>

          <PivotOpsSection
            title="Funnel"
            titleId="pivot-journeys-funnel"
            actions={
              funnelLoading ? (
                <span className="pivot-tenant-journeys__muted">Loading…</span>
              ) : funnel?.overallConversionRate != null ? (
                <span className="pivot-tenant-journeys__muted">
                  Analytics overall {formatConversionPct(funnel.overallConversionRate)}
                </span>
              ) : null
            }
          >
            {funnelMessage ? (
              <p className="pivot-lab__error" role="alert">
                {funnelMessage}
              </p>
            ) : null}
            {!funnelLoading && !intentFunnel.length && !analyticsSteps.length ? (
              <p className="pivot-lab__empty">No funnel data for this week yet.</p>
            ) : (
              <div className="pivot-tenant-journeys__funnel-grid">
                <PivotOpsCard className="pivot-tenant-journeys__panel pivot-tenant-journeys__panel--funnel">
                  <h3 className="pivot-ops-section__title">Intent stages</h3>
                  <div className="pivot-tenant-journeys__funnel-wrap">
                    <PivotOpsAreaFunnel
                      stages={(intentFunnel || []).map((stage) => ({
                        ...stage,
                        label:
                          stage.key === 'openers' ? 'Openers' : stage.label,
                      }))}
                      ariaLabel="Intent conversion funnel"
                      height={120}
                    />
                  </div>
                </PivotOpsCard>
                <PivotOpsCard className="pivot-tenant-journeys__panel">
                  <h3 className="pivot-ops-section__title">Analytics steps</h3>
                  {analyticsSteps.length ? (
                    <AnalyticsFunnelSteps steps={analyticsSteps} />
                  ) : (
                    <p className="pivot-lab__empty">
                      No pivot analytics events for this week.
                    </p>
                  )}
                </PivotOpsCard>
              </div>
            )}
          </PivotOpsSection>
        </>
      ) : null}

      {view === 'users' ? (
        <PivotOpsSection
          title="User inspector"
          titleId="pivot-journeys-inspector"
          actions={
            <Link className="pivot-tenant-journeys__link" to={curationHref}>
              Open curation
            </Link>
          }
        >
          <PivotAudienceUserInspector
            tenantKey={tenantKey}
            batchWeek={batchWeek}
            batchWeekValid={batchWeekValid}
            committedWeek={committedWeek}
            committedWeekValid={committedWeekValid}
            selectedUserId={selectedUserId}
            onSelectUser={(userId) => updateParams({ userId })}
            pane={pane}
            onPaneChange={(nextPane) => updateParams({
              userPane: nextPane === 'replay' ? null : nextPane,
            })}
            followAppWeek={followAppWeek}
            onFollowAppWeekChange={(follow) => updateParams({ deckWeek: follow ? null : 'page' })}
            refreshKey={refreshKey}
            onWiped={refetchOps}
            curationHref={curationHref}
          />
        </PivotOpsSection>
      ) : null}

      {view === 'rules' ? (
        <PivotDeckRulesPanel
          tenantKey={tenantKey}
          storedOverrides={storedDeckOverrides}
          onSaved={onDeckSaved}
        />
      ) : null}
    </PivotTenantPage>
  );
}

export default PivotTenantAudiencePage;
