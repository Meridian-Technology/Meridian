const { isValidIsoWeek } = require('./pivotIsoWeek');

/** Pilot suggestion when a pivot tenant has no drop config stored yet (not a runtime constant). */
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

function isoWeekToMondayUtc(batchWeek) {
  if (!isValidIsoWeek(batchWeek)) {
    throw new Error(`Invalid batchWeek "${batchWeek}" — expected YYYY-Www`);
  }

  const [, yearStr, weekStr] = batchWeek.match(/^(\d{4})-W(\d{2})$/);
  const year = Number(yearStr);
  const week = Number(weekStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4IsoDay = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4IsoDay + 1 + (week - 1) * 7);
  return monday;
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
  isoWeekToMondayUtc,
  zonedLocalToUtc,
};
