import { SCHEDULE_HANDLER_LABELS } from './notificationScheduleCopy';

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function isDryRun(run) {
  return run?.status === 'preview' || run?.payload?.dryRun === true;
}

/**
 * Totals and chart rows for the latest notification runs.
 * Sent counts accepted pushes. A failed run with no per-user rows still counts as one failure.
 * Dry runs are excluded from sent.
 */
export function summarizeNotificationActivity(runs = [], { now = new Date(), days = 14 } = {}) {
  const totals = { sent: 0, failed: 0, dryRuns: 0 };
  const sentByHandler = new Map();
  const sentByDay = new Map();

  runs.forEach((run) => {
    const summary = run?.summary || {};
    const accepted = Number(summary.accepted) || 0;
    const failedDeliveries = Number(summary.failed) || 0;
    const dry = isDryRun(run);
    if (dry) {
      totals.dryRuns += 1;
    } else {
      totals.sent += accepted;
    }
    totals.failed += failedDeliveries;
    if (!dry && run?.status === 'failed' && failedDeliveries === 0) {
      totals.failed += 1;
    }

    if (dry) return;

    const handler = run?.type || 'other';
    sentByHandler.set(handler, (sentByHandler.get(handler) || 0) + accepted);

    const key = dayKey(run?.finishedAt || run?.updatedAt || run?.createdAt);
    if (key) sentByDay.set(key, (sentByDay.get(key) || 0) + accepted);
  });

  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
  const heat = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(end.getTime() - offset * DAY_MS);
    const key = dayKey(date);
    const sent = sentByDay.get(key) || 0;
    const label = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    heat.push({
      key,
      label: String(date.getUTCDate()),
      value: sent,
      title: `${label}: ${sent} sent`,
    });
  }

  const bars = [...sentByHandler.entries()]
    .map(([handler, sent]) => ({
      key: handler,
      label: SCHEDULE_HANDLER_LABELS[handler] || handler,
      value: sent,
    }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));

  return { totals, heat, bars };
}
