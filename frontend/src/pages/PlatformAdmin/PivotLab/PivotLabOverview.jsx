import React, { useMemo } from 'react';
import AdminPlatformMetricChart from '../../Admin/General/AdminPlatformAnalytics/AdminPlatformMetricChart';

const CHART_COLOR = '#5e6ad2'; // --la-accent

function MetricCard({ label, value, hint }) {
  return (
    <div className="linear-stat pivot-lab__metric">
      <span className="linear-stat__label">{label}</span>
      <span className="linear-stat__value">{value}</span>
      {hint ? <span className="pivot-lab__metric-hint">{hint}</span> : null}
    </div>
  );
}

function formatPercent(numerator, denominator) {
  if (!denominator) return null;
  return `${Math.round((numerator / denominator) * 100)}%`;
}

/**
 * Weekly loop funnel for the selected city: swipes → interested → ticket
 * openers → going, with stage-over-stage conversion.
 */
function FunnelChart({ tenant }) {
  const stages = useMemo(() => {
    if (!tenant) return [];
    const swipes = tenant.swipeCount ?? 0;
    const interested = (tenant.interestedCount ?? 0) + (tenant.registeredCount ?? 0);
    const openers = tenant.externalOpenUsers ?? 0;
    const going = tenant.registeredCount ?? 0;
    return [
      { key: 'swipes', label: 'Swipes', value: swipes, hint: 'cards acted on' },
      { key: 'interested', label: 'Interested', value: interested, hint: 'right swipes' },
      { key: 'openers', label: 'Ticket openers', value: openers, hint: 'unique users' },
      { key: 'going', label: 'Going', value: going, hint: 'self-confirmed' },
    ];
  }, [tenant]);

  const max = Math.max(1, ...stages.map((stage) => stage.value));

  if (!tenant) return null;

  return (
    <div className="pivot-lab__funnel" role="img" aria-label="Weekly conversion funnel">
      {stages.map((stage, index) => {
        const prev = index > 0 ? stages[index - 1].value : null;
        const conversion = prev != null ? formatPercent(stage.value, prev) : null;
        return (
          <div className="pivot-lab__funnel-row" key={stage.key}>
            <div className="pivot-lab__funnel-meta">
              <span className="pivot-lab__funnel-label">{stage.label}</span>
              <span className="pivot-lab__funnel-hint">{stage.hint}</span>
            </div>
            <div className="pivot-lab__funnel-track">
              <div
                className="pivot-lab__funnel-bar"
                style={{ width: `${Math.max(2, (stage.value / max) * 100)}%` }}
              />
              <span className="pivot-lab__funnel-value">{stage.value}</span>
            </div>
            <span className="pivot-lab__funnel-conversion">
              {conversion ? `${conversion} of prev` : ' '}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ReferralStatus({ code }) {
  if (!code.active) return <span className="pivot-lab__pill pivot-lab__pill--muted">Inactive</span>;
  if (code.expiresAt && new Date(code.expiresAt) < new Date()) {
    return <span className="pivot-lab__pill pivot-lab__pill--warn">Expired</span>;
  }
  if (code.redemptionCount >= code.maxRedemptions) {
    return <span className="pivot-lab__pill pivot-lab__pill--warn">Maxed</span>;
  }
  if (code.redeemable) {
    return <span className="pivot-lab__pill pivot-lab__pill--ok">Redeemable</span>;
  }
  return <span className="pivot-lab__pill">—</span>;
}

function formatRetentionCell(week) {
  if (!week) return '—';
  const active = week.activeUsers ?? 0;
  if (week.retentionRate == null) {
    return `${active}`;
  }
  return `${active} (${week.retentionRate}%)`;
}

function PivotLabOverview({
  tenants,
  selectedTenant,
  batchWeek,
  retention,
  retentionLoading,
  retentionError,
  overviewLoading,
  referralRows,
}) {
  const retentionWeeks = retention?.weeks ?? [];
  const retentionTenants = useMemo(() => retention?.tenants ?? [], [retention]);

  const selectedRetention = useMemo(
    () =>
      retentionTenants.find((row) => row.tenantKey === selectedTenant?.tenantKey) || null,
    [retentionTenants, selectedTenant],
  );

  const activeUsersSeries = useMemo(() => {
    const weeks = selectedRetention?.weeks ?? [];
    if (!weeks.length) return [];
    return [
      {
        label: 'Active users',
        color: CHART_COLOR,
        data: weeks.map((week) => ({ x: week.batchWeek, y: week.activeUsers ?? 0 })),
      },
    ];
  }, [selectedRetention]);

  const feedbackLabel =
    selectedTenant?.feedbackAvg != null
      ? `${selectedTenant.feedbackAvg} (${selectedTenant.feedbackCount ?? 0})`
      : '—';

  if (overviewLoading && !tenants.length) {
    return <p className="pivot-lab__empty">Loading overview…</p>;
  }

  if (!tenants.length) {
    return <p className="pivot-lab__empty">No pivot cities configured for this week.</p>;
  }

  return (
    <>
      {selectedTenant ? (
        <section className="linear-section pivot-lab__section" aria-labelledby="pivot-lab-kpis">
          <h2 id="pivot-lab-kpis" className="linear-section__title">
            {selectedTenant.cityDisplayName || selectedTenant.tenantKey} · {batchWeek}
          </h2>
          {selectedTenant.error ? (
            <p className="pivot-lab__city-error">Metrics unavailable for this city.</p>
          ) : (
            <>
              <div className="pivot-lab__kpi-grid">
                <MetricCard
                  label="Active users"
                  value={selectedTenant.activeUsers ?? 0}
                  hint="swiped this week"
                />
                <MetricCard label="Published events" value={selectedTenant.eventCount ?? 0} />
                <MetricCard label="Interested" value={selectedTenant.interestedCount ?? 0} />
                <MetricCard label="Going" value={selectedTenant.registeredCount ?? 0} />
                <MetricCard
                  label="Ticket openers"
                  value={selectedTenant.externalOpenUsers ?? 0}
                  hint={`${selectedTenant.externalOpenCount ?? 0} total opens`}
                />
                <MetricCard label="Feedback avg" value={feedbackLabel} hint="ratings from going" />
              </div>
              <div className="pivot-lab__overview-grid">
                <div className="pivot-lab__panel">
                  <h3 className="pivot-lab__panel-title">This week&apos;s loop</h3>
                  <FunnelChart tenant={selectedTenant} />
                  <div className="pivot-lab__engagement-row">
                    <MetricCard label="Calendar adds" value={selectedTenant.calendarAdds ?? 0} />
                    <MetricCard label="Invites shared" value={selectedTenant.inviteShares ?? 0} />
                    <MetricCard label="Interests saved" value={selectedTenant.interestsSaved ?? 0} />
                  </div>
                </div>
                <div className="pivot-lab__panel">
                  {retentionLoading && !activeUsersSeries.length ? (
                    <p className="pivot-lab__empty">Loading trend…</p>
                  ) : (
                    <AdminPlatformMetricChart
                      title="Active users by week"
                      series={activeUsersSeries}
                      granularity="week"
                      height={180}
                      emptyMessage="No weekly activity yet"
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      ) : null}

      <section className="linear-section pivot-lab__section" aria-labelledby="pivot-lab-retention">
        <div className="pivot-lab__section-head">
          <div>
            <h2 id="pivot-lab-retention" className="linear-section__title">
              Weekly retention
            </h2>
            <p className="pivot-lab__section-hint">
              Active swipers per week; (%) is the share of the prior week&apos;s users who returned.
            </p>
          </div>
        </div>
        {retentionError ? <p className="pivot-lab__error">{retentionError}</p> : null}
        {retentionLoading && !retentionTenants.length ? (
          <p className="pivot-lab__empty">Loading retention…</p>
        ) : retentionTenants.length ? (
          <div className="pivot-lab__table-wrap">
            <table className="pivot-lab__table">
              <thead>
                <tr>
                  <th scope="col">City</th>
                  {retentionWeeks.map((week) => (
                    <th scope="col" key={week}>
                      {week}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {retentionTenants.map((tenant) => (
                  <tr key={tenant.tenantKey}>
                    <td>{tenant.cityDisplayName || tenant.tenantKey}</td>
                    {retentionWeeks.map((week) => (
                      <td key={week}>
                        {tenant.error
                          ? '—'
                          : formatRetentionCell(
                              tenant.weeks?.find((row) => row.batchWeek === week),
                            )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="pivot-lab__empty">No pivot cities configured.</p>
        )}
      </section>

      <section className="linear-section pivot-lab__section" aria-labelledby="pivot-lab-cities">
        <div className="pivot-lab__section-head">
          <div>
            <h2 id="pivot-lab-cities" className="linear-section__title">
              All cities · {batchWeek}
            </h2>
            <p className="pivot-lab__section-hint">
              Live aggregates per pivot tenant for the selected week.
            </p>
          </div>
        </div>
        <div className="pivot-lab__table-wrap">
          <table className="pivot-lab__table">
            <thead>
              <tr>
                <th scope="col">City</th>
                <th scope="col">Events</th>
                <th scope="col">Active</th>
                <th scope="col">Swipes</th>
                <th scope="col">Interested</th>
                <th scope="col">Going</th>
                <th scope="col" title="Unique users who opened a ticket link">Openers</th>
                <th scope="col">Feedback</th>
                <th scope="col">Cal. adds</th>
                <th scope="col">Invites</th>
                <th scope="col">Interests</th>
                <th scope="col">Next drop</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.tenantKey}>
                  <td>
                    {tenant.cityDisplayName || tenant.tenantKey}
                    {tenant.error ? (
                      <span className="pivot-lab__pill pivot-lab__pill--warn"> metrics error</span>
                    ) : null}
                  </td>
                  <td>{tenant.eventCount ?? 0}</td>
                  <td>{tenant.activeUsers ?? 0}</td>
                  <td>{tenant.swipeCount ?? 0}</td>
                  <td>{tenant.interestedCount ?? 0}</td>
                  <td>{tenant.registeredCount ?? 0}</td>
                  <td>{tenant.externalOpenUsers ?? 0}</td>
                  <td>
                    {tenant.feedbackAvg != null
                      ? `${tenant.feedbackAvg} (${tenant.feedbackCount ?? 0})`
                      : '—'}
                  </td>
                  <td>{tenant.calendarAdds ?? 0}</td>
                  <td>{tenant.inviteShares ?? 0}</td>
                  <td>{tenant.interestsSaved ?? 0}</td>
                  <td>{tenant.dropSchedule?.nextDropFormatted || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="linear-section pivot-lab__section" aria-labelledby="pivot-lab-referrals">
        <h2 id="pivot-lab-referrals" className="linear-section__title">
          Referral codes
        </h2>
        {referralRows.length ? (
          <div className="pivot-lab__table-wrap">
            <table className="pivot-lab__table">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">City</th>
                  <th scope="col">Cohort</th>
                  <th scope="col">Redemptions</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {referralRows.map((row) => (
                  <tr key={`${row.tenantKey}-${row.code}`}>
                    <td>{row.code}</td>
                    <td>{row.cityDisplayName}</td>
                    <td>{row.cohortId || '—'}</td>
                    <td>
                      {row.redemptionCount ?? 0} / {row.maxRedemptions ?? 0}
                    </td>
                    <td>
                      <ReferralStatus code={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="pivot-lab__empty">No referral codes for pivot cities.</p>
        )}
      </section>
    </>
  );
}

export default PivotLabOverview;
