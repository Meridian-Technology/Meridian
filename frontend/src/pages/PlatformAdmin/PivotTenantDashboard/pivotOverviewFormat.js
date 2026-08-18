export function formatRate(rate) {
  if (rate == null || Number.isNaN(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}

export function deltaFor(vsPrevWeek, key) {
  const row = vsPrevWeek?.[key];
  if (!row || typeof row.delta !== 'number') return null;
  return row.delta;
}

export function formatDelta(delta) {
  if (delta == null) return null;
  if (delta === 0) return 'flat vs prev';
  return `${delta > 0 ? '+' : ''}${delta} vs prev`;
}

export function ratePointsDelta(vsPrevWeek, key) {
  const row = vsPrevWeek?.[key];
  if (!row || row.current == null || row.previous == null || row.delta == null) {
    return null;
  }
  const points = Math.round(row.delta * 1000) / 10;
  if (points === 0) return 'flat';
  return `${points > 0 ? '+' : ''}${points}pp`;
}

/** One-letter weekday caption; Thursday → R (MTWRFSS). */
export function weekdayInitial(weekday, dateIso) {
  const raw = String(weekday || '').trim().toLowerCase();
  if (raw.startsWith('thu') || raw === 'r') return 'R';
  if (raw.startsWith('mon') || raw === 'm') return 'M';
  if (raw.startsWith('tue') || raw === 't') return 'T';
  if (raw.startsWith('wed') || raw === 'w') return 'W';
  if (raw.startsWith('fri') || raw === 'f') return 'F';
  if (raw.startsWith('sat') || raw.startsWith('sun') || raw === 's') return 'S';

  if (dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    const day = new Date(`${dateIso}T12:00:00Z`).getUTCDay();
    return ['S', 'M', 'T', 'W', 'R', 'F', 'S'][day] || '·';
  }
  return '·';
}
