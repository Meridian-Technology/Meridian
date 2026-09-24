const { getZonedParts } = require('./meridianNotificationCron');

/** Local hours when a user push must not go out. 22:00 until 08:00. */
const DEFAULT_QUIET_HOURS = Object.freeze({
  startHour: 22,
  endHour: 8,
});

/** Repeating checks. Hours 8 through 21, on the hour and half hour. */
const DAYTIME_CHECK_CRON = '0,30 8-21 * * *';
const ALL_HOURS_CHECK_CRON = '0,30 * * * *';

function clampHour(value, fallback) {
  const hour = Number(value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return fallback;
  return hour;
}

function resolveQuietHours(triggerConfig) {
  const raw = triggerConfig && typeof triggerConfig.quietHours === 'object'
    ? triggerConfig.quietHours
    : null;
  return {
    startHour: clampHour(raw?.startHour, DEFAULT_QUIET_HOURS.startHour),
    endHour: clampHour(raw?.endHour, DEFAULT_QUIET_HOURS.endHour),
  };
}

/**
 * Milliseconds until quiet hours end. 0 means a send is allowed.
 * Equal start and end hours disable the window.
 * A window that passes midnight (22 → 8) covers the night and early morning.
 */
function quietHoursDelayMs(date, timeZone, quietHours = DEFAULT_QUIET_HOURS) {
  const startHour = clampHour(quietHours?.startHour, DEFAULT_QUIET_HOURS.startHour);
  const endHour = clampHour(quietHours?.endHour, DEFAULT_QUIET_HOURS.endHour);
  if (startHour === endHour) return 0;

  const parts = getZonedParts(date, timeZone);
  const minutesNow = parts.hour * 60 + parts.minute;
  const start = startHour * 60;
  const end = endHour * 60;
  const inQuiet = startHour > endHour
    ? (minutesNow >= start || minutesNow < end)
    : (minutesNow >= start && minutesNow < end);
  if (!inQuiet) return 0;

  let until = end - minutesNow;
  if (until <= 0) until += 24 * 60;
  return Math.max(until, 1) * 60 * 1000;
}

function quietHoursSendBlock({
  now = new Date(),
  timeZone,
  triggerConfig,
} = {}) {
  const quietHours = resolveQuietHours(triggerConfig);
  const retryAfterMs = quietHoursDelayMs(now, timeZone, quietHours);
  if (!retryAfterMs) return null;
  return {
    status: 409,
    code: 'QUIET_HOURS',
    error: 'Quiet hours. This push waits until the overnight window ends.',
    retryAfterMs,
  };
}

/**
 * Send-time gate. Unit tests skip it unless enforceQuietHours is set,
 * so suites that send at the current time stay stable overnight.
 */
function quietHoursSendBlockForDelivery(options = {}, fields = {}) {
  if (options.enforceQuietHours !== true && process.env.NODE_ENV === 'test') return null;
  return quietHoursSendBlock(fields);
}

async function alignDaytimeCheckCron(doc) {
  if (!doc || doc.scheduleCron !== ALL_HOURS_CHECK_CRON) return doc;
  doc.scheduleCron = DAYTIME_CHECK_CRON;
  await doc.save();
  return doc;
}

module.exports = {
  DEFAULT_QUIET_HOURS,
  DAYTIME_CHECK_CRON,
  ALL_HOURS_CHECK_CRON,
  resolveQuietHours,
  quietHoursDelayMs,
  quietHoursSendBlock,
  quietHoursSendBlockForDelivery,
  alignDaytimeCheckCron,
};
