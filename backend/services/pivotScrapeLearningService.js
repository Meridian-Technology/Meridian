const getGlobalModels = require('./getGlobalModelService');
const mongoose = require('mongoose');
const { mergeExtractionHints } = require('../utilities/pivotExtractionHints');

const LEARNABLE_FIELDS = ['start_time', 'end_time', 'location', 'description', 'image', 'sourceUrl', 'hostName'];
const SUGGESTION_TEXT = {
  start_time: 'Verify each event start time against its detail page when the calendar card is ambiguous.',
  end_time: 'Use an event end time only when the listing or detail page actually states one.',
  location: 'Verify the event venue against its detail page instead of assuming the calendar host venue.',
  description: 'Prefer the event-specific description on the detail page over repeated calendar boilerplate.',
  image: 'Prefer the event-specific poster image over the calendar or venue logo.',
  sourceUrl: 'Use the event detail page URL rather than the calendar index URL.',
  hostName: 'Use the named event organizer or presenter rather than the calendar website name.',
};

function fieldValue(event, field) {
  const pivot = event?.customFields?.pivot || {};
  if (field === 'sourceUrl') return pivot.sourceUrl || event?.externalLink || '';
  if (field === 'hostName') return pivot.host?.name || '';
  const value = event?.[field];
  return value instanceof Date ? value.toISOString() : String(value ?? '').trim();
}

function correctedFields(before, after) {
  return LEARNABLE_FIELDS.filter((field) => fieldValue(before, field) !== fieldValue(after, field));
}

async function loadApprovedHintsForJob(req, tenantKey, job) {
  const { PivotCitySource } = getGlobalModels(req, 'PivotCitySource');
  const source = job?.sourceId ? await PivotCitySource.findOne({
    _id: job.sourceId, tenantKey,
  }).select('promptHints').lean() : null;
  return mergeExtractionHints(job?.extractionProfile?.promptHints || [], source?.promptHints || []);
}

async function recordScrapeLearningRun(req, { tenantKey, jobId, runKey, stats = {}, hintCount = 0,
  estimatedCredits = 0, completedAt = new Date() }) {
  const { PivotCurationJob } = getGlobalModels(req, 'PivotCurationJob');
  const job = await PivotCurationJob.findOne({ _id: jobId, tenantKey });
  if (!job || job.provider !== 'generic-site') return false;
  if (!job.extractionProfile) job.extractionProfile = { promptHints: [] };
  const runs = job.extractionProfile.learningRuns || [];
  if (runs.some((run) => run.runKey === runKey)) return false;
  runs.push({ runKey, completedAt, hintCount, discovered: stats.discovered || 0,
    upserted: stats.upserted || 0, failed: stats.failed || 0,
    corrections: 0, discarded: 0, missed: 0, reviewSeconds: 0, estimatedCredits });
  job.extractionProfile.learningRuns = runs.slice(-12);
  await job.save();
  return true;
}

async function recordCatalogCorrection(req, { tenantKey, before, after, reviewSeconds = 0 }) {
  const entrypointId = before?.customFields?.pivot?.entrypointId;
  if (!entrypointId) return { recorded: false, fields: [] };
  const fields = correctedFields(before, after);
  if (!fields.length) return { recorded: false, fields };
  const { PivotCurationJob } = getGlobalModels(req, 'PivotCurationJob');
  const job = await PivotCurationJob.findOne({ _id: entrypointId, tenantKey });
  if (!job || job.provider !== 'generic-site') return { recorded: false, fields };
  if (!job.extractionProfile) job.extractionProfile = { promptHints: [] };
  const suggestions = job.extractionProfile.suggestedHints || [];
  for (const field of fields) {
    if (suggestions.some((suggestion) => suggestion.field === field)) continue;
    suggestions.push({ id: `${String(before._id)}:${field}`, field,
      text: SUGGESTION_TEXT[field], eventId: String(before._id), createdAt: new Date() });
  }
  job.extractionProfile.suggestedHints = suggestions.slice(-30);
  const runs = job.extractionProfile.learningRuns || [];
  const recent = runs[runs.length - 1];
  if (recent) {
    recent.corrections = (recent.corrections || 0) + fields.length;
    recent.reviewSeconds = (recent.reviewSeconds || 0) + Math.min(3600, Math.max(0, Number(reviewSeconds) || 0));
  }
  await job.save();
  return { recorded: true, fields };
}

async function recordManualReviewFeedback(req, { tenantKey, jobId, missed = 0, discarded = 0,
  reviewSeconds = 0 }) {
  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    return { error: 'Invalid website job id.', status: 400 };
  }
  const values = { missed, discarded, reviewSeconds };
  if (Object.values(values).some((value) => !Number.isInteger(value) || value < 0 || value > 3600)) {
    return { error: 'Review counts and seconds must be integers from 0 to 3600.', status: 400 };
  }
  const { PivotCurationJob } = getGlobalModels(req, 'PivotCurationJob');
  const job = await PivotCurationJob.findOne({ _id: jobId, tenantKey });
  if (!job || job.provider !== 'generic-site') return { error: 'Website job not found.', status: 404 };
  const runs = job.extractionProfile?.learningRuns || [];
  if (!runs.length) return { error: 'Run a website crawl before recording review feedback.', status: 409 };
  const recent = runs[runs.length - 1];
  recent.missed = (recent.missed || 0) + missed;
  recent.discarded = (recent.discarded || 0) + discarded;
  recent.reviewSeconds = (recent.reviewSeconds || 0) + reviewSeconds;
  await job.save();
  return { data: { job } };
}

module.exports = { correctedFields, loadApprovedHintsForJob, recordScrapeLearningRun,
  recordCatalogCorrection, recordManualReviewFeedback };
