const { isDeepStrictEqual } = require('node:util');
const { Types } = require('mongoose');
const getGlobalModels = require('./getGlobalModelService');
const { EDITORIAL_FIELDS, FEEDBACK_DISPOSITIONS } = require('../schemas/pivotCarouselDeck');

const FEEDBACK_LIMIT = 50;
const clone = value => JSON.parse(JSON.stringify(value));

function editorialFields(issue) {
  const coverCopy = [];
  const eventCopy = [];
  const images = [];
  function layout(node, slideId, copy) {
    const rest = { ...node };
    if (node.kind === 'text') {
      copy.push({ slideId, id: node.id, role: node.role || null, text: node.text || '', presence: node.presence, voice: node.voice || null });
      delete rest.text; delete rest.presence; delete rest.voice;
    }
    if (node.kind === 'image' || node.kind === 'sticker') {
      images.push({ slideId, id: node.id, asset: node.asset || null, crop: node.crop || null });
      delete rest.asset; delete rest.crop;
    }
    if (node.children) rest.children = node.children.map(child => layout(child, slideId, copy));
    if (node.elements) rest.elements = node.elements.map(child => layout(child, slideId, copy));
    return rest;
  }
  const slides = issue.document?.slides || [];
  const presets = slides.map((slide, index) => {
    const copy = slide.role === 'cover' || (!slide.role && index === 0 && !slide.source) ? coverCopy : eventCopy;
    const { source, ...rest } = slide;
    return layout(rest, slide.id, copy);
  });
  return clone({
    events: {
      sources: issue.sources || [], refs: issue.curation?.refs || [], snapshots: issue.curation?.snapshots || [],
      slides: slides.filter(slide => slide.source).map(slide => ({ id: slide.id, source: slide.source })),
      legacy: (issue.slides || []).map(slide => slide.events || []),
    },
    'cover-copy': { name: issue.name || issue.title, title: issue.title, copy: coverCopy },
    'event-copy': eventCopy,
    presets: { format: issue.format || null, presetVersion: issue.document?.presetVersion || null, slides: presets },
    images,
    caption: issue.socialCaption || '',
  });
}

function editorialChanges(before, after) {
  return EDITORIAL_FIELDS.filter(field => !isDeepStrictEqual(before[field], after[field]))
    .map(field => ({ field, before: before[field], after: after[field] }));
}

/** Append against the current arrays and counter, including concurrent notes. */
function appendEditorialRecord(changes, field, record) {
  const set = Object.fromEntries(Object.entries(changes.$set || {}).map(([key, value]) => [key, { $literal: value }]));
  for (const [key, value] of Object.entries(changes.$inc || {})) {
    set[key] = { $add: [{ $ifNull: [`$${key}`, 0] }, value] };
  }
  const version = { $add: [{ $ifNull: ['$editorialVersion', 0] }, 1] };
  set.editorialVersion = version;
  set[field] = { $concatArrays: [
    { $ifNull: [`$${field}`, []] },
    [{ $mergeObjects: [{ $literal: record }, { version }] }],
  ] };
  const pipeline = [{ $set: set }];
  if (Object.keys(changes.$unset || {}).length) pipeline.push({ $unset: Object.keys(changes.$unset) });
  return pipeline;
}

function serializeFeedbackRecord(record) {
  const row = record.toObject ? record.toObject() : record;
  const { _id, ...rest } = row;
  return { id: String(_id), ...rest };
}

async function addCarouselIssueFeedback(req, accountId, issueId, body = {}) {
  const issues = require('./pivotCarouselIssueService');
  const loaded = await issues.getCarouselIssue(req, accountId, issueId);
  if (loaded.error) return loaded;
  const conflict = issues.checkRevision(loaded.data.issue.revision, body.revision);
  if (conflict) return { ...conflict, issue: loaded.data.issue };
  if (typeof body.text !== 'string' || !body.text.trim() || !FEEDBACK_DISPOSITIONS.includes(body.disposition)) {
    return { error: 'Feedback needs text and an approve, reject or change disposition.', status: 422, code: 'INVALID_FEEDBACK' };
  }
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const doc = await PivotCarouselDeck.findOne({ _id: issueId, accountId });
  if (!doc) return { error: 'Issue not found.', status: 404, code: 'ISSUE_NOT_FOUND' };
  const note = doc.feedbackNotes.create({
    author: req.user?.globalUserId || req.user?.userId,
    time: new Date(), version: (doc.editorialVersion || 0) + 1,
    revision: body.revision, text: body.text.trim(), disposition: body.disposition,
  });
  await note.validate();
  const saved = await PivotCarouselDeck.findOneAndUpdate(
    { _id: issueId, accountId, revision: body.revision },
    appendEditorialRecord({}, 'feedbackNotes', note.toObject()),
    { new: true },
  );
  if (!saved) {
    const current = await issues.getCarouselIssue(req, accountId, issueId);
    return { error: 'The issue changed while saving feedback.', status: 409, code: 'REVISION_CONFLICT',
      storedRevision: current.data?.issue.revision, presentedRevision: body.revision, issue: current.data?.issue };
  }
  return { data: { note: serializeFeedbackRecord(saved.feedbackNotes.id(note._id)) } };
}

function readVersion(accountId, sinceVersion) {
  if (sinceVersion == null || sinceVersion === '') return {};
  if (typeof sinceVersion !== 'string' || sinceVersion.length > 262144 || !sinceVersion.startsWith('feedback:')) throw new Error('Invalid feedback version');
  const value = JSON.parse(Buffer.from(sinceVersion.slice(9), 'base64url').toString('utf8'));
  if (value.accountId !== accountId || !value.issues || typeof value.issues !== 'object' || Array.isArray(value.issues)
    || Object.entries(value.issues).some(([id, version]) => !/^[a-f0-9]{24}$/.test(id) || !Number.isSafeInteger(version) || version < 0)) {
    throw new Error('Invalid feedback version');
  }
  return value.issues;
}

/** accountKey is the carousel account id used by the account routes. */
async function listEditorialFeedback(req, accountKey, sinceVersion = null) {
  const loaded = await require('./pivotCarouselIssueService').loadAccount(req, accountKey);
  if (loaded.error) return loaded;
  const accountId = String(loaded.account._id);
  let versions;
  try { versions = readVersion(accountId, sinceVersion); }
  catch { return { error: 'Invalid feedback version for this account.', status: 400, code: 'INVALID_FEEDBACK_VERSION' }; }
  const seen = Object.keys(versions);
  const pipeline = [
    { $match: { accountId: loaded.account._id } },
    { $project: { accountId: 1, records: { $concatArrays: [
      { $map: { input: { $ifNull: ['$editLog', []] }, as: 'record', in: { $mergeObjects: ['$$record', { kind: 'edit' }] } } },
      { $map: { input: { $ifNull: ['$feedbackNotes', []] }, as: 'record', in: { $mergeObjects: ['$$record', { kind: 'note' }] } } },
    ] } } },
    { $unwind: '$records' },
    { $replaceRoot: { newRoot: { $mergeObjects: [{ issueId: '$_id', accountId: '$accountId' }, '$records'] } } },
  ];
  if (seen.length) pipeline.push({ $match: { $or: [
    { issueId: { $nin: seen.map(id => new Types.ObjectId(id)) } },
    ...seen.map(id => ({ issueId: new Types.ObjectId(id), version: { $gt: versions[id] } })),
  ] } });
  pipeline.push({ $sort: { time: -1, version: -1, _id: -1 } }, { $limit: FEEDBACK_LIMIT });
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const rows = await PivotCarouselDeck.aggregate(pipeline);
  const items = rows.map(row => {
    const issueId = String(row.issueId);
    versions[issueId] = Math.max(versions[issueId] || 0, row.version);
    return serializeFeedbackRecord({ ...row, issueId, accountId });
  });
  const version = `feedback:${Buffer.from(JSON.stringify({ accountId, issues: versions })).toString('base64url')}`;
  return { data: { accountKey: accountId, items, version } };
}

module.exports = { FEEDBACK_LIMIT, editorialFields, editorialChanges, appendEditorialRecord, serializeFeedbackRecord, addCarouselIssueFeedback, listEditorialFeedback };
