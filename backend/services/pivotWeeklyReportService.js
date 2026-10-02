/**
 * Weekly Just Go report email for platform admins: last complete drop week's
 * growth metrics across all cities, how that week's batch landed
 * (pivotWeeklyBatchQualityService.js), a per-city table, and the landing funnel.
 * Always sent to platform admins. Schedule it with an `admin_weekly_report`
 * notification schedule (meridianJobHandlers/adminWeeklyReport.js), or send it
 * from the fleet Growth page or `npm run report:weekly` (scripts/sendWeeklyReport.js).
 *
 * Metric definitions: utilities/pivotGrowthMetrics.js and
 * docs/pivot-growth-overview-metrics.md. Rendering: pivotWeeklyReportEmail.js
 * (preview it with `npm run preview:weekly-report`).
 */
const getGlobalModels = require('./getGlobalModelService');
const { getResend } = require('./resendClient');
const { resolveAdminEmails } = require('./pivotComputeAdminNotifyService');
const { getFleetGrowthOverview, getTenantGrowthOverview } = require('./pivotGrowthOverviewService');
const { getFleetLaunchStats } = require('./pivotLandingService');
const { getWeeklyBatchQuality } = require('./pivotWeeklyBatchQualityService');
const { getMergedTenants } = require('./tenantConfigService');
const { isPivotTenant } = require('./pivotReferralCodeService');
const { launchDateToUtc } = require('../utilities/pivotLaunchDate');
const { justGoPublicUrl } = require('../utilities/justGoPublicUrl');
const {
  buildPreheader,
  buildWeeklyReportHtml,
  buildWeeklyReportText,
} = require('./pivotWeeklyReportEmail');

const FROM = 'Just Go <support@meridian.study>';
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_COLUMNS = 5; // Week 0–4 in the email
const TREND_WEEKS = 8;
/** Same window as the dashboard's activation and week-1 headline numbers. */
const HEADLINE_COHORTS = 4;

function resolveFrontendBaseUrl() {
  const configured = typeof process.env.FRONTEND_URL === 'string' ? process.env.FRONTEND_URL.trim() : '';
  if (configured) return configured.replace(/\/$/, '');
  return process.env.NODE_ENV === 'production' ? 'https://www.meridian.study' : 'http://localhost:3000';
}

function addDays(day, days) {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function shortDate(day) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * People behind a cohort rate: of the `take` most recent cohorts whose week
 * `offset` has finished, how many joined and how many were active then. Uses
 * however many finished cohorts exist (up to `take`) so a young city still
 * shows its counts; `cohorts` says how many went in.
 */
function recentCohortCounts(table, offset, take = HEADLINE_COHORTS) {
  const eligible = (table?.cohorts || [])
    .filter((cohort) => cohort.size && cohort.cells?.[offset]?.complete)
    .slice(-take);
  if (!eligible.length) return null;
  const users = eligible.reduce((sum, cohort) => sum + cohort.size, 0);
  const active = eligible.reduce((sum, cohort) => sum + cohort.cells[offset].active, 0);
  return { active, users, rate: users ? active / users : null, cohorts: eligible.length };
}

/**
 * A city is in the report once it has launched: its landing page is switched
 * to `launched` and its launch date, if set, has arrived. Waitlist cities are
 * named in the footer and left out of every number.
 */
function isLaunchedCity(tenant, now) {
  if (tenant.landingMode !== 'launched') return false;
  const launchedAt = launchDateToUtc(tenant.pivotLaunchDate);
  return !launchedAt || launchedAt <= now;
}

async function resolveReportCities(req, now) {
  const pivotTenants = (await getMergedTenants(req)).filter(isPivotTenant);
  const launched = pivotTenants.filter((tenant) => isLaunchedCity(tenant, now));
  const launchedKeys = new Set(launched.map((tenant) => tenant.tenantKey));
  return {
    tenantKeys: [...launchedKeys],
    notLaunched: pivotTenants
      .filter((tenant) => !launchedKeys.has(tenant.tenantKey))
      .map((tenant) => tenant.location || tenant.name || tenant.tenantKey),
  };
}

function seriesRow(overview, week) {
  return (overview?.series || []).find((row) => row.week === week) || null;
}

function previousWeekRow(overview, week) {
  const series = overview?.series || [];
  const index = series.findIndex((row) => row.week === week);
  return index > 0 ? series[index - 1] : null;
}

/**
 * Gather the report for the last complete drop week. Every metric comes from
 * the same services as the Growth → Overview panels, so the email and the
 * dashboard agree.
 */
async function buildWeeklyReport(req, { now = new Date() } = {}) {
  const { tenantKeys, notLaunched } = await resolveReportCities(req, now);
  const { data: fleet } = await getFleetGrowthOverview(req, { now, tenantKeys });
  const week = fleet.lastCompleteWeek;
  const weekRow = seriesRow(fleet, week);
  const priorRow = previousWeekRow(fleet, week);
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
    const landingResult = await getFleetLaunchStats(req, { from: startDate, to: endDate, now, tenantKeys });
    landing = landingResult.error ? null : landingResult.data;
  }

  const cities = cityOverviews
    .map(({ city, overview, error }) => {
      if (!overview) {
        return { tenantKey: city.tenantKey, name: city.cityDisplayName, launchDate: city.launchDate || null, error };
      }
      const cityWeek = overview.lastCompleteWeek || week;
      const row = seriesRow(overview, cityWeek) || {};
      const prior = previousWeekRow(overview, cityWeek) || {};
      return {
        tenantKey: city.tenantKey,
        name: city.cityDisplayName,
        launchDate: city.launchDate || null,
        notStarted: Boolean(overview.launch && !overview.launch.started),
        weeklyActive: overview.headline?.weeklyActive?.value ?? row.weeklyActive ?? 0,
        weeklyActivePrevious: overview.headline?.weeklyActive?.previous ?? prior.weeklyActive ?? null,
        newMembers: overview.headline?.newMembers?.value ?? row.newMembers ?? 0,
        planners: row.planners ?? 0,
        week1: recentCohortCounts(overview.retention?.opened, 1),
      };
    })
    // Biggest live city first; cities without numbers go last.
    .sort((a, b) => {
      const rank = (city) => (city.error || city.notStarted ? 1 : 0);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return rank(a) ? 0 : (b.weeklyActive || 0) - (a.weeklyActive || 0);
    });

  const batch = startDate
    ? await getWeeklyBatchQuality(
      cities.filter((city) => !city.notStarted).map((city) => ({ tenantKey: city.tenantKey, name: city.name })),
      week,
    )
    : null;
  if (batch) {
    const withUrl = (card) => ({ ...card, url: justGoPublicUrl(`/events/${encodeURIComponent(card.eventId)}`, req) });
    batch.top = batch.top.map(withUrl);
    batch.misses = batch.misses.map(withUrl);
  }

  const accounting = (fleet.growthAccounting || []).find((row) => row.week === week) || null;
  const openedTable = fleet.retention?.opened;
  const activation = recentCohortCounts(openedTable, 0);
  const week1 = recentCohortCounts(openedTable, 1);
  const trend = (fleet.series || [])
    .filter((row) => row.complete !== false && row.week <= week)
    .slice(-TREND_WEEKS)
    .map((row) => ({ week: row.week, startDate: row.startDate, value: row.weeklyActive ?? 0 }))
    // Weeks before anyone opened a drop are pre-launch, not a flat line.
    .filter((point, index, points) => points.slice(0, index + 1).some((p) => p.value > 0));
  const dashboardUrl = `${resolveFrontendBaseUrl()}/platform-admin/pivot?page=2`;
  const period = startDate ? `${shortDate(startDate)} – ${shortDate(endDate)}`.toLowerCase() : week;
  const weeklyActive = startDate ? fleet.headline?.weeklyActive?.value ?? weekRow?.weeklyActive ?? 0 : null;
  const weeklyActivePrevious = fleet.headline?.weeklyActive?.previous ?? priorRow?.weeklyActive ?? null;

  const report = {
    week,
    startDate,
    endDate,
    period,
    generatedAt: new Date(now).toISOString(),
    totalMembers: fleet.totalMembers,
    preLaunchMembers: fleet.preLaunchMembers || 0,
    headline: fleet.headline,
    weeklyActive,
    weeklyActivePrevious,
    trend,
    accounting,
    activation,
    activationPrevious: fleet.headline?.activation?.previous ?? null,
    week1,
    week1Previous: fleet.headline?.week1Retention?.previous ?? null,
    cohortCount: Math.max(activation?.cohorts || 0, week1?.cohorts || 0) || HEADLINE_COHORTS,
    retentionAverage: (openedTable?.average || []).slice(0, RETENTION_COLUMNS),
    usage: weekRow
      ? {
          weeklyActive: weekRow.weeklyActive ?? 0,
          planners: weekRow.planners ?? 0,
          plannersPrevious: priorRow?.planners ?? null,
          plansSaved: weekRow.plansSaved ?? 0,
          plansSavedPrevious: priorRow?.plansSaved ?? null,
          ticketOpeners: weekRow.ticketOpeners ?? 0,
          ticketOpenersPrevious: priorRow?.ticketOpeners ?? null,
        }
      : null,
    landing: landing ? { totals: landing.totals } : null,
    batch,
    cities,
    failedCities: fleet.failedCities || [],
    notLaunchedCities: notLaunched,
    dashboardUrl,
  };
  report.preheader = buildPreheader(report);
  report.subject = weeklyActive == null
    ? `just go weekly · ${period}`
    : `just go weekly · ${period} · ${weeklyActive.toLocaleString('en-US')} ${weeklyActive === 1 ? 'active' : 'actives'}`;
  return report;
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
