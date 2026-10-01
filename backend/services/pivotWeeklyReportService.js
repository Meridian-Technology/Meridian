/**
 * Weekly Just Go report email for platform admins: last complete drop week's
 * growth metrics across all cities, a per-city table, and the landing funnel.
 * Meant to go out on Sunday. There is no scheduler yet — send it from the
 * fleet Growth page or `npm run report:weekly` (scripts/sendWeeklyReport.js).
 *
 * Metric definitions: utilities/pivotGrowthMetrics.js and
 * docs/pivot-growth-overview-metrics.md.
 */
const getGlobalModels = require('./getGlobalModelService');
const { getResend } = require('./resendClient');
const { resolveAdminEmails } = require('./pivotComputeAdminNotifyService');
const { getFleetGrowthOverview, getTenantGrowthOverview } = require('./pivotGrowthOverviewService');
const { getFleetLaunchStats } = require('./pivotLandingService');

const FROM = 'Just Go <support@meridian.study>';
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_COLUMNS = 5; // Week 0–4 in the email
const ACCENT = '#FF4F1F';
const INK = '#1A1714';
const MUTED = '#6B655E';
const BORDER = '#E8E4DE';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveFrontendBaseUrl() {
  const configured = typeof process.env.FRONTEND_URL === 'string' ? process.env.FRONTEND_URL.trim() : '';
  if (configured) return configured.replace(/\/$/, '');
  return process.env.NODE_ENV === 'production' ? 'https://www.meridian.study' : 'http://localhost:3000';
}

function shortDate(day) {
  if (!day) return '—';
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function addDays(day, days) {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function pct(rate) {
  if (rate == null || Number.isNaN(Number(rate))) return '—';
  const value = Number(rate) * 100;
  return value > 0 && value < 10 ? `${value.toFixed(1)}%` : `${Math.round(value)}%`;
}

function ratio(value) {
  return value == null || Number.isNaN(Number(value)) ? '—' : Number(value).toFixed(2);
}

/** "▲ 12%" / "▼ 3 pts" / "flat" vs the prior week, or '' when unknown. */
function delta(value, previous, kind = 'count') {
  if (value == null || previous == null) return '';
  const current = Number(value);
  const prior = Number(previous);
  if (Number.isNaN(current) || Number.isNaN(prior)) return '';
  let amount;
  let text;
  if (kind === 'rate') {
    amount = Math.round((current - prior) * 100);
    text = `${Math.abs(amount)} pts`;
  } else if (kind === 'ratio') {
    amount = Math.round((current - prior) * 100) / 100;
    text = Math.abs(amount).toFixed(2);
  } else {
    if (!prior) return current ? '▲ new' : '';
    amount = Math.round(((current - prior) / prior) * 100);
    text = `${Math.abs(amount)}%`;
  }
  if (!amount) return 'flat';
  return `${amount > 0 ? '▲' : '▼'} ${text}`;
}

function headlineTiles(headline) {
  return [
    {
      label: 'Weekly actives',
      value: String(headline.weeklyActive.value ?? 0),
      delta: delta(headline.weeklyActive.value, headline.weeklyActive.previous),
      hint: 'Opened the drop or acted on a card',
    },
    {
      label: 'New members',
      value: String(headline.newMembers.value ?? 0),
      delta: delta(headline.newMembers.value, headline.newMembers.previous),
      hint: headline.newMembers.referredShare != null
        ? `${pct(headline.newMembers.referredShare)} via referral`
        : 'Joined this drop week',
    },
    {
      label: 'Activation',
      value: pct(headline.activation.value),
      delta: delta(headline.activation.value, headline.activation.previous, 'rate'),
      hint: 'Active in join week · last 4 cohorts',
    },
    {
      label: 'Week-1 retention',
      value: pct(headline.week1Retention.value),
      delta: delta(headline.week1Retention.value, headline.week1Retention.previous, 'rate'),
      hint: 'Back the next drop · last 4 cohorts',
    },
    {
      label: 'Quick ratio',
      value: ratio(headline.quickRatio.value),
      delta: delta(headline.quickRatio.value, headline.quickRatio.previous, 'ratio'),
      hint: '(New + resurrected) ÷ churned',
    },
    {
      label: 'Plan rate',
      value: pct(headline.planRate.value),
      delta: delta(headline.planRate.value, headline.planRate.previous, 'rate'),
      hint: 'Weekly actives who saved a plan',
    },
  ];
}

/**
 * Gather the report for the last complete drop week. Every metric comes from
 * the same services as the Growth → Overview panels, so the email and the
 * dashboard agree.
 */
async function buildWeeklyReport(req, { now = new Date() } = {}) {
  const { data: fleet } = await getFleetGrowthOverview(req, { now });
  const week = fleet.lastCompleteWeek;
  const weekRow = fleet.series.find((row) => row.week === week) || null;
  const startDate = weekRow?.startDate || null;
  const endDate = startDate ? addDays(startDate, 6) : null;

  const cityOverviews = await Promise.all(
    fleet.cities.map(async (city) => {
      try {
        const result = await getTenantGrowthOverview(req, { tenantKey: city.tenantKey, now });
        return result.error ? { city, error: result.error } : { city, overview: result.data };
      } catch (error) {
        return { city, error: error?.message || 'failed' };
      }
    }),
  );

  let landing = null;
  if (startDate) {
    const landingResult = await getFleetLaunchStats(req, { from: startDate, to: endDate, now });
    landing = landingResult.error ? null : landingResult.data;
  }
  const landingByCity = new Map((landing?.cities || []).map((row) => [row.tenantKey, row]));

  const cities = cityOverviews.map(({ city, overview, error }) => {
    const landingRow = landingByCity.get(city.tenantKey) || {};
    if (!overview) {
      return { tenantKey: city.tenantKey, name: city.cityDisplayName, error };
    }
    const { headline } = overview;
    return {
      tenantKey: city.tenantKey,
      name: city.cityDisplayName,
      launchDate: city.launchDate || null,
      notStarted: Boolean(overview.launch && !overview.launch.started),
      weeklyActive: headline.weeklyActive.value,
      weeklyActiveDelta: delta(headline.weeklyActive.value, headline.weeklyActive.previous),
      newMembers: headline.newMembers.value,
      week1Retention: headline.week1Retention.value,
      planRate: headline.planRate.value,
      landingViews: landingRow.views ?? null,
      waitlistSignups: landingRow.waitlistSignups ?? null,
      storeClicks: landingRow.storeClicks ?? null,
    };
  });

  const accounting = fleet.growthAccounting.find((row) => row.week === week) || null;
  const retentionAverage = (fleet.retention?.opened?.average || []).slice(0, RETENTION_COLUMNS);
  const dashboardUrl = `${resolveFrontendBaseUrl()}/platform-admin/pivot?page=2`;
  const period = startDate ? `${shortDate(startDate)} – ${shortDate(endDate)}` : week;

  return {
    subject: `Just Go weekly report · ${period}`,
    week,
    startDate,
    endDate,
    period,
    generatedAt: new Date(now).toISOString(),
    totalMembers: fleet.totalMembers,
    preLaunchMembers: fleet.preLaunchMembers || 0,
    headline: fleet.headline,
    tiles: headlineTiles(fleet.headline),
    accounting,
    retentionAverage,
    landing: landing ? { totals: landing.totals } : null,
    cities,
    failedCities: fleet.failedCities || [],
    dashboardUrl,
  };
}

function tileCell(tile) {
  return `<td style="width:33%;padding:6px;vertical-align:top">
    <div style="border:1px solid ${BORDER};border-radius:14px;padding:12px 14px">
      <div style="font-size:12px;color:${MUTED}">${escapeHtml(tile.label)}</div>
      <div style="font-size:24px;font-weight:700;color:${INK};margin-top:2px">${escapeHtml(tile.value)}</div>
      <div style="font-size:11px;color:${INK};margin-top:2px">${escapeHtml(tile.delta || ' ')}</div>
      <div style="font-size:11px;color:${MUTED};margin-top:2px">${escapeHtml(tile.hint)}</div>
    </div>
  </td>`;
}

function sectionTitle(text) {
  return `<h2 style="font-size:16px;margin:28px 0 8px;color:${INK}">${escapeHtml(text)}</h2>`;
}

const TH = `style="text-align:left;padding:6px 8px;font-size:12px;font-weight:600;color:${MUTED};border-bottom:1px solid ${BORDER}"`;
const TD = `style="padding:6px 8px;font-size:13px;color:${INK};border-bottom:1px solid ${BORDER}"`;
const TD_NUM = `style="padding:6px 8px;font-size:13px;color:${INK};border-bottom:1px solid ${BORDER};text-align:right"`;

function buildWeeklyReportHtml(report) {
  const tiles = report.tiles;
  const tileRows = [tiles.slice(0, 3), tiles.slice(3, 6)]
    .map((row) => `<tr>${row.map(tileCell).join('')}</tr>`)
    .join('');

  const accounting = report.accounting
    ? `<p style="font-size:13px;color:${INK};margin:0">
        <strong>${report.accounting.active}</strong> weekly actives:
        ${report.accounting.new} new, ${report.accounting.resurrected} resurrected,
        ${report.accounting.retained} retained · ${report.accounting.churned ?? '—'} churned
        from the week before.
      </p>`
    : `<p style="font-size:13px;color:${MUTED}">No complete drop week yet.</p>`;

  const retention = report.retentionAverage.length
    ? `<table style="border-collapse:collapse;margin-top:4px"><tr>${report.retentionAverage
        .map((cell) => `<th ${TH}>Week ${cell.offset}</th>`)
        .join('')}</tr><tr>${report.retentionAverage
        .map((cell) => `<td ${TD_NUM}>${pct(cell.rate)}</td>`)
        .join('')}</tr></table>
      <p style="font-size:11px;color:${MUTED};margin:6px 0 0">Share of each join cohort active N drops later, weighted by cohort size, finished weeks only.</p>`
    : `<p style="font-size:13px;color:${MUTED}">Not enough cohorts yet.</p>`;

  const cityRows = report.cities
    .map((city) => {
      if (city.error) {
        return `<tr><td ${TD}>${escapeHtml(city.name)}</td><td ${TD} colspan="6">Could not load (${escapeHtml(city.error)})</td></tr>`;
      }
      const name = `${escapeHtml(city.name)}${city.launchDate ? `<div style="font-size:11px;color:${MUTED}">from ${escapeHtml(shortDate(city.launchDate))}</div>` : ''}`;
      if (city.notStarted) {
        return `<tr><td ${TD}>${name}</td><td ${TD} colspan="6" style="color:${MUTED}">Counting starts at launch</td></tr>`;
      }
      return `<tr>
        <td ${TD}>${name}</td>
        <td ${TD_NUM}>${city.weeklyActive ?? 0}<div style="font-size:11px;color:${MUTED}">${escapeHtml(city.weeklyActiveDelta || '')}</div></td>
        <td ${TD_NUM}>${city.newMembers ?? 0}</td>
        <td ${TD_NUM}>${pct(city.week1Retention)}</td>
        <td ${TD_NUM}>${pct(city.planRate)}</td>
        <td ${TD_NUM}>${city.landingViews ?? '—'}</td>
        <td ${TD_NUM}>${city.waitlistSignups ?? '—'}</td>
      </tr>`;
    })
    .join('');

  const landingTotals = report.landing?.totals;
  const landing = landingTotals
    ? `<p style="font-size:13px;color:${INK};margin:0">
        ${landingTotals.views} landing views from ${landingTotals.uniqueVisitors} visitors ·
        ${landingTotals.waitlistSignups} waitlist signups · ${landingTotals.storeClicks} store clicks.
      </p>`
    : `<p style="font-size:13px;color:${MUTED}">Landing data unavailable.</p>`;

  const notes = [
    report.failedCities.length
      ? `Missing from these numbers: ${report.failedCities.map((city) => city.cityDisplayName).join(', ')} (failed to load).`
      : null,
    report.preLaunchMembers
      ? `${report.preLaunchMembers} people who joined before their city's launch date are not in cohorts.`
      : null,
  ].filter(Boolean);

  return `<!doctype html><html><body style="margin:0;background:#F5F4F2">
<div style="max-width:680px;margin:0 auto;padding:24px 16px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK}">
  <div style="background:#fff;border-radius:22px;padding:24px">
    <div style="font-size:12px;font-weight:700;color:${ACCENT}">Just Go · Weekly report</div>
    <h1 style="font-size:22px;margin:6px 0 4px">Drop week ${escapeHtml(report.period)}</h1>
    <p style="font-size:13px;color:${MUTED};margin:0">All cities · ${report.totalMembers} members to date · vs the week before</p>

    <table style="width:100%;border-collapse:collapse;margin-top:16px">${tileRows}</table>

    ${sectionTitle('Where the week’s actives came from')}
    ${accounting}

    ${sectionTitle('Cohort retention')}
    ${retention}

    ${sectionTitle('By city')}
    <table style="width:100%;border-collapse:collapse">
      <tr><th ${TH}>City</th><th ${TH}>Weekly actives</th><th ${TH}>New</th><th ${TH}>Week-1</th><th ${TH}>Plan rate</th><th ${TH}>Landing views</th><th ${TH}>Waitlist</th></tr>
      ${cityRows || `<tr><td ${TD} colspan="7">No Pivot cities.</td></tr>`}
    </table>

    ${sectionTitle('Landing')}
    ${landing}

    ${notes.length ? `<p style="font-size:12px;color:${MUTED};margin:20px 0 0">${notes.map(escapeHtml).join('<br>')}</p>` : ''}

    <p style="margin:24px 0 0"><a href="${escapeHtml(report.dashboardUrl)}" style="display:inline-block;padding:12px 20px;background:${ACCENT};color:#fff;text-decoration:none;font-weight:600;border-radius:999px">Open Growth dashboard</a></p>
  </div>
  <p style="font-size:11px;color:${MUTED};text-align:center;margin:16px 0 0">Sent to Meridian platform admins. Definitions: Growth → Overview → “How these are calculated”.</p>
</div></body></html>`;
}

function buildWeeklyReportText(report) {
  const lines = [
    `Just Go weekly report · drop week ${report.period}`,
    `All cities · ${report.totalMembers} members to date`,
    '',
    ...report.tiles.map((tile) => `${tile.label}: ${tile.value}${tile.delta ? ` (${tile.delta})` : ''}`),
    '',
  ];
  if (report.accounting) {
    lines.push(
      `Actives: ${report.accounting.new} new, ${report.accounting.resurrected} resurrected, ${report.accounting.retained} retained · ${report.accounting.churned ?? '—'} churned`,
    );
  }
  if (report.retentionAverage.length) {
    lines.push(`Retention: ${report.retentionAverage.map((cell) => `W${cell.offset} ${pct(cell.rate)}`).join(' · ')}`);
  }
  lines.push('', 'By city:');
  report.cities.forEach((city) => {
    if (city.error) lines.push(`- ${city.name}: could not load`);
    else if (city.notStarted) lines.push(`- ${city.name}: counting starts at launch`);
    else {
      lines.push(
        `- ${city.name}: ${city.weeklyActive} weekly actives, ${city.newMembers} new, week-1 ${pct(city.week1Retention)}, plan rate ${pct(city.planRate)}`,
      );
    }
  });
  if (report.landing?.totals) {
    const totals = report.landing.totals;
    lines.push('', `Landing: ${totals.views} views, ${totals.waitlistSignups} waitlist signups, ${totals.storeClicks} store clicks`);
  }
  lines.push('', `Dashboard: ${report.dashboardUrl}`);
  return lines.join('\n');
}

/** The signed-in admin's email, for "send a test to me". */
async function resolveRequesterEmail(req) {
  const globalUserId = req?.user?.globalUserId;
  if (!globalUserId) return null;
  const { GlobalUser } = getGlobalModels(req, 'GlobalUser');
  const user = await GlobalUser.findById(globalUserId).select('email').lean();
  return user?.email ? String(user.email).trim().toLowerCase() : null;
}

function normalizeRecipients(list) {
  return [...new Set((list || [])
    .map((email) => String(email || '').trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];
}

/**
 * Build and (unless `dryRun`) send the report.
 * Recipients: `to` when given, otherwise every platform admin.
 * @returns {{ data?: object, error?: string, status?: number, code?: string }}
 */
async function sendWeeklyReport(req, { now = new Date(), to = null, dryRun = false } = {}) {
  const recipients = to ? normalizeRecipients(to) : await resolveAdminEmails(req);
  if (!recipients.length) {
    return { error: 'No recipients for the weekly report.', status: 400, code: 'NO_RECIPIENTS' };
  }

  const report = await buildWeeklyReport(req, { now });
  const html = buildWeeklyReportHtml(report);
  const text = buildWeeklyReportText(report);
  const base = { subject: report.subject, period: report.period, week: report.week, recipients };
  if (dryRun) return { data: { ...base, sent: false, html, text, report } };

  const resend = getResend();
  if (!resend) {
    return { error: 'Email is not configured (RESEND_API_KEY).', status: 503, code: 'EMAIL_UNAVAILABLE' };
  }
  const response = await resend.emails.send({ from: FROM, to: recipients, subject: report.subject, html, text });
  if (response?.error) {
    return {
      error: response.error.message || 'The email provider rejected the weekly report.',
      status: 502,
      code: 'SEND_FAILED',
    };
  }
  return { data: { ...base, sent: true, emailId: response?.data?.id || null } };
}

module.exports = {
  buildWeeklyReport,
  buildWeeklyReportHtml,
  buildWeeklyReportText,
  resolveRequesterEmail,
  sendWeeklyReport,
};
