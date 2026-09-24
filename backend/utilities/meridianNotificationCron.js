const WEEKDAY_INDEX = Object.freeze({
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
});

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

function parseCronExpression(expression) {
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
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek,
  };
}

function validateThirtyMinuteCron(expression) {
  const parsed = parseCronExpression(expression);
  if (parsed.error) return parsed;
  for (const minute of parsed.minute) {
    if (minute !== 0 && minute !== 30) {
      return { error: 'scheduleCron minute must be 0 or 30' };
    }
  }
  return parsed;
}

function getZonedParts(date, timeZone) {
  const zone = String(timeZone || '').trim() || 'UTC';
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return getZonedParts(date, 'UTC');
  }

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  const weekdayLabel = String(parts.weekday || '').slice(0, 3).toLowerCase();
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);

  return {
    timeZone: zone,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
    weekday: WEEKDAY_INDEX[weekdayLabel] ?? 0,
  };
}

function floorToThirtyMinuteBucket(date, timeZone) {
  const parts = getZonedParts(date, timeZone);
  const bucketMinute = parts.minute < 30 ? 0 : 30;
  const bucket = { ...parts, minute: bucketMinute };
  const timeBucket = [
    String(bucket.year).padStart(4, '0'),
    '-',
    String(bucket.month).padStart(2, '0'),
    '-',
    String(bucket.day).padStart(2, '0'),
    'T',
    String(bucket.hour).padStart(2, '0'),
    ':',
    String(bucket.minute).padStart(2, '0'),
  ].join('');
  return { ...bucket, timeBucket };
}

function cronMatchesBucket(expression, bucket) {
  const parsed = validateThirtyMinuteCron(expression);
  if (!parsed.ok) return false;
  return (
    parsed.minute.has(bucket.minute)
    && parsed.hour.has(bucket.hour)
    && parsed.dayOfMonth.has(bucket.day)
    && parsed.month.has(bucket.month)
    && parsed.dayOfWeek.has(bucket.weekday)
  );
}

module.exports = {
  parseCronExpression,
  validateThirtyMinuteCron,
  getZonedParts,
  floorToThirtyMinuteBucket,
  cronMatchesBucket,
};
