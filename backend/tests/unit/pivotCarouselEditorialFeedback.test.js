const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(async (_req, tenantKey) => ({ tenantKey, pivotPilot: true })),
}));
const getGlobalModels = require('../../services/getGlobalModelService');
const {
  createCarouselAccount, createCarouselIssue, createGeneratedCarouselIssue, updateCarouselIssue,
  renameCarouselIssue, archiveCarouselIssue, approveCarouselIssue, requestCarouselRevision,
  markCarouselIssuePosted,
} = require('../../services/pivotCarouselIssueService');
const {
  addCarouselIssueFeedback, listEditorialFeedback,
} = require('../../services/pivotCarouselEditorialFeedbackService');
const revisions = require('../../services/pivotCarouselRevisionService');

function document() {
  const text = (id, value) => ({ id, kind: 'text', text: value, frame: { x: 0, y: 0, width: 400, height: 80 } });
  return { schemaVersion: 2, width: 1080, height: 1350, slides: [
    { id: 'cover', role: 'cover', preset: { family: 'loose-letters', variation: 1 }, elements: [text('headline', 'Before cover')] },
    { id: 'event', role: 'event', source: { sourceTenantKey: 'sf', eventId: 'event-before' },
      preset: { id: 'photo-note' }, elements: [
        { id: 'copy', kind: 'card', frame: { x: 0, y: 0, width: 400, height: 200 }, children: [text('blurb', 'Before event')] },
        { id: 'poster', kind: 'image', frame: { x: 0, y: 0, width: 400, height: 400 }, asset: { src: 'https://example.test/before.png' } },
      ] },
  ] };
}

describe('carousel editorial edits and feedback', () => {
  let mongo; let req; let accountId;
  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection, user: { globalUserId: 'editor-1' } };
  });
  beforeEach(async () => {
    await mongo.reset();
    accountId = (await createCarouselAccount(req, { displayName: 'SF', ownerTenantKey: 'sf', sourceTenantKeys: ['sf'] })).data.account.id;
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => mongo.cleanup());
  const model = () => getGlobalModels(req, 'PivotCarouselDeck').PivotCarouselDeck;
  // Model constructors change across lookups; their collection stays shared.
  function interleaveNextWrite(interleave) {
    const collection = model().collection;
    const write = collection.findOneAndUpdate.bind(collection);
    return jest.spyOn(collection, 'findOneAndUpdate').mockImplementationOnce(async (...args) => {
      await interleave();
      return write(...args);
    });
  }
  async function generated(account = accountId) {
    const result = await createGeneratedCarouselIssue(req, account, { name: 'Issue', document: document(), socialCaption: 'Before caption' });
    expect(result.error).toBeUndefined();
    return result.data.issue;
  }
  const note = (issue, text = 'Feedback', disposition = 'change') => addCarouselIssueFeedback(req, accountId, issue.id, { revision: issue.revision, text, disposition });
  const agentWindow = {
    from: '2026-10-01T00:00:00.000Z', to: '2026-10-15T00:00:00.000Z',
    toExclusive: false, timezone: 'America/Los_Angeles', mode: 'upcoming', days: 14,
  };
  async function agentDraft() {
    const result = await createGeneratedCarouselIssue(req, accountId, {
      name: 'Issue', document: document(), socialCaption: 'Before caption',
    }, {
      composition: { socialCaption: 'Before caption' },
      contextWindow: agentWindow,
      agentRevision: 1,
    });
    expect(result.error).toBeUndefined();
    return result.data.issue;
  }
  async function jobs() {
    return getGlobalModels(req, 'PivotComputeJob').PivotComputeJob.countDocuments({ kind: 'carousel-revise' });
  }

  test('one save captures all changed editorial fields with before and after values', async () => {
    const issue = await generated();
    const changed = JSON.parse(JSON.stringify(issue.document));
    changed.slides[0].elements[0].text = 'After cover';
    changed.slides[1].elements[0].children[0].text = 'After event';
    changed.slides[1].preset.id = 'in-the-room';
    changed.slides[1].source.eventId = 'event-after';
    changed.slides[1].elements[1].asset.src = 'https://example.test/after.png';
    const saved = await updateCarouselIssue(req, accountId, issue.id, { revision: 1, document: changed, socialCaption: '$after caption' });
    expect(saved.data.issue.revision).toBe(2);
    const stored = await model().findById(issue.id).lean();
    expect(stored.editLog).toHaveLength(1);
    const edit = stored.editLog[0];
    expect(edit).toMatchObject({ actor: 'editor-1', fromRevision: 1, toRevision: 2, version: 1 });
    expect(edit.time).toBeInstanceOf(Date);
    expect(edit.changes.map(change => change.field)).toEqual(['events', 'cover-copy', 'event-copy', 'presets', 'images', 'caption']);
    const changes = Object.fromEntries(edit.changes.map(change => [change.field, change]));
    expect(changes.caption).toMatchObject({ before: 'Before caption', after: '$after caption' });
    expect(changes['cover-copy'].before.copy[0].text).toBe('Before cover');
    expect(changes['cover-copy'].after.copy[0].text).toBe('After cover');
    expect(changes['event-copy'].after[0].text).toBe('After event');
    expect(changes.events.before.slides[0].source.eventId).toBe('event-before');
    expect(changes.events.after.slides[0].source.eventId).toBe('event-after');
    expect(changes.images.after[0].asset.src).toBe('https://example.test/after.png');
    expect(changes.presets.after.slides[1].preset.id).toBe('in-the-room');
  });

  test('every accepted generated save records an edit, including unchanged and metadata saves', async () => {
    const issue = await generated();
    expect((await model().findById(issue.id).lean()).editLog).toHaveLength(0);
    expect((await updateCarouselIssue(req, accountId, issue.id, { revision: 1 })).data.issue.revision).toBe(2);
    expect((await renameCarouselIssue(req, accountId, issue.id, { revision: 2, name: 'Renamed' })).data.issue.revision).toBe(3);
    expect((await archiveCarouselIssue(req, accountId, issue.id, { revision: 3 })).data.issue.revision).toBe(4);
    const stored = await model().findById(issue.id).lean();
    expect(stored.editLog.map(edit => [edit.fromRevision, edit.toRevision])).toEqual([[1, 2], [2, 3], [3, 4]]);
    expect(stored.editLog.map(edit => edit.version)).toEqual([1, 2, 3]);
    expect(stored.editLog[0].changes).toEqual([]);
    expect(stored.editLog[1].changes[0].field).toBe('cover-copy');
    expect(stored.editorialVersion).toBe(3);
  });

  test('failed validation and stale saves produce no extra record', async () => {
    const issue = await generated();
    expect((await updateCarouselIssue(req, accountId, issue.id, { revision: 1, socialCaption: {} })).code).toBe('INVALID_CAPTION');
    await updateCarouselIssue(req, accountId, issue.id, { revision: 1, socialCaption: 'Changed' });
    expect((await updateCarouselIssue(req, accountId, issue.id, { revision: 1, socialCaption: 'Stale' })).code).toBe('REVISION_CONFLICT');
    expect((await model().findById(issue.id).lean()).editLog).toHaveLength(1);
  });

  test('an unavailable head write leaves neither a revision nor an edit record', async () => {
    const issue = await generated();
    const write = jest.spyOn(model().collection, 'findOneAndUpdate').mockRejectedValueOnce(new Error('write failed'));
    await expect(updateCarouselIssue(req, accountId, issue.id, { revision: 1, socialCaption: 'Lost' })).rejects.toThrow('write failed');
    expect(write).toHaveBeenCalledTimes(1);
    const stored = await model().findById(issue.id).lean();
    expect(stored.revision).toBe(1);
    expect(stored.editLog).toEqual([]);
    expect(stored.editorialVersion).toBe(0);
  });

  test('history-store failure after a save cannot lose the edit record', async () => {
    const issue = await generated();
    jest.spyOn(revisions, 'recordHeadSnapshot').mockRejectedValueOnce(new Error('history failed'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect((await updateCarouselIssue(req, accountId, issue.id, { revision: 1, socialCaption: 'Saved' })).data.issue.revision).toBe(2);
    const stored = await model().findById(issue.id).lean();
    expect(stored.editLog).toHaveLength(1);
    expect(stored.editLog[0].changes[0]).toMatchObject({ field: 'caption', after: 'Saved' });
  });

  test('competing saves produce exactly one edit record', async () => {
    const issue = await generated();
    const results = await Promise.all(['One', 'Two'].map(socialCaption => updateCarouselIssue(req, accountId, issue.id, { revision: 1, socialCaption })));
    expect(results.filter(result => result.data)).toHaveLength(1);
    expect(results.filter(result => result.code === 'REVISION_CONFLICT')).toHaveLength(1);
    expect((await model().findById(issue.id).lean()).editLog).toHaveLength(1);
  });

  test('manual saves and copies do not inherit a generated edit log', async () => {
    const issue = (await createCarouselIssue(req, accountId, { name: 'Manual', document: document() })).data.issue;
    await updateCarouselIssue(req, accountId, issue.id, { revision: 1, socialCaption: 'Manual edit' });
    expect((await model().findById(issue.id).lean()).editLog).toEqual([]);
    const original = await generated();
    await updateCarouselIssue(req, accountId, original.id, { revision: 1, socialCaption: 'Edited' });
    const copy = await require('../../services/pivotCarouselIssueService').duplicateCarouselIssue(req, accountId, original.id);
    expect((await model().findById(copy.data.issue.id).lean()).editLog).toEqual([]);
  });

  test('checkpoint restore appends a new edit rather than rewriting the earlier log', async () => {
    const issue = await generated();
    const checkpoint = await revisions.createCheckpoint(req, accountId, issue.id, { revision: 1, name: 'Original' });
    await updateCarouselIssue(req, accountId, issue.id, { revision: 1, socialCaption: 'Edited' });
    const prior = (await model().findById(issue.id).lean()).editLog[0];
    await revisions.restoreCheckpoint(req, accountId, issue.id, checkpoint.data.checkpoint.id, { revision: 2 });
    const stored = await model().findById(issue.id).lean();
    expect(stored.editLog).toHaveLength(2);
    expect(stored.editLog[0]).toEqual(prior);
    expect(stored.editLog[1].changes[0]).toMatchObject({ field: 'caption', before: 'Edited', after: 'Before caption' });
  });

  test('notes capture the author and reviewed revision without changing approval or content', async () => {
    const issue = await generated();
    await approveCarouselIssue(req, accountId, issue.id, { revision: 1 });
    for (const disposition of ['approve', 'reject', 'change']) {
      const result = await note(issue, '  $literal feedback  ', disposition);
      expect(result.data.note).toMatchObject({ author: 'editor-1', revision: 1, text: '$literal feedback', disposition });
    }
    const stored = await model().findById(issue.id).lean();
    expect(stored.revision).toBe(1);
    expect(stored.reviewState).toBe('approved');
    expect(stored.feedbackNotes).toHaveLength(3);
    expect(stored.feedbackNotes.every(item => item.time instanceof Date)).toBe(true);
    expect(stored.editLog).toEqual([]);
  });

  test('invalid and stale notes append nothing', async () => {
    const issue = await generated();
    for (const body of [{ text: '' }, { text: {} }, { text: 'Note', disposition: 'delete' }]) {
      expect((await addCarouselIssueFeedback(req, accountId, issue.id, { revision: 1, disposition: 'change', ...body })).code).toBe('INVALID_FEEDBACK');
    }
    await updateCarouselIssue(req, accountId, issue.id, { revision: 1 });
    expect((await note(issue)).code).toBe('REVISION_CONFLICT');
    expect((await model().findById(issue.id).lean()).feedbackNotes).toEqual([]);
  });

  test('a note arriving between the edit read and write is preserved with distinct versions', async () => {
    const issue = await generated();
    const hook = interleaveNextWrite(async () => {
      expect((await note(issue, 'Racing note')).error).toBeUndefined();
    });
    expect((await updateCarouselIssue(req, accountId, issue.id, { revision: 1, socialCaption: 'Edited' })).error).toBeUndefined();
    expect(hook).toHaveBeenCalledTimes(2);
    const stored = await model().findById(issue.id).lean();
    expect(stored.feedbackNotes).toHaveLength(1);
    expect(stored.editLog).toHaveLength(1);
    expect(stored.feedbackNotes[0].version).toBe(1);
    expect(stored.editLog[0].version).toBe(2);
    expect(stored.editorialVersion).toBe(2);
  });

  test('a note fails when an edit advances the revision before its write', async () => {
    const issue = await generated();
    const hook = interleaveNextWrite(async () => {
      expect((await updateCarouselIssue(req, accountId, issue.id, { revision: 1, socialCaption: 'Edited' })).error).toBeUndefined();
    });
    expect((await note(issue)).code).toBe('REVISION_CONFLICT');
    expect(hook).toHaveBeenCalledTimes(2);
    expect((await model().findById(issue.id).lean()).feedbackNotes).toEqual([]);
  });

  test('simultaneous notes both survive at the same content revision', async () => {
    const issue = await generated();
    const results = await Promise.all([note(issue, 'One'), note(issue, 'Two')]);
    expect(results.every(result => result.data)).toBe(true);
    const stored = await model().findById(issue.id).lean();
    expect(stored.feedbackNotes.map(item => item.text).sort()).toEqual(['One', 'Two']);
    expect(stored.feedbackNotes.map(item => item.version).sort()).toEqual([1, 2]);
    expect(stored.revision).toBe(1);
  });

  test('feedback reads stay within one account even when the owner tenant matches', async () => {
    const a = await generated();
    await note(a, 'Allowed');
    await updateCarouselIssue(req, accountId, a.id, { revision: 1, socialCaption: 'Allowed edit' });
    const otherId = (await createCarouselAccount(req, { displayName: 'Other SF', ownerTenantKey: 'sf', sourceTenantKeys: ['sf'] })).data.account.id;
    const b = await generated(otherId);
    await updateCarouselIssue(req, otherId, b.id, { revision: 1, socialCaption: 'Secret edit' });
    await addCarouselIssueFeedback(req, otherId, b.id, { revision: 2, disposition: 'reject', text: 'Secret note' });
    const feedback = await listEditorialFeedback(req, accountId);
    expect(feedback.data.items).toHaveLength(2);
    expect(feedback.data.items.every(item => item.accountId === accountId && item.issueId === a.id)).toBe(true);
    expect(JSON.stringify(feedback)).not.toContain('Secret');
    expect((await listEditorialFeedback(req, otherId, feedback.data.version)).code).toBe('INVALID_FEEDBACK_VERSION');
    expect((await addCarouselIssueFeedback(req, accountId, b.id, { revision: 2, disposition: 'change', text: 'Wrong account' })).code).toBe('ISSUE_NOT_FOUND');
  });

  test('sinceVersion returns only new items across multiple issues, including older issues', async () => {
    const first = await generated();
    const second = await generated();
    await note(first, 'Earlier');
    await note(second, 'Later');
    const initial = await listEditorialFeedback(req, accountId);
    expect((await listEditorialFeedback(req, accountId, initial.data.version)).data.items).toEqual([]);
    await note(first, 'New feedback on older issue');
    const incremental = await listEditorialFeedback(req, accountId, initial.data.version);
    expect(incremental.data.items).toHaveLength(1);
    expect(incremental.data.items[0]).toMatchObject({ kind: 'note', issueId: first.id, text: 'New feedback on older issue' });
    expect((await listEditorialFeedback(req, accountId, incremental.data.version)).data.items).toEqual([]);
  });

  test('reads merge the newest notes and edits and cap output at fifty', async () => {
    const issue = await generated();
    for (let index = 0; index < 55; index += 1) await note(issue, `Note ${index}`);
    for (let revision = 1; revision <= 5; revision += 1) {
      await updateCarouselIssue(req, accountId, issue.id, { revision, socialCaption: `Edit ${revision}` });
    }
    const feedback = await listEditorialFeedback(req, accountId);
    expect(feedback.data.items).toHaveLength(50);
    expect(feedback.data.items.map(item => item.version)).toEqual(Array.from({ length: 50 }, (_, index) => 60 - index));
    expect(new Set(feedback.data.items.map(item => item.kind))).toEqual(new Set(['note', 'edit']));
    const latest = { ...issue, revision: 6 };
    await note(latest, 'After cursor');
    expect((await listEditorialFeedback(req, accountId, feedback.data.version)).data.items.map(item => item.text)).toEqual(['After cursor']);
  });

  test('a revision request keeps the thread, queues a revise job, and is listed as a change', async () => {
    const issue = await agentDraft();
    const requested = await requestCarouselRevision(req, accountId, issue.id, {
      revision: 1, text: 'Swap the cover line.',
    });
    expect(requested.error).toBeUndefined();
    expect(requested.data.issue).toMatchObject({ revision: 1, hasEditsSinceAgent: false });
    expect(requested.data.request).toMatchObject({
      requester: 'editor-1', revision: 1, text: 'Swap the cover line.',
    });
    expect(requested.data.issue.revisionRequests).toEqual([
      expect.objectContaining({ id: requested.data.request.id, text: 'Swap the cover line.' }),
    ]);
    expect(requested.data.job).toMatchObject({
      kind: 'carousel-revise',
      status: 'pending',
      cityKey: 'sf',
      options: { issueId: issue.id, revision: 1, requestId: requested.data.request.id },
    });
    const feedback = await listEditorialFeedback(req, accountId);
    expect(feedback.data.items).toEqual([
      expect.objectContaining({
        kind: 'note', disposition: 'change', text: 'Swap the cover line.', issueId: issue.id, revision: 1,
      }),
    ]);
    expect(await jobs()).toBe(1);
  });

  test('a revision request refuses a posted draft, a stale revision, and a studio edit', async () => {
    const posted = await agentDraft();
    expect((await approveCarouselIssue(req, accountId, posted.id, { revision: 1 })).error).toBeUndefined();
    expect((await markCarouselIssuePosted(req, accountId, posted.id, { revision: 1 })).error).toBeUndefined();
    expect(await requestCarouselRevision(req, accountId, posted.id, { revision: 1, text: 'Too late' }))
      .toMatchObject({ code: 'POSTED_ISSUE', status: 409 });

    const stale = await agentDraft();
    expect(await requestCarouselRevision(req, accountId, stale.id, { revision: 2, text: 'Wrong revision' }))
      .toMatchObject({ code: 'REVISION_CONFLICT', status: 409 });

    const edited = await agentDraft();
    expect((await updateCarouselIssue(req, accountId, edited.id, { revision: 1, socialCaption: 'Human caption' })).error).toBeUndefined();
    expect(await requestCarouselRevision(req, accountId, edited.id, { revision: 2, text: 'Please change the cover' }))
      .toMatchObject({ code: 'EDITS_SINCE_AGENT', status: 409 });

    const feedback = await listEditorialFeedback(req, accountId);
    expect(feedback.data.items.some(item => item.kind === 'note')).toBe(false);
    expect(await jobs()).toBe(0);
  });
});
