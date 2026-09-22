export function mapMeridianDeliveriesToRecipients(deliveries = []) {
  return (Array.isArray(deliveries) ? deliveries : []).map((row) => ({
    userId: row.userId,
    name: row.name || null,
    username: row.username || null,
    product: row.product || 'legacy',
    deliveryStatus: row.deliveryStatus,
    error: row.error || null,
  }));
}

export function mapMeridianJobRunToHistoryItem(run) {
  const payload = run?.payload && typeof run.payload === 'object' ? run.payload : {};
  const summary = run?.summary && typeof run.summary === 'object' ? run.summary : {};
  const lastError = run?.lastError ? String(run.lastError) : null;
  const dryRun = payload.dryRun === true || run?.status === 'preview';
  const title = payload.pushTitle
    || (dryRun ? 'Weekly drop preview' : 'Weekly drop');

  return {
    historyId: `meridian:${run.id}`,
    source: 'meridian',
    meridianJobRunId: run.id,
    runKey: run.runKey || null,
    status: run.status,
    batchWeek: payload.batchWeek || null,
    title,
    createdAt: run.finishedAt || run.createdAt,
    accepted: Number(summary.accepted) || 0,
    failed: Number(summary.failed) || 0,
    attempted: Number(summary.attempted) || 0,
    skipped: Number(summary.skipped) || 0,
    recipientOverflowCount: Number(summary.recipientOverflowCount) || 0,
    errors: lastError ? [lastError] : [],
    audience: null,
    recipients: undefined,
    pivotDropPushRunId: run.pivotDropPushRunId || null,
    dryRun,
  };
}

export function mapLegacyPushRunToHistoryItem(run) {
  const id = run?._id || run?.id;
  return {
    ...run,
    historyId: `legacy:${id}`,
    source: 'legacy',
    meridianJobRunId: null,
    _id: id,
    status: run?.failed ? 'failed' : 'succeeded',
  };
}

/**
 * Prefer meridian job runs. Keep legacy PivotDropPushRun rows that were never
 * dual-written (no matching pivotDropPushRunId on a job run).
 */
export function mergeWeeklyDropHistory({ meridianRuns = [], legacyRuns = [] } = {}) {
  const dualWrittenLegacyIds = new Set(
    (meridianRuns || [])
      .map((run) => run?.pivotDropPushRunId)
      .filter(Boolean)
      .map(String),
  );

  const meridianItems = (meridianRuns || [])
    .filter((run) => run?.id)
    .map(mapMeridianJobRunToHistoryItem);

  const legacyItems = (legacyRuns || [])
    .filter((run) => {
      const id = String(run?._id || run?.id || '');
      return Boolean(id) && !dualWrittenLegacyIds.has(id);
    })
    .map(mapLegacyPushRunToHistoryItem);

  return [...meridianItems, ...legacyItems].sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}
