const getGlobalModels = require('./getGlobalModelService');
const mongoose = require('mongoose');
const { mergeExtractionHints } = require('../utilities/pivotExtractionHints');
const { connectToDatabase } = require('../connectionsManager');
const getModels = require('./getModelService');
const { ruleFromCorrection, activeRuleHints, applyStructuredRules } = require('../utilities/pivotStructuredExtractionRules');

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
  }).select('promptHints extractionRules').lean() : null;
  return mergeExtractionHints(activeRuleHints([
    ...(job?.extractionProfile?.extractionRules || []), ...(source?.extractionRules || []),
  ]), mergeExtractionHints(job?.extractionProfile?.promptHints || [], source?.promptHints || []));
}

async function loadApprovedRulesForJob(req, tenantKey, job) {
  const { PivotCitySource } = getGlobalModels(req, 'PivotCitySource');
  const source = job?.sourceId ? await PivotCitySource.findOne({ _id: job.sourceId, tenantKey })
    .select('extractionRules').lean() : null;
  return [...(job?.extractionProfile?.extractionRules || []), ...(source?.extractionRules || [])]
    .filter((rule) => rule.status === 'active');
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

async function recordCatalogCorrection(req, { tenantKey, before, after, reviewSeconds = 0,
  correctionReasons = {} }) {
  const entrypointId = before?.customFields?.pivot?.entrypointId;
  if (!entrypointId) return { recorded: false, fields: [] };
  const fields = correctedFields(before, after);
  if (!fields.length) return { recorded: false, fields };
  const { PivotCurationJob } = getGlobalModels(req, 'PivotCurationJob');
  const job = await PivotCurationJob.findOne({ _id: entrypointId, tenantKey });
  if (!job || job.provider !== 'generic-site') return { recorded: false, fields };
  if (!job.extractionProfile) job.extractionProfile = { promptHints: [] };
  const suggestions = job.extractionProfile.suggestedHints || [];
  const rules = job.extractionProfile.extractionRules || [];
  for (const field of fields) {
    const proposed = ruleFromCorrection({ field, reason: correctionReasons?.[field],
      before: fieldValue(before, field), after: fieldValue(after, field), eventId: before._id });
    if (proposed) {
      if (!rules.some((rule) => rule.id === proposed.id || (rule.field === field
        && rule.reason === proposed.reason && rule.badValue === proposed.badValue))) rules.push(proposed);
      continue;
    }
    if (suggestions.some((suggestion) => suggestion.field === field)) continue;
    suggestions.push({ id: `${String(before._id)}:${field}`, field,
      text: SUGGESTION_TEXT[field], eventId: String(before._id), createdAt: new Date() });
  }
  job.extractionProfile.suggestedHints = suggestions.slice(-30);
  job.extractionProfile.extractionRules = rules.slice(-30);
  const runs = job.extractionProfile.learningRuns || [];
  const recent = runs[runs.length - 1];
  if (recent) {
    recent.corrections = (recent.corrections || 0) + fields.length;
    recent.reviewSeconds = (recent.reviewSeconds || 0) + Math.min(3600, Math.max(0, Number(reviewSeconds) || 0));
  }
  await job.save();
  return { recorded: true, fields };
}

async function decideExtractionRule(req, { tenantKey, jobId, ruleId, action, scope = 'entrypoint' }) {
  if (!mongoose.Types.ObjectId.isValid(jobId)) return { error: 'Invalid website job id.', status: 400 };
  if (!['approve', 'dismiss', 'disable', 'enable'].includes(action)
    || !['entrypoint', 'source'].includes(scope)) return { error: 'Invalid rule decision.', status: 400 };
  const { PivotCurationJob, PivotCitySource } = getGlobalModels(req, 'PivotCurationJob', 'PivotCitySource');
  const job = await PivotCurationJob.findOne({ _id: jobId, tenantKey });
  if (!job || job.provider !== 'generic-site') return { error: 'Website job not found.', status: 404 };
  const source = job.sourceId ? await PivotCitySource.findOne({ _id: job.sourceId, tenantKey }) : null;
  const jobRules = job.extractionProfile?.extractionRules || [];
  const sourceRules = source?.extractionRules || [];
  const fromJob = jobRules.find((rule) => rule.id === ruleId);
  const fromSource = sourceRules.find((rule) => rule.id === ruleId);
  const rule = fromJob || fromSource;
  if (!rule) return { error: 'Rule not found.', status: 404 };
  if (action === 'approve' && rule.status !== 'proposed') return { error: 'Only proposed rules can be approved.', status: 409 };
  if (action === 'disable' && rule.status !== 'active') return { error: 'Only active rules can be disabled.', status: 409 };
  if (action === 'enable' && rule.status !== 'disabled') return { error: 'Only disabled rules can be enabled.', status: 409 };
  if (action === 'approve' && scope === 'source' && !source) return { error: 'Link this job to a source first.', status: 409 };
  const now = new Date();
  if (action === 'dismiss') {
    if (rule.status !== 'proposed' || !fromJob) return { error: 'Only proposed rules can be dismissed.', status: 409 };
    job.extractionProfile.extractionRules = jobRules.filter((row) => row.id !== ruleId);
    await job.save();
  } else if (action === 'approve' && scope === 'source') {
    const row = { ...(rule.toObject ? rule.toObject() : rule), status: 'active', updatedAt: now,
      updatedBy: req.user?.email || null };
    source.extractionRules = [...sourceRules.filter((item) => item.id !== ruleId), row].slice(-30);
    job.extractionProfile.extractionRules = jobRules.filter((item) => item.id !== ruleId);
    await source.save();
    await job.save();
  } else {
    rule.status = action === 'disable' ? 'disabled' : 'active';
    rule.updatedAt = now;
    rule.updatedBy = req.user?.email || null;
    if (fromSource) source.markModified?.('extractionRules');
    await (fromJob ? job : source).save();
  }
  return { data: { job, source } };
}

async function previewExtractionRule(req, { tenantKey, jobId, ruleId }) {
  if (!mongoose.Types.ObjectId.isValid(jobId)) return { error: 'Invalid website job id.', status: 400 };
  const { PivotCurationJob } = getGlobalModels(req, 'PivotCurationJob');
  const job = await PivotCurationJob.findOne({ _id: jobId, tenantKey }).lean();
  if (!job || job.provider !== 'generic-site') return { error: 'Website job not found.', status: 404 };
  const rule = job.extractionProfile?.extractionRules?.find((row) => row.id === ruleId);
  if (!rule || rule.status !== 'proposed') return { error: 'Proposed rule not found.', status: 404 };
  const db = await connectToDatabase(tenantKey);
  const { Event } = getModels({ db }, 'Event');
  const events = await Event.find({ 'customFields.pivot.entrypointId': String(job._id),
    isDeleted: { $ne: true } })
    .select('name image description customFields.pivot.scrapeEvidence')
    .sort({ start_time: -1 }).limit(20).lean();
  const examples = events.map((event) => {
    const before = rule.field === 'image' ? event.image || '' : event.description || '';
    const input = { imageUrl: event.image || '', description: event.description || '',
      imageCandidates: event.customFields?.pivot?.scrapeEvidence?.imageCandidates || [] };
    const effect = applyStructuredRules(input, [{ ...rule, status: 'active' }]);
    const after = rule.field === 'image' ? effect.row.imageUrl || '' : effect.row.description || '';
    return { eventId: String(event._id), name: event.name, before, after, changed: before !== after };
  });
  return { data: { rule, examples: examples.filter((example) => example.changed).slice(0, 8),
    checked: events.length, changed: examples.filter((example) => example.changed).length,
    promptOnly: rule.field === 'start_time' || !examples.some((example) => example.changed),
  } };
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

module.exports = { correctedFields, loadApprovedHintsForJob, loadApprovedRulesForJob,
  recordScrapeLearningRun, recordCatalogCorrection, recordManualReviewFeedback,
  decideExtractionRule, previewExtractionRule };
