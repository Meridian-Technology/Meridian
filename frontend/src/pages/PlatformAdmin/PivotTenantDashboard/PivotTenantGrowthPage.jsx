import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { justGoPublicLandingUrl } from '../../JustGoLanding/justGoLandingCopy';
import {
  PivotOpsAnimateNumber,
  PivotOpsBanner,
  PivotOpsBarList,
  PivotOpsMetric,
  PivotOpsMetricGrid,
  PivotOpsSection,
  PivotOpsStatus,
} from '../../../components/PivotOps';
import AdminPlatformMetricChart from '../../Admin/General/AdminPlatformAnalytics/AdminPlatformMetricChart';
import PivotTenantPage from './PivotTenantPage';
import PivotLandingQrManager from './PivotLandingQrManager';
import PivotGrowthOverview from './PivotGrowthOverview';
import PivotTenantViewTabs from './PivotTenantViewTabs';
import { toUtcMonth } from './PivotAnalyticsMonthPicker';
import PivotAcquisitionFunnel, {
  PivotAcquisitionControls,
  usePivotAcquisition,
} from './PivotAcquisitionFunnel';
import { formatRate } from './pivotOverviewFormat';
import './PivotTenantGrowthPage.scss';

const NO_FETCH_CACHE = { enabled: false };
const WAITLIST_PAGE_SIZE = 50;
const CHART_COLOR = '#ff4f1f';
/*
 * `growth` URL param. Page-specific because the dashboard shell carries every
 * query param across nav clicks. Waitlist contact data loads only on its tab.
 */
export const GROWTH_VIEWS = Object.freeze([
  { id: 'overview', label: 'Overview' },
  { id: 'landing', label: 'Landing' },
  { id: 'waitlist', label: 'Waitlist' },
  { id: 'qr', label: 'QR codes' },
  { id: 'acquisition', label: 'Acquisition' },
]);
const VIEW_IDS = new Set(GROWTH_VIEWS.map((view) => view.id));
const SOURCE_LABELS = {
  direct: 'Direct',
  share: 'Share',
  qr: 'QR',
};

function payload(response) {
  if (!response?.success || !response.data) return null;
  return response.data;
}

function formatRangeLabel(range) {
  const from = String(range?.from || '').slice(0, 10);
  const to = String(range?.to || '').slice(0, 10);
  if (!from || !to) return 'Last 28 days';
  return `${from} → ${to}`;
}

function formatTimestamp(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString();
}

function isLaunchedMode(landingMode) {
  return String(landingMode || '').toLowerCase() === 'launched';
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(href);
}

/** First character + domain — never put the full email in confirms, toasts, or logs. */
export function maskWaitlistEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  const at = value.indexOf('@');
  if (at < 1 || at === value.length - 1) return 'this signup';
  const local = value.slice(0, at);
  const domain = value.slice(at);
  return `${local.slice(0, 1)}***${domain}`;
}

/**
 * Per-tenant Growth: an investor-style overview (weekly actives, cohort
 * retention, growth accounting), landing mode and funnel, waitlist, QR
 * attribution and tracking QRs, and the monthly acquisition funnel. Replaces
 * the former Launch (page 6) and Analytics (page 11) panels.
 */
function PivotTenantGrowthPage({ tenantKey, cityDisplayName }) {
  const { addNotification } = useNotification();
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
  const [month, setMonth] = useState(() => toUtcMonth());
  const acquisition = usePivotAcquisition({
    tenantKey,
    month,
    setMonth,
    enabled: Boolean(tenantKey) && view === 'acquisition',
  });
  const [waitlistPage, setWaitlistPage] = useState(1);
  const [savingMode, setSavingMode] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const savingModeRef = useRef(false);
  const exportingCsvRef = useRef(false);
  const refetchQrsRef = useRef(null);
  const refetchOverviewRef = useRef(null);

  const launchUrl = tenantKey && (view === 'landing' || view === 'qr')
    ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/launch`
    : null;
  const waitlistUrl = tenantKey && view === 'waitlist'
    ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/waitlist`
    : null;
  const waitlistParams = useMemo(
    () => ({ page: waitlistPage, limit: WAITLIST_PAGE_SIZE }),
    [waitlistPage],
  );

  const {
    data: launchResponse,
    loading: launchLoading,
    error: launchError,
    refetch: refetchLaunch,
  } = useFetch(launchUrl, { cache: NO_FETCH_CACHE });

  const {
    data: waitlistResponse,
    loading: waitlistLoading,
    error: waitlistError,
    refetch: refetchWaitlist,
  } = useFetch(waitlistUrl, {
    params: waitlistParams,
    cache: NO_FETCH_CACHE,
  });

  const launch = payload(launchResponse);
  const waitlist = payload(waitlistResponse);
  const landingMode = launch?.landingMode || 'waitlist';
  const launched = isLaunchedMode(landingMode);
  const totals = launch?.totals || {};
  const qr = launch?.qr || {};
  const publicUrl =
    launch?.publicUrl || justGoPublicLandingUrl(tenantKey);
  const items = waitlist?.items || [];
  const pagination = waitlist?.pagination || {
    page: waitlistPage,
    limit: WAITLIST_PAGE_SIZE,
    total: 0,
  };
  const pageCount = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || WAITLIST_PAGE_SIZE)));
  const displayCity = launch?.cityDisplayName || cityDisplayName || tenantKey;
  const launchMessage =
    launchError ||
    (launchResponse && !launchResponse.success
      ? launchResponse.message || 'Unable to load launch stats.'
      : null);
  const waitlistMessage =
    waitlistError ||
    (waitlistResponse && !waitlistResponse.success
      ? waitlistResponse.message || 'Unable to load waitlist.'
      : null);

  const viewsSeries = useMemo(() => {
    const series = launch?.series || [];
    if (!series.length) return [];
    return [
      {
        label: 'Views',
        color: CHART_COLOR,
        data: series.map((row) => ({
          x: row.date,
          y: row.views ?? 0,
        })),
      },
    ];
  }, [launch?.series]);

  const sourceBars = useMemo(() => {
    const sources = launch?.sources || {};
    return ['direct', 'share', 'qr'].map((key) => {
      const row = sources[key] || {};
      return {
        key,
        label: SOURCE_LABELS[key],
        value: row.views ?? 0,
        hint: launched
          ? `${row.storeClicks ?? 0} store clicks`
          : `${row.waitlistSignups ?? 0} signups`,
      };
    });
  }, [launch?.sources, launched]);

  const qrBars = useMemo(() => {
    const rows = Array.isArray(qr.byName) ? qr.byName : [];
    return rows.map((row) => ({
      key: row.qrName,
      label: row.qrName,
      value: row.views ?? 0,
      hint: launched
        ? `${row.storeClicks ?? 0} store clicks · ${row.scans ?? 0} legacy hops`
        : `${row.waitlistSignups ?? 0} signups · ${row.scans ?? 0} legacy hops`,
      secondary: `${row.scans ?? 0} legacy hops`,
    }));
  }, [qr.byName, launched]);

  const handleToggleMode = useCallback(async () => {
    if (!tenantKey || savingModeRef.current) return;
    const nextMode = launched ? 'waitlist' : 'launched';
    const confirmed = window.confirm(
      nextMode === 'launched'
        ? `Switch ${displayCity} to launched? The public landing will show App Store install instead of the waitlist form.`
        : `Switch ${displayCity} to waitlist? The public landing will collect emails instead of install CTAs.`,
    );
    if (!confirmed) return;

    savingModeRef.current = true;
    setSavingMode(true);
    const { data: res, error: reqError } = await authenticatedRequest(
      `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/landing-mode`,
      {
        method: 'PATCH',
        data: { landingMode: nextMode },
        headers: { 'Content-Type': 'application/json' },
      },
    );
    savingModeRef.current = false;
    setSavingMode(false);

    if (reqError || !res?.success) {
      addNotification({
        title: 'Could not update landing mode',
        message: res?.message || reqError || 'Unable to update landing mode.',
        type: 'error',
      });
      return;
    }

    addNotification({
      title: 'Landing mode updated',
      message: `${displayCity} is now ${nextMode}.`,
      type: 'success',
    });
    refetchLaunch();
  }, [addNotification, displayCity, launched, refetchLaunch, tenantKey]);

  const handleCopyPublicUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      addNotification({
        title: 'Link copied',
        message: publicUrl,
        type: 'success',
      });
    } catch {
      addNotification({
        title: 'Could not copy link',
        message: publicUrl,
        type: 'error',
      });
    }
  }, [addNotification, publicUrl]);

  const handleExportCsv = useCallback(async () => {
    if (!tenantKey || exportingCsvRef.current) return;
    exportingCsvRef.current = true;
    setExportingCsv(true);
    const { data, error } = await authenticatedRequest(
      `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/waitlist.csv`,
    );
    exportingCsvRef.current = false;
    setExportingCsv(false);
    if (error || (data && typeof data === 'object' && data.success === false)) {
      addNotification({
        title: 'Export failed',
        message:
          (typeof data === 'object' && data?.message) ||
          error ||
          'Unable to export waitlist.',
        type: 'error',
      });
      return;
    }
    const csv = typeof data === 'string' ? data : '';
    if (!csv) {
      addNotification({
        title: 'Export failed',
        message: 'Waitlist CSV was empty.',
        type: 'error',
      });
      return;
    }
    downloadTextFile(`justgo-waitlist-${tenantKey}.csv`, csv);
  }, [addNotification, tenantKey]);

  const handleDeleteWaitlistRow = useCallback(
    async (row) => {
      const id = String(row?.id || '').trim();
      if (!tenantKey || !id || deletingId) return;
      const confirmed = window.confirm(
        `Remove waitlist signup ${maskWaitlistEmail(row.email)}? This cannot be undone.`,
      );
      if (!confirmed) return;

      setDeletingId(id);
      const { data: res, error: reqError } = await authenticatedRequest(
        `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/waitlist/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );
      setDeletingId(null);

      if (reqError || !res?.success) {
        addNotification({
          title: 'Could not remove signup',
          message: res?.message || reqError || 'Unable to delete waitlist signup.',
          type: 'error',
        });
        return;
      }

      addNotification({
        title: 'Waitlist signup removed',
        message: `Removed ${maskWaitlistEmail(row.email)}.`,
        type: 'success',
      });
      if (items.length === 1 && waitlistPage > 1) {
        setWaitlistPage((page) => Math.max(1, page - 1));
      }
      refetchWaitlist();
    },
    [
      addNotification,
      deletingId,
      items.length,
      refetchWaitlist,
      tenantKey,
      waitlistPage,
    ],
  );

  const refreshView = () => {
    if (view === 'overview') {
      refetchOverviewRef.current?.();
      return;
    }
    if (view === 'waitlist') {
      refetchWaitlist();
      return;
    }
    refetchLaunch();
    if (view === 'qr') refetchQrsRef.current?.();
  };

  const rangeLabel = formatRangeLabel(launch?.range);
  const launchPending = launchLoading && !launch;

  return (
    <PivotTenantPage
      title="Growth"
      tenantKey={tenantKey}
      cityDisplayName={displayCity}
      className="pivot-tenant-launch"
      actions={
        view === 'acquisition' ? (
          <PivotAcquisitionControls acquisition={acquisition} onMonthChange={setMonth} />
        ) : (
          <button
            type="button"
            className="linear-btn linear-btn--secondary"
            onClick={refreshView}
            disabled={
              view === 'overview'
                ? !tenantKey
                : view === 'waitlist'
                  ? !waitlistUrl || waitlistLoading
                  : !launchUrl || launchLoading
            }
          >
            Refresh
          </button>
        )
      }
    >
      <PivotTenantViewTabs
        views={GROWTH_VIEWS}
        value={view}
        onChange={setView}
        ariaLabel="Growth view"
      />

      {view === 'overview' ? (
        <PivotGrowthOverview tenantKey={tenantKey} refetchRef={refetchOverviewRef} />
      ) : null}

      {(view === 'landing' || view === 'qr') && launchMessage ? (
        <p className="pivot-lab__error" role="alert">
          {launchMessage}
        </p>
      ) : null}

      {view === 'landing' ? (
        <>
          <PivotOpsSection
            title="Landing mode"
            titleId="pivot-launch-mode"
            description="Waitlist shows an email form. Launched shows App Store install. Independent of tenant status."
            actions={
              <PivotOpsStatus tone={launched ? 'success' : 'warn'}>
                {launched ? 'Launched' : 'Waitlist'}
              </PivotOpsStatus>
            }
          >
            {launchPending ? (
              <p className="pivot-lab__empty">Loading landing mode…</p>
            ) : (
              <div className="pivot-tenant-launch__mode-row">
                <p className="pivot-tenant-launch__mode-copy">
                  {launched
                    ? 'This city is live on the landing. Store clicks count as conversion.'
                    : 'This city is on the waitlist. Signups count as conversion.'}
                </p>
                <button
                  type="button"
                  className="linear-btn linear-btn--primary"
                  onClick={handleToggleMode}
                  disabled={savingMode || !launch}
                >
                  {savingMode
                    ? 'Saving…'
                    : launched
                      ? 'Switch to waitlist'
                      : 'Switch to launched'}
                </button>
              </div>
            )}
          </PivotOpsSection>

          <PivotOpsSection
            title="Public link"
            titleId="pivot-launch-link"
            description="Canonical city landing. New tracking QRs open this page directly with src=qr."
          >
            {launchPending ? (
              <p className="pivot-lab__empty">Loading public URL…</p>
            ) : (
              <>
                <PivotOpsBanner tone="muted" title={publicUrl}>
                  Share this URL directly. Poster QRs under QR codes add campaign attribution; legacy /qr/name posters still land here.
                </PivotOpsBanner>
                <div className="pivot-tenant-launch__link-row">
                  <button
                    type="button"
                    className="linear-btn linear-btn--primary"
                    onClick={handleCopyPublicUrl}
                  >
                    Copy link
                  </button>
                  <a
                    className="linear-btn linear-btn--secondary"
                    href={publicUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open landing
                  </a>
                </div>
              </>
            )}
          </PivotOpsSection>

          <PivotOpsSection
            title="Landing funnel"
            titleId="pivot-launch-kpis"
            description={`${rangeLabel}. ${
              launch?.conversionNote ||
              'Conversion uses the current landing mode for the whole range.'
            }`}
          >
            {launchPending ? (
              <p className="pivot-lab__empty">Loading launch stats…</p>
            ) : (
              <>
                <PivotOpsMetricGrid>
                  <PivotOpsMetric
                    label="Views"
                    value={<PivotOpsAnimateNumber value={totals.views ?? 0} />}
                  />
                  <PivotOpsMetric
                    label="Unique visitors"
                    value={<PivotOpsAnimateNumber value={totals.uniqueVisitors ?? 0} />}
                  />
                  <PivotOpsMetric
                    label="Waitlist signups"
                    value={<PivotOpsAnimateNumber value={totals.waitlistSignups ?? 0} />}
                  />
                  <PivotOpsMetric
                    label="Store clicks"
                    value={<PivotOpsAnimateNumber value={totals.storeClicks ?? 0} />}
                  />
                  <PivotOpsMetric
                    label="Conversion"
                    value={formatRate(totals.conversionRate)}
                    hint={launched ? 'store clicks / views' : 'signups / views'}
                  />
                </PivotOpsMetricGrid>
                <div className="pivot-tenant-launch__chart">
                  <AdminPlatformMetricChart
                    title=""
                    series={viewsSeries}
                    granularity="day"
                    height={160}
                    emptyMessage="No landing views in this range"
                    margin={{ top: 8, right: 0, bottom: 22, left: 0 }}
                    edgeToEdge
                    hideYAxis
                  />
                </div>
                <PivotOpsBarList
                  items={sourceBars}
                  ariaLabel="Landing views by source"
                  valueFormat={(value) => `${value} views`}
                />
              </>
            )}
          </PivotOpsSection>
        </>
      ) : null}

      {view === 'waitlist' ? (
        <PivotOpsSection
          title="Waitlist"
          titleId="pivot-launch-waitlist"
          description="Phone numbers are PII. Visible on this tab and CSV only — not Overview. Rows stay until an admin removes them."
          actions={
            <button
              type="button"
              className="linear-btn linear-btn--secondary"
              onClick={handleExportCsv}
              disabled={!tenantKey || exportingCsv}
            >
              {exportingCsv ? 'Exporting…' : 'Download CSV'}
            </button>
          }
        >
          {waitlistMessage ? (
            <p className="pivot-lab__error" role="alert">
              {waitlistMessage}
            </p>
          ) : null}
          {waitlistLoading && !waitlist ? (
            <p className="pivot-lab__empty">Loading waitlist…</p>
          ) : !items.length ? (
            <p className="pivot-lab__empty">No waitlist signups yet.</p>
          ) : (
            <>
              <div className="pivot-tenant-launch__table-wrap">
                <table className="pivot-tenant-launch__table">
                  <thead>
                    <tr>
                      <th>Signed up</th>
                      <th>Email</th>
                      <th>Source</th>
                      <th>QR</th>
                      <th>Ref</th>
                      <th>Friends</th>
                      <th>Remove</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr key={row.id || `${row.email}-${row.createdAt}`}>
                        <td>{formatTimestamp(row.createdAt)}</td>
                        <td className="pivot-tenant-launch__email">{row.email || '—'}</td>
                        <td>{row.source || 'direct'}</td>
                        <td>{row.qrName || '—'}</td>
                        <td>{row.refCode || '—'}</td>
                        <td>{row.friendsJoined ?? 0}</td>
                        <td>
                          <button
                            type="button"
                            className="linear-btn linear-btn--secondary"
                            onClick={() => handleDeleteWaitlistRow(row)}
                            disabled={!row.id || deletingId === row.id}
                          >
                            {deletingId === row.id ? 'Removing…' : 'Remove'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pivot-tenant-launch__pager">
                <span>
                  {pagination.total} signup{pagination.total === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  className="linear-btn linear-btn--secondary"
                  onClick={() => setWaitlistPage((page) => Math.max(1, page - 1))}
                  disabled={waitlistPage <= 1 || waitlistLoading}
                >
                  Previous
                </button>
                <span>
                  Page {pagination.page || waitlistPage} of {pageCount}
                </span>
                <button
                  type="button"
                  className="linear-btn linear-btn--secondary"
                  onClick={() => setWaitlistPage((page) => page + 1)}
                  disabled={waitlistPage >= pageCount || waitlistLoading}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </PivotOpsSection>
      ) : null}

      {view === 'qr' ? (
        <>
          <PivotOpsSection
            title="QR attribution"
            titleId="pivot-launch-qr-attribution"
            description={`${rangeLabel}. Landing views that arrived with src=qr, by code.`}
          >
            {launchPending ? (
              <p className="pivot-lab__empty">Loading QR attribution…</p>
            ) : (
              <>
                <PivotOpsMetricGrid>
                  <PivotOpsMetric
                    label="QR views"
                    value={<PivotOpsAnimateNumber value={qr.views ?? 0} />}
                    hint="landing views with src=qr"
                  />
                  <PivotOpsMetric
                    label="Legacy QR hops"
                    value={<PivotOpsAnimateNumber value={qr.scans ?? 0} />}
                    hint="hops at /qr/{name}"
                  />
                </PivotOpsMetricGrid>
                {qrBars.length ? (
                  <div className="pivot-tenant-launch__qr-kpis">
                    <p className="pivot-tenant-launch__bars-label">QR-attributed landing views</p>
                    <PivotOpsBarList
                      items={qrBars}
                      ariaLabel="QR-attributed landing views by code"
                      valueFormat={(value) => `${value} views`}
                    />
                  </div>
                ) : (
                  <p className="pivot-lab__empty">No QR-attributed landing views in this range.</p>
                )}
              </>
            )}
          </PivotOpsSection>

          <PivotLandingQrManager tenantKey={tenantKey} refetchRef={refetchQrsRef} />
        </>
      ) : null}

      {view === 'acquisition' ? (
        <PivotAcquisitionFunnel acquisition={acquisition} />
      ) : null}
    </PivotTenantPage>
  );
}

export default PivotTenantGrowthPage;
