const {
  isoWeekToMondayUtc,
  toIsoWeek,
  toIsoWeekInTimeZone,
  shiftIsoWeek,
  isValidIsoWeek,
} = require('./pivotIsoWeek');
const PIVOT_DROP_PILOT_DEFAULTS = Object.freeze({
  pivotDropTimezone: 'America/New_York',
  pivotDropDayOfWeek: 4,
  pivotDropHour: 18,
  pivotDropMinute: 0,
});

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isPivotTenant(tenant = {}) {
  return tenant.pivotPilot === true || tenant.tenantType === 'pivot';
}

function normalizeDropMinute(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(59, Math.max(0, Math.trunc(parsed)));
}

function normalizeDropHour(value, fallback = 18) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(23, Math.max(0, Math.trunc(parsed)));
}

function normalizeDropDayOfWeek(value, fallback = 4) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(6, Math.max(0, Math.trunc(parsed)));
}

function resolvePivotDropConfig(tenant = {}) {
  const timezone = String(tenant.pivotDropTimezone || '').trim();
  const hasStoredConfig =
    Boolean(timezone) &&
    tenant.pivotDropDayOfWeek !== undefined &&
    tenant.pivotDropHour !== undefined;

  const defaults = hasStoredConfig
    ? {
        pivotDropTimezone: timezone,
        pivotDropDayOfWeek: normalizeDropDayOfWeek(tenant.pivotDropDayOfWeek),
        pivotDropHour: normalizeDropHour(tenant.pivotDropHour),
        pivotDropMinute: normalizeDropMinute(tenant.pivotDropMinute, 0),
      }
    : { ...PIVOT_DROP_PILOT_DEFAULTS };

  return {
    timezone: defaults.pivotDropTimezone,
    dayOfWeek: defaults.pivotDropDayOfWeek,
    hour: defaults.pivotDropHour,
    minute: defaults.pivotDropMinute,
    overrides: Array.isArray(tenant.pivotDropOverrides) ? tenant.pivotDropOverrides : [],
    usingPilotDefaults: !hasStoredConfig,
  };
}

function daysFromIsoMonday(dayOfWeek) {
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
}

function getTimeZoneOffsetMs(timeZone, date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return asUtc - date.getTime();
}

function zonedLocalToUtc({ year, month, day, hour, minute, timeZone }) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstPass = new Date(utcGuess - getTimeZoneOffsetMs(timeZone, new Date(utcGuess)));
  return new Date(utcGuess - getTimeZoneOffsetMs(timeZone, firstPass));
}

function resolvePivotDropInstant(tenant, batchWeek, now = new Date()) {
  if (!isPivotTenant(tenant)) {
    throw new Error(`Tenant "${tenant?.tenantKey || 'unknown'}" is not a pivot city`);
  }

  const config = resolvePivotDropConfig(tenant);
  const override = config.overrides.find((row) => row?.batchWeek === batchWeek);
  const schedule = override
    ? {
        dayOfWeek: normalizeDropDayOfWeek(override.dayOfWeek, config.dayOfWeek),
        hour: normalizeDropHour(override.hour, config.hour),
        minute: normalizeDropMinute(override.minute, config.minute),
        source: 'override',
      }
    : {
        dayOfWeek: config.dayOfWeek,
        hour: config.hour,
        minute: config.minute,
        source: 'default',
      };

  const monday = isoWeekToMondayUtc(batchWeek);
  const dropDate = new Date(monday);
  dropDate.setUTCDate(monday.getUTCDate() + daysFromIsoMonday(schedule.dayOfWeek));

  const dropAt = zonedLocalToUtc({
    year: dropDate.getUTCFullYear(),
    month: dropDate.getUTCMonth() + 1,
    day: dropDate.getUTCDate(),
    hour: schedule.hour,
    minute: schedule.minute,
    timeZone: config.timezone,
  });

  return {
    dropAt,
    batchWeek,
    timezone: config.timezone,
    dayOfWeek: schedule.dayOfWeek,
    hour: schedule.hour,
    minute: schedule.minute,
    source: schedule.source,
    usingPilotDefaults: config.usingPilotDefaults,
    resolvedAt: now,
  };
}

function formatPivotDropInstant(dropAt, timeZone) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(dropAt);

  const datePart = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
  }).format(dropAt);

  const timePart = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(dropAt);

  const zonePart = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
  })
    .formatToParts(dropAt)
    .find((part) => part.type === 'timeZoneName')?.value;

  return `${weekday} ${datePart}, ${timePart}${zonePart ? ` ${zonePart}` : ''}`;
}

function resolvePivotConsumerWeek(tenant, now = new Date()) {
  const config = resolvePivotDropConfig(tenant);
  const timeZone = config.timezone || 'UTC';
  if (!tenant || !isPivotTenant(tenant)) {
    return toIsoWeek(now);
  }
  return toIsoWeekInTimeZone(now, timeZone);
}

/**
 * Consumer-facing batchWeek when the client omits ?batchWeek.
 *
 * Stays on the previous ISO week until the current week's drop instant passes
 * (same gate as ops live week). Calendar week alone must not advance the deck.
 */
function resolvePivotLiveBatchWeek(tenant, now = new Date()) {
  return resolvePivotOpsLiveWeek(tenant, now);
}

/** True while the tenant-local calendar week's drop is still in the future. */
function resolvePivotDropPendingForCalendarWeek(tenant, now = new Date()) {
  if (!tenant || !isPivotTenant(tenant)) {
    return false;
  }

  try {
    const calendarWeek = resolvePivotConsumerWeek(tenant, now);
    const currentDrop = resolvePivotDropInstant(tenant, calendarWeek, now);
    return currentDrop.dropAt.getTime() > now.getTime();
  } catch {
    return false;
  }
}

/**
 * ISO week whose drop instant powers consumer countdown / next-drop copy.
 * Pre-drop: calendar week (upcoming Thursday). Post-drop: next calendar week.
 */
function resolvePivotUpcomingDropBatchWeek(tenant, now = new Date()) {
  const calendarWeek = resolvePivotConsumerWeek(tenant, now);
  if (resolvePivotDropPendingForCalendarWeek(tenant, now)) {
    return calendarWeek;
  }
  return shiftIsoWeek(calendarWeek, 1) || calendarWeek;
}

/** Ops / Lab: which ISO week is "live" vs being curated before the drop. */
function resolvePivotOpsLiveWeek(tenant, now = new Date()) {
  const currentWeek = resolvePivotConsumerWeek(tenant, now);
  if (!tenant || !isPivotTenant(tenant)) {
    return currentWeek;
  }

  try {
    const currentDrop = resolvePivotDropInstant(tenant, currentWeek, now);
    const dropPending = currentDrop.dropAt.getTime() > now.getTime();
    return dropPending ? shiftIsoWeek(currentWeek, -1) : currentWeek;
  } catch {
    return currentWeek;
  }
}

/**
 * Ops / admin anchor weeks aligned to the drop cycle (Thu → Wed windows).
 *
 * - liveWeek: batch whose drop cycle contains now (resolvePivotOpsLiveWeek)
 * - curateWeek: next batch to prepare / pre-release (liveWeek + 1)
 * - currentWeek: tenant-local calendar ISO week (may differ Mon–Wed pre-drop)
 */
function resolvePivotStageAnchors(tenant, now = new Date()) {
  const config = resolvePivotDropConfig(tenant);
  const currentWeek = resolvePivotConsumerWeek(tenant, now);
  const liveWeek = resolvePivotOpsLiveWeek(tenant, now);
  let dropPending = false;
  let currentWeekDropAt = null;

  if (tenant && isPivotTenant(tenant)) {
    try {
      const currentDrop = resolvePivotDropInstant(tenant, currentWeek, now);
      currentWeekDropAt = currentDrop.dropAt.toISOString();
      dropPending = currentDrop.dropAt.getTime() > now.getTime();
    } catch {
      dropPending = false;
    }
  }

  const curateWeek = shiftIsoWeek(liveWeek, 1);

  return {
    currentWeek,
    liveWeek,
    curateWeek,
    postMortemWeek: shiftIsoWeek(liveWeek, -1),
    dropPending,
    currentWeekDropAt,
    feedWeek: currentWeek,
    timeZone: config.timezone,
  };
}

/**
 * Curation stage for a batchWeek relative to the drop-cycle live batch.
 */
function resolveStageForBatchWeek(batchWeek, tenant, now = new Date()) {
  if (!isValidIsoWeek(batchWeek)) return 'curate';
  const liveWeek = resolvePivotOpsLiveWeek(tenant, now);
  if (batchWeek === liveWeek) return 'live';
  if (batchWeek < liveWeek) return 'post-mortem';
  return 'curate';
}

function describePivotBatchWeekResolution(tenant, now = new Date(), requestedBatchWeek) {
  const config = resolvePivotDropConfig(tenant);
  const calendarIsoWeek = resolvePivotConsumerWeek(tenant, now);
  const consumerDefaultWeek = resolvePivotLiveBatchWeek(tenant, now);
  const opsLiveWeek = resolvePivotOpsLiveWeek(tenant, now);
  const trimmedRequest =
    typeof requestedBatchWeek === 'string' ? requestedBatchWeek.trim() : '';
  const resolvedBatchWeek = trimmedRequest || consumerDefaultWeek;

  let dropPending = null;
  let nextDropAt = null;
  if (tenant && isPivotTenant(tenant)) {
    try {
      dropPending = resolvePivotDropPendingForCalendarWeek(tenant, now);
      const upcomingDropWeek = resolvePivotUpcomingDropBatchWeek(tenant, now);
      const upcomingDrop = resolvePivotDropInstant(tenant, upcomingDropWeek, now);
      nextDropAt = upcomingDrop.dropAt.toISOString();
    } catch {
      dropPending = null;
    }
  }

  return {
    requestedBatchWeek: trimmedRequest || null,
    resolvedBatchWeek,
    batchWeekSource: trimmedRequest ? 'query' : 'consumer_week',
    calendarIsoWeek,
    consumerDefaultWeek,
    /** @deprecated use consumerDefaultWeek — kept for log compatibility */
    liveDropWeek: consumerDefaultWeek,
    opsLiveWeek,
    dropPending,
    nextDropAt,
  };
}

function describePivotDropSchedule(resolved) {
  const dayLabel = DAY_NAMES[resolved.dayOfWeek] || `day ${resolved.dayOfWeek}`;
  const minuteLabel = String(resolved.minute).padStart(2, '0');
  const sourceLabel = resolved.source === 'override' ? 'override' : 'tenant default';
  const localTime = `${dayLabel} ${resolved.hour}:${minuteLabel} ${resolved.timezone}`;
  const formatted = formatPivotDropInstant(resolved.dropAt, resolved.timezone);

  return {
    localTime,
    formatted,
    sourceLabel,
  };
}

module.exports = {
  PIVOT_DROP_PILOT_DEFAULTS,
  DAY_NAMES,
  isPivotTenant,
  resolvePivotDropConfig,
  resolvePivotDropInstant,
  formatPivotDropInstant,
  describePivotDropSchedule,
  describePivotBatchWeekResolution,
  resolvePivotConsumerWeek,
  resolvePivotLiveBatchWeek,
  resolvePivotDropPendingForCalendarWeek,
  resolvePivotUpcomingDropBatchWeek,
  resolvePivotOpsLiveWeek,
  resolvePivotStageAnchors,
  resolveStageForBatchWeek,
  isoWeekToMondayUtc,
  zonedLocalToUtc,
};
