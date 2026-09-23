export const DEFINITION_KEY_PATTERN = /^[a-z][a-z0-9_]{1,127}$/;

export const MINUTE_OPTIONS = [
  { value: '0', label: ':00' },
  { value: '30', label: ':30' },
  { value: '0,30', label: ':00 and :30' },
];

export const WEEKDAY_OPTIONS = [
  { value: '*', label: 'Every day' },
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

export const HOUR_OPTIONS = [
  { value: '8-21', label: '8:00 AM to 9:30 PM' },
  { value: '*', label: 'Every hour' },
  ...Array.from({ length: 24 }, (_, hour) => ({
    value: String(hour),
    label: `${String(hour).padStart(2, '0')}:xx`,
  })),
];

export const DAYTIME_CHECK_CRON = '0,30 8-21 * * *';

export function defaultScheduleParts() {
  return {
    minute: '0,30',
    hour: '8-21',
    dayOfMonth: '*',
    month: '*',
    weekday: '*',
  };
}

function parseListField(field, min, max) {
  const values = new Set();
  const tokens = String(field || '').split(',');
  if (!tokens.length || tokens.some((token) => !token)) return null;

  for (const token of tokens) {
    const stepMatch = token.match(/^(?:\*|(\d+)-(\d+))\/(\d+)$/);
    if (stepMatch) {
      const step = Number(stepMatch[3]);
      if (!Number.isInteger(step) || step < 1) return null;
      const start = stepMatch[1] == null ? min : Number(stepMatch[1]);
      const end = stepMatch[2] == null ? max : Number(stepMatch[2]);
      if (start < min || end > max || start > end) return null;
      for (let value = start; value <= end; value += step) values.add(value);
      continue;
    }

    const rangeMatch = token.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < min || end > max || start > end) return null;
      for (let value = start; value <= end; value += 1) values.add(value);
      continue;
    }

    if (token === '*') {
      for (let value = min; value <= max; value += 1) values.add(value);
      continue;
    }

    if (!/^\d+$/.test(token)) return null;
    const value = Number(token);
    if (value < min || value > max) return null;
    values.add(value);
  }

  return values;
}

function parseDayOfWeekField(field) {
  const normalized = String(field || '')
    .trim()
    .toLowerCase()
    .replace(/\bsun\b/g, '0')
    .replace(/\bmon\b/g, '1')
    .replace(/\btue\b/g, '2')
    .replace(/\bwed\b/g, '3')
    .replace(/\bthu\b/g, '4')
    .replace(/\bfri\b/g, '5')
    .replace(/\bsat\b/g, '6');
  const values = parseListField(normalized, 0, 7);
  if (!values) return null;
  if (values.has(7)) values.add(0);
  values.delete(7);
  return values;
}

export function parseCronExpression(expression) {
  const trimmed = typeof expression === 'string' ? expression.trim() : '';
  if (!trimmed) {
    return { error: 'scheduleCron is required' };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) {
    return { error: 'scheduleCron must have 5 fields (minute hour day month weekday)' };
  }

  const minute = parseListField(parts[0], 0, 59);
  const hour = parseListField(parts[1], 0, 23);
  const dayOfMonth = parseListField(parts[2], 1, 31);
  const month = parseListField(parts[3], 1, 12);
  const dayOfWeek = parseDayOfWeekField(parts[4]);

  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
    return { error: 'scheduleCron contains an invalid field' };
  }

  return {
    ok: true,
    normalized: parts.join(' '),
    parts: {
      minute: parts[0],
      hour: parts[1],
      dayOfMonth: parts[2],
      month: parts[3],
      weekday: parts[4],
    },
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek,
  };
}

export function validateThirtyMinuteCron(expression) {
  const parsed = parseCronExpression(expression);
  if (parsed.error) return parsed;
  for (const minute of parsed.minute) {
    if (minute !== 0 && minute !== 30) {
      return { error: 'scheduleCron minute must be 0 or 30' };
    }
  }
  return parsed;
}

export function isSingleClockSchedule(parts) {
  if (!parts) return false;
  const hour = Number(parts.hour);
  const singleHour = /^\d+$/.test(String(parts.hour)) && hour <= 23;
  const singleMinute = parts.minute === '0' || parts.minute === '30';
  const singleDay = parts.weekday === '*' || /^[0-6]$/.test(String(parts.weekday));
  const anyDayOfMonth = !parts.dayOfMonth || parts.dayOfMonth === '*';
  const anyMonth = !parts.month || parts.month === '*';
  return singleHour && singleMinute && singleDay && anyDayOfMonth && anyMonth;
}

export function isBuilderFriendlyCron(parts) {
  if (!parts) return false;
  const minuteOk = MINUTE_OPTIONS.some((option) => option.value === parts.minute)
    || parts.minute === '*/30';
  const hourOk = parts.hour === '*'
    || parts.hour === '8-21'
    || (/^\d+$/.test(parts.hour) && Number(parts.hour) <= 23);
  const dayOfMonthOk = parts.dayOfMonth === '*';
  const monthOk = parts.month === '*';
  const weekdayOk = parts.weekday === '*' || /^[0-6]$/.test(parts.weekday);
  return minuteOk && hourOk && dayOfMonthOk && monthOk && weekdayOk;
}

export function schedulePartsFromCron(expression) {
  const parsed = validateThirtyMinuteCron(expression);
  if (parsed.error) {
    return { error: parsed.error, parts: defaultScheduleParts(), advanced: true };
  }
  const parts = {
    ...parsed.parts,
    minute: parsed.parts.minute === '*/30' ? '0,30' : parsed.parts.minute,
  };
  return {
    ok: true,
    parts,
    advanced: !isBuilderFriendlyCron(parsed.parts),
    normalized: parsed.normalized,
  };
}

function formatClock(hour, minute) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/**
 * Plain-language schedule for the 30-minute slots this panel can store.
 * Repeating slots are checks. A single clock time is the send window.
 * Falls back to the raw expression when the shape is too specific to phrase.
 */
export function describeSchedule(expression) {
  const parsed = validateThirtyMinuteCron(expression);
  if (parsed.error) return String(expression || '').trim() || 'Unscheduled';

  const minutes = [...parsed.minute].sort((left, right) => left - right);
  const hours = [...parsed.hour].sort((left, right) => left - right);
  const days = [...parsed.dayOfWeek].sort((left, right) => left - right);
  const everyDay = days.length === 7;
  const everyHour = hours.length === 24;
  const onTheHalfHours = minutes.length === 2 && minutes[0] === 0 && minutes[1] === 30;
  const onTheHour = minutes.length === 1 && minutes[0] === 0;
  const onTheHalf = minutes.length === 1 && minutes[0] === 30;

  const daytime = hours.length === 14
    && hours[0] === 8
    && hours[hours.length - 1] === 21
    && hours.every((hour, index) => hour === 8 + index);
  if (everyDay && daytime && onTheHalfHours) {
    return 'Checks at :00 and :30, 8:00 AM to 9:30 PM';
  }
  if (everyDay && everyHour && onTheHalfHours) return 'Checks at :00 and :30';
  if (everyDay && everyHour && onTheHour) return 'Checks on the hour';
  if (everyDay && everyHour && onTheHalf) return 'Checks at :30';
  if (everyDay && hours.length === 1 && minutes.length === 1) {
    return `Every day at ${formatClock(hours[0], minutes[0])}`;
  }
  if (days.length === 1 && hours.length === 1 && minutes.length === 1) {
    const weekday = WEEKDAY_OPTIONS.find((option) => option.value === String(days[0]));
    return `${weekday?.label || 'That day'}s at ${formatClock(hours[0], minutes[0])}`;
  }
  return parsed.normalized;
}

export function cronFromScheduleParts(parts = defaultScheduleParts()) {
  return [
    parts.minute || '0,30',
    parts.hour || '*',
    parts.dayOfMonth || '*',
    parts.month || '*',
    parts.weekday || '*',
  ].join(' ');
}

export function parseTriggerConfigJson(text) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'triggerConfig must be a JSON object' };
    }
    return { ok: true, value: parsed };
  } catch {
    return { error: 'triggerConfig is not valid JSON' };
  }
}

export function stringifyTriggerConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) {
    return '';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

export function validateDefinitionKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!DEFINITION_KEY_PATTERN.test(key)) {
    return {
      error: 'definitionKey must be 2–128 chars, start with a letter, and use lowercase letters, digits, or underscore',
    };
  }
  return { ok: true, value: key };
}
