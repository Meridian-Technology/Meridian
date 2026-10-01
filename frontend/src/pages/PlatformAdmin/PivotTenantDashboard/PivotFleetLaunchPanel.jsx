import React from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import {
  PivotOpsAnimateNumber,
  PivotOpsMetric,
  PivotOpsMetricGrid,
  PivotOpsSection,
  PivotOpsStatus,
} from '../../../components/PivotOps';
import PivotTenantPage from './PivotTenantPage';
import { formatRate } from './pivotOverviewFormat';
import './PivotTenantLaunchPage.scss';
import './PivotFleetLaunchPage.scss';

const NO_FETCH_CACHE = { enabled: false };

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

function cityLaunchHref(tenantKey) {
  return `/platform-admin/pivot/${encodeURIComponent(tenantKey)}?page=6`;
}

function isLaunchedMode(landingMode) {
  return String(landingMode || '').toLowerCase() === 'launched';
}

/**
 * Fleet Launch — totals + per-city funnel. Phones stay on the city Launch tab.
 */
function PivotFleetLaunchPage() {
  const {
    data: launchResponse,
    loading,
    error,
    refetch,
  } = useFetch('/admin/pivot/launch', { cache: NO_FETCH_CACHE });

  const launch = payload(launchResponse);
  const totals = launch?.totals || {};
  const cities = Array.isArray(launch?.cities) ? launch.cities : [];
  const message =
    error ||
    (launchResponse && !launchResponse.success
      ? launchResponse.message || 'Unable to load fleet launch stats.'
      : null);

  return (
    <PivotTenantPage
      title="Launch"
      tenantKey=""
      cityDisplayName="All cities"
      className="pivot-tenant-launch pivot-fleet-launch"
      actions={
        <button
          type="button"
          className="linear-btn linear-btn--secondary"
          onClick={() => refetch()}
          disabled={loading}
        >
          Refresh
        </button>
      }
    >
      {message ? (
        <p className="pivot-lab__error" role="alert">
          {message}
        </p>
      ) : null}

      <PivotOpsSection
        title="Fleet funnel"
        titleId="pivot-fleet-launch-kpis"
        description={`${formatRangeLabel(launch?.range)}. ${
          launch?.conversionNote ||
          'Each city uses its current landing mode. Mixed-mode history is best-effort.'
        }`}
      >
        {loading && !launch ? (
          <p className="pivot-lab__empty">Loading launch stats…</p>
        ) : (
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
              hint="current mode per city"
            />
          </PivotOpsMetricGrid>
        )}
      </PivotOpsSection>

      <PivotOpsSection
        title="Cities"
        titleId="pivot-fleet-launch-cities"
        description="Open a city to toggle landing mode, export waitlist emails, and copy the public URL."
      >
        {loading && !launch ? (
          <p className="pivot-lab__empty">Loading cities…</p>
        ) : !cities.length ? (
          <p className="pivot-lab__empty">No pivot cities yet.</p>
        ) : (
          <div className="pivot-tenant-launch__table-wrap">
            <table className="pivot-tenant-launch__table">
              <thead>
                <tr>
                  <th>City</th>
                  <th>Mode</th>
                  <th>Views</th>
                  <th>Waitlist</th>
                  <th>Conversion</th>
                  <th>Last signup</th>
                </tr>
              </thead>
              <tbody>
                {cities.map((city) => {
                  const key = city.tenantKey;
                  if (!key) return null;
                  const launched = isLaunchedMode(city.landingMode);
                  return (
                    <tr key={key}>
                      <td>
                        <Link
                          className="pivot-fleet-launch__city-link"
                          to={cityLaunchHref(key)}
                        >
                          {city.cityDisplayName || key}
                        </Link>
                      </td>
                      <td>
                        <PivotOpsStatus tone={launched ? 'success' : 'warn'}>
                          {launched ? 'Launched' : 'Waitlist'}
                        </PivotOpsStatus>
                      </td>
                      <td>{city.views ?? 0}</td>
                      <td>{city.waitlistSignups ?? 0}</td>
                      <td>{formatRate(city.conversionRate)}</td>
                      <td>{formatTimestamp(city.lastSignupAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PivotOpsSection>
    </PivotTenantPage>
  );
}

export default PivotFleetLaunchPage;
export { cityLaunchHref };
