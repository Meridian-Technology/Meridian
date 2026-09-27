const getModels = require('./getModelService');
const getGlobalModels = require('./getGlobalModelService');

const SCORE_VERSION = 2;
const MAX_BATCHES = 8;

function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function round(value) { return Math.round(value * 1000) / 1000; }

/** Published share is the quality bar. Featured/promoted share measures editorial strength. */
function calculateSourceScore(events, weeks) {
  const allowed = new Set(weeks);
  const byWeek = new Map();
  const byEntrypoint = new Map();
  for (const event of events) {
    const pivot = event.customFields?.pivot || {};
    if (!allowed.has(pivot.batchWeek) || !['staged', 'published'].includes(pivot.ingestStatus)) continue;
    if (!byWeek.has(pivot.batchWeek)) byWeek.set(pivot.batchWeek, { eligible: 0, published: 0, featured: 0 });
    const row = byWeek.get(pivot.batchWeek);
    row.eligible += 1;
    const featured = pivot.ingestStatus === 'published'
      && (pivot.featured === true || ['promote', 'strong_promote', 'must_show'].includes(pivot.rankingOverride?.tier));
    if (pivot.ingestStatus === 'published') {
      row.published += 1;
      if (featured) row.featured += 1;
    }
    const entrypointIds = [...new Set([
      ...(Array.isArray(pivot.observedEntrypointIds) ? pivot.observedEntrypointIds : []),
      pivot.entrypointId,
    ].filter(Boolean).map(String))];
    for (const id of entrypointIds) {
      if (!byEntrypoint.has(id)) byEntrypoint.set(id, { eligible: 0, published: 0, featured: 0 });
      const entrypoint = byEntrypoint.get(id);
      entrypoint.eligible += 1;
      if (pivot.ingestStatus === 'published') entrypoint.published += 1;
      if (featured) entrypoint.featured += 1;
    }
  }
  const rows = [...byWeek.entries()].sort(([a], [b]) => b.localeCompare(a));
  const eligible = rows.reduce((sum, [, row]) => sum + row.eligible, 0);
  const published = rows.reduce((sum, [, row]) => sum + row.published, 0);
  const featured = rows.reduce((sum, [, row]) => sum + row.featured, 0);
  const breakdown = {
    eligibleCount: eligible,
    publishedCount: published,
    featuredCount: featured,
    publishRate: eligible ? round(published / eligible) : null,
    featuredRate: published ? round(featured / published) : null,
    history: rows.map(([batchWeek, row]) => ({ batchWeek, ...row,
      publishRate: round(row.published / row.eligible) })),
    entrypoints: Object.fromEntries(byEntrypoint),
    windowBatchCount: weeks.length,
  };
  if (!eligible) return { quality: null, reputation: null, sampleSize: 0,
    publishedCount: 0, batchCount: 0, version: SCORE_VERSION, breakdown };
  let weightedPublished = 0;
  let weightedEligible = 0;
  let weightedFeatured = 0;
  const rates = [];
  rows.forEach(([, row], index) => {
    const weight = Math.pow(0.8, index);
    weightedPublished += weight * row.published;
    weightedEligible += weight * row.eligible;
    weightedFeatured += weight * row.featured;
    rates.push(row.published / row.eligible);
  });
  const publishRate = (weightedPublished + 4 * 0.5) / (weightedEligible + 4);
  const featuredRate = (weightedFeatured + 8 * 0.1) / (weightedPublished + 8);
  const volume = Math.min(1, Math.log1p(weightedPublished) / Math.log(21));
  const quality = clamp01(0.65 * publishRate + 0.25 * featuredRate + 0.1 * volume);
  const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  const consistency = clamp01((1 - rates.reduce((sum, rate) => sum + Math.abs(rate - mean), 0) / rates.length)
    * Math.min(1, rows.length / 3));
  const confidence = (published / (published + 8)) * Math.min(1, rows.length / 3);
  const reputation = clamp01(0.7 * quality + 0.15 * consistency + 0.15 * confidence);
  breakdown.components = {
    publishRate: round(publishRate),
    featuredRate: round(featuredRate),
    volume: round(volume),
    consistency: round(consistency),
    confidence: round(confidence),
  };
  return { quality: round(quality), reputation: round(reputation), sampleSize: eligible,
    publishedCount: published, batchCount: rows.length, version: SCORE_VERSION, breakdown };
}

async function recomputeTenantSourceScores(req, tenantReq, tenantKey, now = new Date()) {
  const { Event, PivotBatch } = getModels(tenantReq, 'Event', 'PivotBatch');
  const { PivotCitySource } = getGlobalModels(req, 'PivotCitySource');
  const batches = await PivotBatch.find({ status: 'released' }).sort({ batchWeek: -1 }).limit(MAX_BATCHES).select('batchWeek').lean();
  const weeks = batches.map((batch) => batch.batchWeek);
  const events = weeks.length ? await Event.find({ 'customFields.pivot.batchWeek': { $in: weeks },
    'customFields.pivot.sourceId': { $exists: true }, isDeleted: { $ne: true } })
    .select('customFields.pivot.sourceId customFields.pivot.entrypointId customFields.pivot.observedEntrypointIds customFields.pivot.batchWeek customFields.pivot.ingestStatus customFields.pivot.featured customFields.pivot.rankingOverride')
    .lean() : [];
  const bySource = new Map();
  for (const event of events) {
    const id = String(event.customFields?.pivot?.sourceId || '');
    if (!id) continue;
    if (!bySource.has(id)) bySource.set(id, []);
    bySource.get(id).push(event);
  }
  const sources = await PivotCitySource.find({ tenantKey }).select('_id').lean();
  for (const source of sources) {
    await PivotCitySource.updateOne({ _id: source._id, tenantKey }, { $set: { score: {
      ...calculateSourceScore(bySource.get(String(source._id)) || [], weeks), computedAt: now,
    } } });
  }
  return { updated: sources.length };
}

function explainSourceAdjustment(source, weight = 0.45) {
  if (!source) return { automatic: 0, manual: 0, total: 0, capped: false, weight };
  const evidence = source.score?.quality == null ? 0.5
    : 0.55 * source.score.quality + 0.45 * source.score.reputation;
  const manual = { promote: 0.35, strong_promote: 0.7, demote: -0.5 }[source.rankingOverride?.tier] || 0;
  const automatic = source.score?.quality == null ? 0 : weight * (evidence - 0.5) * 2;
  const raw = automatic + manual;
  const total = Math.max(-0.6, Math.min(0.9, raw));
  return { automatic, manual, total,
    capped: raw !== total, weight };
}

function sourceAdjustment(source, weight = 0.45) {
  return explainSourceAdjustment(source, weight).total;
}

module.exports = { calculateSourceScore, recomputeTenantSourceScores, sourceAdjustment,
  explainSourceAdjustment, SCORE_VERSION };
