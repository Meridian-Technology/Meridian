const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const { Types } = require('mongoose');

jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(async (_req, key) => {
    const tenantKey = String(key || '').toLowerCase();
    if (['sf', 'nyc'].includes(tenantKey)) return { tenantKey, pivotPilot: true };
    return null;
  }),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const {
  createCarouselAccount,
  createCarouselIssue,
  createGeneratedCarouselIssue,
  getCarouselIssue,
  listCarouselIssues,
  updateCarouselIssue,
  renameCarouselIssue,
  archiveCarouselIssue,
  duplicateCarouselIssue,
  approveCarouselIssue,
  markCarouselIssuePosted,
  MAX_SOCIAL_CAPTION_LENGTH,
} = require('../../services/pivotCarouselIssueService');
const revisionService = require('../../services/pivotCarouselRevisionService');
const { RETENTION } = require('../../schemas/pivotCarouselRevision');

function makeDocument(text = 'lanterns') {
  return {
    schemaVersion: 2,
    width: 1080,
    height: 1350,
    slides: [{
      id: 'slide-a',
      elements: [{
        id: 'slide-a-title',
        kind: 'text',
        text,
        frame: { x: 0, y: 0, width: 400, height: 80 },
      }],
    }],
  };
}

describe('carousel editorial lifecycle', () => {
  let mongo;
  let req;
  let accountId;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection, user: { globalUserId: 'admin-1' } };
  });

  beforeEach(async () => {
    await mongo.reset();
    const account = await createCarouselAccount(req, {
      displayName: 'Just Go SF',
      ownerTenantKey: 'sf',
      sourceTenantKeys: ['sf'],
    });
    accountId = account.data.account.id;
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  function models() {
    return getGlobalModels(req, 'PivotCarouselDeck', 'PivotCarouselRevision');
  }

  async function manualIssue(overrides = {}) {
    const created = await createCarouselIssue(req, accountId, {
      name: 'Lanterns',
      document: makeDocument(),
      ...overrides,
    });
    return created.data.issue;
  }

  async function generatedIssue(overrides = {}) {
    const created = await createGeneratedCarouselIssue(req, accountId, {
      name: 'Made by hand',
      document: makeDocument(),
      socialCaption: 'three nights worth leaving the house for',
      ...overrides,
    });
    return created;
  }

  describe('origin, review state and archival stay separate', () => {
    test('legacy rows read as manual without a backfill', async () => {
      const { PivotCarouselDeck } = models();
      const { insertedId } = await PivotCarouselDeck.collection.insertOne({
        tenantKey: 'sf', title: 'Legacy', accountId: new Types.ObjectId(accountId),
        revision: 4, slides: [],
      });
      const hydrated = await PivotCarouselDeck.findById(insertedId);
      expect(hydrated.origin).toBe('manual');
      expect(hydrated.reviewState).toBeNull();
      expect(hydrated.socialCaption).toBe('');
      const issue = (await getCarouselIssue(req, accountId, insertedId)).data.issue;
      expect(issue).toMatchObject({ origin: 'manual', reviewState: null, socialCaption: '', revision: 4 });
      const listed = await listCarouselIssues(req, accountId);
      expect(listed.data.issues[0]).toMatchObject({ origin: 'manual', reviewState: null, socialCaption: '' });
      const raw = await PivotCarouselDeck.collection.findOne({ _id: insertedId });
      expect(raw).not.toHaveProperty('origin');
    });

    test('the schema defaults generated issues to unapproved and accepts all three review states', async () => {
      const { PivotCarouselDeck } = models();
      const doc = new PivotCarouselDeck({ tenantKey: 'sf', title: 'Generated', origin: 'agent-generated' });
      expect(doc.reviewState).toBe('unapproved');
      await doc.validate();
      doc.reviewState = 'approved';
      doc.approval = { revision: 1, approvedAt: new Date(), approvedBy: 'admin-1' };
      await doc.validate();
      doc.reviewState = 'posted';
      doc.posting = { revision: 1, postedAt: new Date(), recordedAt: new Date(), postedBy: 'admin-1' };
      await doc.validate();
      doc.origin = 'manual';
      await expect(doc.validate()).rejects.toThrow('review state is only used by generated issues');
    });

    test('admin issue creation ignores supplied origin and review state', async () => {
      const issue = await manualIssue({ origin: 'agent-generated', reviewState: 'approved' });
      expect(issue).toMatchObject({ origin: 'manual', reviewState: null });
    });

    test('a manual issue has no review state and keeps its existing workflow', async () => {
      const issue = await manualIssue();
      expect(issue.origin).toBe('manual');
      expect(issue.reviewState).toBeNull();
      expect(issue.approval).toBeNull();
      expect(issue.posting).toBeNull();
      expect(issue.postHistory).toEqual([]);

      const archived = await archiveCarouselIssue(req, accountId, issue.id, { revision: 1 });
      expect(archived.data.issue.status).toBe('archived');
      expect(archived.data.issue.reviewState).toBeNull();

      // Approval is a generated-issue concept and stays that way.
      expect(await approveCarouselIssue(req, accountId, issue.id, { revision: 2 }))
        .toMatchObject({ code: 'NOT_GENERATED_ISSUE', status: 409 });
    });

    test('a generated issue starts as an unapproved draft with its caption', async () => {
      const created = await generatedIssue();
      const issue = created.data.issue;
      expect(issue.origin).toBe('agent-generated');
      expect(issue.reviewState).toBe('unapproved');
      expect(issue.status).toBe('active');
      expect(issue.socialCaption).toBe('three nights worth leaving the house for');
    });

    test('archiving a generated draft does not approve it and approving does not archive it', async () => {
      const issue = (await generatedIssue()).data.issue;
      const archived = await archiveCarouselIssue(req, accountId, issue.id, { revision: 1 });
      expect(archived.data.issue.status).toBe('archived');
      expect(archived.data.issue.reviewState).toBe('unapproved');

      const approved = await approveCarouselIssue(req, accountId, issue.id, {
        revision: archived.data.issue.revision,
      });
      expect(approved.data.issue.reviewState).toBe('approved');
      expect(approved.data.issue.status).toBe('archived');
    });

    test('a duplicate is new human work and preserves the caption', async () => {
      const issue = (await generatedIssue()).data.issue;
      const copy = await duplicateCarouselIssue(req, accountId, issue.id);
      expect(copy.data.issue.origin).toBe('manual');
      expect(copy.data.issue.reviewState).toBeNull();
      expect(copy.data.issue.socialCaption).toBe(issue.socialCaption);
    });
  });

  describe('captions are content', () => {
    test('a caption saves under the same revision contract as the slides', async () => {
      const issue = await manualIssue();
      expect(issue.socialCaption).toBe('');

      const saved = await updateCarouselIssue(req, accountId, issue.id, {
        revision: 1,
        socialCaption: '  three openings and a long walk between them  ',
      });
      expect(saved.data.issue.revision).toBe(2);
      expect(saved.data.issue.socialCaption).toBe('three openings and a long walk between them');

      const { PivotCarouselDeck } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.socialCaption).toBe('three openings and a long walk between them');
      const { PivotCarouselRevision } = models();
      const snapshot = await PivotCarouselRevision.findOne({ issueId: issue.id, kind: 'save', headRevision: 2 }).lean();
      expect(snapshot.socialCaption).toBe(stored.socialCaption);
      expect(snapshot.document).toEqual(stored.document);
      const cleared = await updateCarouselIssue(req, accountId, issue.id, { revision: 2, socialCaption: '' });
      expect(cleared.data.issue).toMatchObject({ revision: 3, socialCaption: '' });
      expect((await PivotCarouselRevision.findOne({ issueId: issue.id, kind: 'save', headRevision: 3 }).lean()).socialCaption).toBe('');
    });

    test('a caption and document save compete for the same revision', async () => {
      const issue = await manualIssue();
      const results = await Promise.all([
        updateCarouselIssue(req, accountId, issue.id, { revision: 1, socialCaption: 'go outside' }),
        updateCarouselIssue(req, accountId, issue.id, { revision: 1, document: makeDocument('changed') }),
      ]);
      expect(results.filter(result => result.data)).toHaveLength(1);
      expect(results.filter(result => result.code === 'REVISION_CONFLICT')).toHaveLength(1);
      const { PivotCarouselRevision } = models();
      const snapshots = await PivotCarouselRevision.find({ issueId: issue.id, kind: 'save' }).lean();
      expect(snapshots).toHaveLength(1);
      const winner = results.find(result => result.data).data.issue;
      expect(snapshots[0].socialCaption).toBe(winner.socialCaption);
      expect(snapshots[0].document).toEqual(winner.document);
    });

    test('checkpoint restore restores caption and slides together without changing the snapshot', async () => {
      const issue = await manualIssue({ socialCaption: 'first caption' });
      const checkpoint = await revisionService.createCheckpoint(req, accountId, issue.id, { revision: 1, name: 'Before edits' });
      expect(checkpoint.data.checkpoint.socialCaption).toBe('first caption');
      await updateCarouselIssue(req, accountId, issue.id, {
        revision: 1, socialCaption: 'second caption', document: makeDocument('second slides'),
      });
      const restored = await revisionService.restoreCheckpoint(req, accountId, issue.id, checkpoint.data.checkpoint.id, { revision: 2 });
      expect(restored.data.issue).toMatchObject({ revision: 3, socialCaption: 'first caption', document: issue.document });
      const { PivotCarouselRevision } = models();
      const stored = await PivotCarouselRevision.findById(checkpoint.data.checkpoint.id).lean();
      expect(stored.socialCaption).toBe('first caption');
      expect(stored.document).toEqual(issue.document);
      await expect(revisionService.restoreCheckpoint(req, accountId, issue.id, stored._id, { revision: 2 }))
        .resolves.toMatchObject({ status: 409, code: 'REVISION_CONFLICT' });
    });

    test('restoring an older checkpoint preserves a caption it never captured', async () => {
      const issue = await manualIssue({ socialCaption: 'keep this caption' });
      const { PivotCarouselDeck, PivotCarouselRevision } = models();
      const checkpoint = await PivotCarouselRevision.create({
        issueId: issue.id, accountId, headRevision: 1, kind: 'checkpoint', name: 'Old checkpoint', document: makeDocument('old slides'),
      });
      const restored = await revisionService.restoreCheckpoint(req, accountId, issue.id, checkpoint._id, { revision: 1 });
      expect(restored.data.issue.socialCaption).toBe('keep this caption');
      expect((await PivotCarouselDeck.findById(issue.id).lean()).socialCaption).toBe('keep this caption');
    });

    test('a slides-only save preserves the caption', async () => {
      const issue = await manualIssue();
      const captioned = await updateCarouselIssue(req, accountId, issue.id, {
        revision: 1,
        socialCaption: 'go outside',
      });
      const edited = await updateCarouselIssue(req, accountId, issue.id, {
        revision: captioned.data.issue.revision,
        document: makeDocument('new words'),
      });
      expect(edited.data.issue.revision).toBe(3);
      expect(edited.data.issue.socialCaption).toBe('go outside');
    });

    test('a caption that is too long or not text is refused', async () => {
      const issue = await manualIssue();
      expect(await updateCarouselIssue(req, accountId, issue.id, {
        revision: 1,
        socialCaption: 'x'.repeat(MAX_SOCIAL_CAPTION_LENGTH + 1),
      })).toMatchObject({ code: 'CAPTION_TOO_LONG', status: 422 });
      expect(await updateCarouselIssue(req, accountId, issue.id, {
        revision: 1,
        socialCaption: { text: 'nope' },
      })).toMatchObject({ code: 'INVALID_CAPTION', status: 422 });

      const { PivotCarouselDeck } = models();
      expect((await PivotCarouselDeck.findById(issue.id).lean()).revision).toBe(1);
    });

    test('a stale caption save loses to the write that already landed', async () => {
      const issue = await manualIssue();
      await updateCarouselIssue(req, accountId, issue.id, { revision: 1, socialCaption: 'first' });
      const stale = await updateCarouselIssue(req, accountId, issue.id, { revision: 1, socialCaption: 'second' });
      expect(stale).toMatchObject({ code: 'REVISION_CONFLICT', status: 409, storedRevision: 2 });
      const { PivotCarouselDeck } = models();
      expect((await PivotCarouselDeck.findById(issue.id).lean()).socialCaption).toBe('first');
    });
  });

  describe('approval is bound to one exact revision', () => {
    test('approval covers slides and caption together and is idempotent', async () => {
      const issue = (await generatedIssue()).data.issue;
      const approved = await approveCarouselIssue(req, accountId, issue.id, {
        revision: 1,
      });
      expect(approved.data.issue.reviewState).toBe('approved');
      expect(approved.data.issue.approval).toMatchObject({
        revision: 1,
        approvedBy: 'admin-1',
      });

      const again = await approveCarouselIssue(req, accountId, issue.id, { revision: 1 });
      expect(again.data.alreadyApproved).toBe(true);
    });

    test('approving a revision nobody is on is refused', async () => {
      const issue = (await generatedIssue()).data.issue;
      await updateCarouselIssue(req, accountId, issue.id, { revision: 1, document: makeDocument('edited') });
      const stale = await approveCarouselIssue(req, accountId, issue.id, { revision: 1 });
      expect(stale).toMatchObject({ code: 'REVISION_CONFLICT', storedRevision: 2 });

      const { PivotCarouselDeck } = models();
      expect((await PivotCarouselDeck.findById(issue.id).lean()).reviewState).toBe('unapproved');
    });

    test('any later edit returns a generated issue to unapproved draft', async () => {
      const issue = (await generatedIssue()).data.issue;
      await approveCarouselIssue(req, accountId, issue.id, { revision: 1 });

      for (const [label, body] of [
        ['slides', { document: makeDocument('changed') }],
        ['caption', { socialCaption: 'rewritten' }],
      ]) {
        const current = (await getCarouselIssue(req, accountId, issue.id)).data.issue;
        await approveCarouselIssue(req, accountId, issue.id, { revision: current.revision });
        const edited = await updateCarouselIssue(req, accountId, issue.id, {
          revision: current.revision,
          ...body,
        });
        expect(edited.data.issue.reviewState).toBe('unapproved');
        expect(edited.data.issue.approval).toBeNull();
        expect(label).toBeTruthy();
      }
    });

    test('a rename also invalidates approval, because approval names a revision', async () => {
      const issue = (await generatedIssue()).data.issue;
      await approveCarouselIssue(req, accountId, issue.id, { revision: 1 });
      const renamed = await renameCarouselIssue(req, accountId, issue.id, { name: 'New name', revision: 1 });
      expect(renamed.data.issue.revision).toBe(2);
      expect(renamed.data.issue.reviewState).toBe('unapproved');
      expect(renamed.data.issue.approval).toBeNull();
    });

    test('an edit and an approval racing on the same revision cannot both win', async () => {
      const issue = (await generatedIssue()).data.issue;
      const [edit, approve] = await Promise.all([
        updateCarouselIssue(req, accountId, issue.id, { revision: 1, document: makeDocument('raced') }),
        approveCarouselIssue(req, accountId, issue.id, { revision: 1 }),
      ]);
      expect([edit, approve].filter((result) => !result.error).length).toBeGreaterThanOrEqual(1);

      const { PivotCarouselDeck } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      // The invariant that matters, whichever order the two landed in: an
      // approval either does not exist or names the revision that is actually
      // current. It can never describe content nobody approved.
      if (stored.approval) {
        expect(stored.approval.revision).toBe(stored.revision);
        expect(stored.reviewState).toBe('approved');
      } else {
        expect(stored.reviewState).toBe('unapproved');
      }

      if (!edit.error) {
        // The edit won the swap, so the approval it raced is gone even though
        // approving does not move the revision.
        expect(stored.revision).toBe(2);
        expect(stored.approval).toBeFalsy();
      }
    });
  });

  describe('posting is a separate, manual, immutable record', () => {
    test('a generated issue needs an approved exact revision before it can be posted', async () => {
      const issue = (await generatedIssue()).data.issue;
      expect(await markCarouselIssuePosted(req, accountId, issue.id, { revision: 1 }))
        .toMatchObject({ code: 'APPROVAL_REQUIRED', status: 409 });

      await approveCarouselIssue(req, accountId, issue.id, { revision: 1 });
      const posted = await markCarouselIssuePosted(req, accountId, issue.id, {
        revision: 1,
        postedAt: '2026-10-05T23:04:00.000Z',
        instagramUrl: 'https://www.instagram.com/p/fixture-post-001/',
      });
      expect(posted.data.issue.posting).toMatchObject({
        revision: 1,
        postedBy: 'admin-1',
        instagramUrl: 'https://www.instagram.com/p/fixture-post-001/',
      });
      expect(new Date(posted.data.issue.posting.postedAt).toISOString()).toBe('2026-10-05T23:04:00.000Z');
      expect(posted.data.issue.postHistory).toHaveLength(1);
      expect(posted.data.issue.reviewState).toBe('posted');
    });

    test('a manual issue acquires posted history without a review state', async () => {
      const issue = await manualIssue();
      const posted = await markCarouselIssuePosted(req, accountId, issue.id, {
        revision: 1,
        postedAt: '2026-10-01T23:00:00.000Z',
      });
      expect(posted.data.issue.origin).toBe('manual');
      expect(posted.data.issue.reviewState).toBeNull();
      expect(posted.data.issue.approval).toBeNull();
      expect(posted.data.issue.posting.revision).toBe(1);
    });

    test('a retried mark-posted does not claim the issue went out twice', async () => {
      const issue = await manualIssue();
      const first = await markCarouselIssuePosted(req, accountId, issue.id, { revision: 1 });
      const retry = await markCarouselIssuePosted(req, accountId, issue.id, { revision: 1 });
      expect(retry.data.alreadyPosted).toBe(true);
      expect(retry.data.issue.postHistory).toHaveLength(1);
      expect(retry.data.issue.posting.recordedAt).toEqual(first.data.issue.posting.recordedAt);

      const { PivotCarouselRevision } = models();
      expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id, kind: 'posted' })).toBe(1);
    });

    test('concurrent mark-posted calls record one post', async () => {
      const issue = await manualIssue();
      const results = await Promise.all([
        markCarouselIssuePosted(req, accountId, issue.id, { revision: 1 }),
        markCarouselIssuePosted(req, accountId, issue.id, { revision: 1 }),
      ]);
      expect(results.every((result) => !result.error)).toBe(true);
      const { PivotCarouselDeck } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.postHistory).toHaveLength(1);
    });

    test('a later edit cannot rewrite what was posted', async () => {
      const issue = await manualIssue();
      await updateCarouselIssue(req, accountId, issue.id, { revision: 1, socialCaption: 'as published' });
      const posted = await markCarouselIssuePosted(req, accountId, issue.id, { revision: 2 });
      const snapshotId = posted.data.snapshotRevisionId;

      await updateCarouselIssue(req, accountId, issue.id, {
        revision: 2,
        document: makeDocument('rewritten after the fact'),
        socialCaption: 'rewritten after the fact',
      });

      const { PivotCarouselRevision, PivotCarouselDeck } = models();
      const snapshot = await PivotCarouselRevision.findById(snapshotId).lean();
      expect(snapshot.socialCaption).toBe('as published');
      expect(JSON.stringify(snapshot.document)).toContain('lanterns');
      expect(JSON.stringify(snapshot.document)).not.toContain('rewritten after the fact');

      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.postHistory[0].revision).toBe(2);
      expect(stored.posting.revision).toBe(2);
      expect(stored.revision).toBe(3);
    });

    test('export, archive, generation and approval never imply a post', async () => {
      const issue = (await generatedIssue()).data.issue;
      const { PivotCarouselDeck } = models();
      await PivotCarouselDeck.updateOne({ _id: issue.id }, { $set: { lastExportedAt: new Date() } });
      await archiveCarouselIssue(req, accountId, issue.id, { revision: 1 });
      const current = (await getCarouselIssue(req, accountId, issue.id)).data.issue;
      await approveCarouselIssue(req, accountId, issue.id, { revision: current.revision });

      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.lastExportedAt).toBeTruthy();
      expect(stored.status).toBe('archived');
      expect(stored.reviewState).toBe('approved');
      expect(stored.posting).toBeNull();
      expect(stored.postHistory).toBeUndefined();
    });

    test('a nonsense publication time or Instagram URL is refused', async () => {
      const issue = await manualIssue();
      expect(await markCarouselIssuePosted(req, accountId, issue.id, { revision: 1, postedAt: 'yesterday' }))
        .toMatchObject({ code: 'INVALID_POSTED_AT' });
      expect(await markCarouselIssuePosted(req, accountId, issue.id, {
        revision: 1,
        postedAt: new Date(Date.now() + 86_400_000).toISOString(),
      })).toMatchObject({ code: 'INVALID_POSTED_AT' });
      expect(await markCarouselIssuePosted(req, accountId, issue.id, {
        revision: 1,
        instagramUrl: 'https://example.test/not-instagram',
      })).toMatchObject({ code: 'INVALID_INSTAGRAM_URL' });

      const { PivotCarouselDeck } = models();
      expect((await PivotCarouselDeck.findById(issue.id).lean()).posting).toBeNull();
    });
  });

  describe('posted snapshots survive autosave retention', () => {
    test('pruning past twenty-five autosaves keeps posted snapshots', async () => {
      const created = await generatedIssue();
      const issue = created.data.issue;
      await approveCarouselIssue(req, accountId, issue.id, { revision: 1 });
      await markCarouselIssuePosted(req, accountId, issue.id, { revision: 1 });

      const passes = RETENTION.autosaveSnapshotsPerIssue + 5;
      for (let index = 0; index < passes; index += 1) {
        const saved = await updateCarouselIssue(req, accountId, issue.id, {
          revision: index + 1,
          document: makeDocument(`autosave-${index}`),
        });
        expect(saved.error).toBeUndefined();
      }

      const { PivotCarouselRevision } = models();
      const saves = await PivotCarouselRevision.find({ issueId: issue.id, kind: 'save' }).lean();
      expect(saves).toHaveLength(RETENTION.autosaveSnapshotsPerIssue);

      const posted = await PivotCarouselRevision.find({ issueId: issue.id, kind: 'posted' }).lean();
      expect(posted).toHaveLength(1);
      expect(posted[0].headRevision).toBe(1);
    });

    test('a posted snapshot can capture a legacy issue that has slides but no document', async () => {
      const legacy = await createCarouselIssue(req, accountId, {
        name: 'Legacy',
        slides: [{ type: 'cover', values: { title: 'old' } }],
      });
      expect(legacy.data.issue.schemaVersion).toBe(1);
      const posted = await markCarouselIssuePosted(req, accountId, legacy.data.issue.id, { revision: 1 });

      const { PivotCarouselRevision } = models();
      const snapshot = await PivotCarouselRevision.findById(posted.data.snapshotRevisionId).lean();
      expect(snapshot.kind).toBe('posted');
      expect(snapshot.document).toBeNull();
      expect(snapshot.slides).toHaveLength(1);
      expect(snapshot.slides[0].values.title).toBe('old');
    });
  });
});
