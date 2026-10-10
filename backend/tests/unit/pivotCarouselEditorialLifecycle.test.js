const { createMongoMemoryConnection } = require('../helpers/mongoMemory');

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
  updateCarouselIssue,
  renameCarouselIssue,
  archiveCarouselIssue,
  duplicateCarouselIssue,
  approveCarouselIssue,
  rejectCarouselIssue,
  markCarouselIssuePosted,
  MAX_SOCIAL_CAPTION_LENGTH,
} = require('../../services/pivotCarouselIssueService');
const revisionService = require('../../services/pivotCarouselRevisionService');
const { RETENTION } = require('../../schemas/pivotCarouselRevision');
const { backfillCarouselEditorialFields } = require('../../migrations/backfillPivotCarouselEditorialFields');

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
      generation: {
        jobId: 'job:compose-sf-0001',
        attemptId: '653000000000000000000301',
        proposalIdempotencyKey: 'idem:compose-proposal-sf-0001',
        contextVersion: 'ctx:compose.sf.v1',
        policyVersion: 'pol:carousel.0123456789abcdef0123456789abcdef',
        feedbackVersion: 'fb:sf.v3',
        implementationRevision: 'relay-worker@test',
        generatedAt: '2026-10-05T07:12:00.000Z',
      },
      ...overrides,
    });
    return created;
  }

  describe('origin, review state and archival stay separate', () => {
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
      expect(await rejectCarouselIssue(req, accountId, issue.id, { revision: 2 }))
        .toMatchObject({ code: 'NOT_GENERATED_ISSUE' });
    });

    test('a generated issue starts as an unapproved draft with its baseline kept', async () => {
      const created = await generatedIssue();
      const issue = created.data.issue;
      expect(issue.origin).toBe('agent-generated');
      expect(issue.reviewState).toBe('unapproved-draft');
      expect(issue.status).toBe('active');
      expect(issue.generation.jobId).toBe('job:compose-sf-0001');
      expect(issue.generation.policyVersion).toMatch(/^pol:/);
      expect(issue.socialCaption).toBe('three nights worth leaving the house for');

      const { PivotCarouselRevision } = models();
      const baseline = await PivotCarouselRevision.findById(created.data.baselineRevisionId).lean();
      expect(baseline.kind).toBe('generation');
      expect(baseline.status).toBe('committed');
      expect(baseline.socialCaption).toBe('three nights worth leaving the house for');
      expect(baseline.document.slides).toHaveLength(1);
    });

    test('archiving a generated draft does not approve it and approving does not archive it', async () => {
      const issue = (await generatedIssue()).data.issue;
      const archived = await archiveCarouselIssue(req, accountId, issue.id, { revision: 1 });
      expect(archived.data.issue.status).toBe('archived');
      expect(archived.data.issue.reviewState).toBe('unapproved-draft');

      const approved = await approveCarouselIssue(req, accountId, issue.id, {
        revision: archived.data.issue.revision,
      });
      expect(approved.data.issue.reviewState).toBe('approved');
      expect(approved.data.issue.status).toBe('archived');
    });

    test('a duplicate and an editable copy are new human work', async () => {
      const issue = (await generatedIssue()).data.issue;
      const copy = await duplicateCarouselIssue(req, accountId, issue.id);
      expect(copy.data.issue.origin).toBe('manual');
      expect(copy.data.issue.reviewState).toBeNull();
      expect(copy.data.issue.generation).toBeNull();
      expect(copy.data.issue.socialCaption).toBe(issue.socialCaption);
      expect(copy.data.issue.captionRevision).toBe(1);
    });
  });

  describe('captions are content', () => {
    test('a caption saves under the same revision contract as the slides', async () => {
      const issue = await manualIssue();
      expect(issue.socialCaption).toBe('');
      expect(issue.captionRevision).toBe(1);

      const saved = await updateCarouselIssue(req, accountId, issue.id, {
        revision: 1,
        socialCaption: '  three openings and a long walk between them  ',
      });
      expect(saved.data.issue.revision).toBe(2);
      expect(saved.data.issue.captionRevision).toBe(2);
      expect(saved.data.issue.socialCaption).toBe('three openings and a long walk between them');

      const { PivotCarouselDeck } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.socialCaption).toBe('three openings and a long walk between them');
      expect(stored.captionRevision).toBe(2);
    });

    test('a slides-only save leaves the caption revision where it was', async () => {
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
      expect(edited.data.issue.captionRevision).toBe(2);
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
        captionRevision: 1,
        note: 'ship it',
      });
      expect(approved.data.issue.reviewState).toBe('approved');
      expect(approved.data.issue.approval).toMatchObject({
        revision: 1,
        captionRevision: 1,
        approvedBy: 'admin-1',
        note: 'ship it',
      });

      const again = await approveCarouselIssue(req, accountId, issue.id, { revision: 1 });
      expect(again.data.alreadyApproved).toBe(true);

      const { PivotCarouselRevision } = models();
      const baselines = await PivotCarouselRevision.find({ issueId: issue.id, kind: 'approval' }).lean();
      expect(baselines).toHaveLength(1);
      expect(baselines[0].socialCaption).toBe(issue.socialCaption);
    });

    test('approving a revision nobody is on is refused', async () => {
      const issue = (await generatedIssue()).data.issue;
      await updateCarouselIssue(req, accountId, issue.id, { revision: 1, document: makeDocument('edited') });
      const stale = await approveCarouselIssue(req, accountId, issue.id, { revision: 1 });
      expect(stale).toMatchObject({ code: 'REVISION_CONFLICT', storedRevision: 2 });

      const { PivotCarouselDeck } = models();
      expect((await PivotCarouselDeck.findById(issue.id).lean()).reviewState).toBe('unapproved-draft');
    });

    test('a caption changed after review blocks an approval that named the old caption', async () => {
      const issue = (await generatedIssue()).data.issue;
      const captioned = await updateCarouselIssue(req, accountId, issue.id, {
        revision: 1,
        socialCaption: 'a different caption',
      });
      const mismatch = await approveCarouselIssue(req, accountId, issue.id, {
        revision: captioned.data.issue.revision,
        captionRevision: 1,
      });
      expect(mismatch).toMatchObject({ code: 'REVISION_CONFLICT', storedCaptionRevision: 2 });
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
        expect(edited.data.issue.reviewState).toBe('unapproved-draft');
        expect(edited.data.issue.approval).toBeNull();
        expect(label).toBeTruthy();
      }
    });

    test('a rename also invalidates approval, because approval names a revision', async () => {
      const issue = (await generatedIssue()).data.issue;
      await approveCarouselIssue(req, accountId, issue.id, { revision: 1 });
      const renamed = await renameCarouselIssue(req, accountId, issue.id, { name: 'New name', revision: 1 });
      expect(renamed.data.issue.revision).toBe(2);
      expect(renamed.data.issue.reviewState).toBe('unapproved-draft');
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
        expect(stored.reviewState).toBe('unapproved-draft');
      }

      if (!edit.error) {
        // The edit won the swap, so the approval it raced is gone even though
        // approving does not move the revision.
        expect(stored.revision).toBe(2);
        expect(stored.approval).toBeFalsy();
      }
    });

    test('rejecting returns the draft and can archive without implying a post', async () => {
      const issue = (await generatedIssue()).data.issue;
      await approveCarouselIssue(req, accountId, issue.id, { revision: 1 });
      const rejected = await rejectCarouselIssue(req, accountId, issue.id, { revision: 1, archive: true });
      expect(rejected.data.issue.reviewState).toBe('unapproved-draft');
      expect(rejected.data.issue.approval).toBeNull();
      expect(rejected.data.issue.status).toBe('archived');
      expect(rejected.data.issue.posting).toBeNull();
      expect(rejected.data.issue.postHistory).toEqual([]);
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
        captionRevision: 1,
        postedBy: 'admin-1',
        instagramUrl: 'https://www.instagram.com/p/fixture-post-001/',
      });
      expect(new Date(posted.data.issue.posting.postedAt).toISOString()).toBe('2026-10-05T23:04:00.000Z');
      expect(posted.data.issue.postHistory).toHaveLength(1);
    });

    test('the combined action approves and posts in one step', async () => {
      const issue = (await generatedIssue()).data.issue;
      const posted = await markCarouselIssuePosted(req, accountId, issue.id, {
        revision: 1,
        approve: true,
        note: 'approved while posting',
      });
      expect(posted.data.issue.reviewState).toBe('approved');
      expect(posted.data.issue.approval.note).toBe('approved while posting');
      expect(posted.data.issue.posting.revision).toBe(1);
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

  describe('durable history', () => {
    test('a save that cannot record its history does not move the head', async () => {
      const issue = await manualIssue();
      const spy = jest.spyOn(revisionService, 'beginHeadSnapshot')
        .mockRejectedValueOnce(new Error('history store unavailable'));

      const result = await updateCarouselIssue(req, accountId, issue.id, {
        revision: 1,
        document: makeDocument('unrecordable'),
      });
      expect(result).toMatchObject({ code: 'HISTORY_UNAVAILABLE', status: 503 });

      const { PivotCarouselDeck } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.revision).toBe(1);
      expect(JSON.stringify(stored.document)).toContain('lanterns');
      spy.mockRestore();
    });

    test('every acknowledged save has a committed history row', async () => {
      const issue = await manualIssue();
      for (let index = 0; index < 3; index += 1) {
        await updateCarouselIssue(req, accountId, issue.id, {
          revision: index + 1,
          document: makeDocument(`pass-${index}`),
        });
      }
      const { PivotCarouselRevision, PivotCarouselDeck } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      const saves = await PivotCarouselRevision.find({ issueId: issue.id, kind: 'save' }).lean();
      expect(stored.revision).toBe(4);
      expect(stored.pendingSnapshot).toBeNull();
      expect(saves.map((row) => row.headRevision).sort()).toEqual([2, 3, 4]);
      expect(saves.every((row) => row.status === 'committed')).toBe(true);
    });

    test('an interrupted save is committed on restart once its head write landed', async () => {
      const issue = await manualIssue();
      const spy = jest.spyOn(revisionService, 'commitHeadSnapshot')
        .mockImplementationOnce(async () => { throw new Error('process died'); });

      await expect(updateCarouselIssue(req, accountId, issue.id, {
        revision: 1,
        document: makeDocument('interrupted'),
      })).rejects.toThrow('process died');
      spy.mockRestore();

      const { PivotCarouselRevision, PivotCarouselDeck } = models();
      const before = await PivotCarouselDeck.findById(issue.id).lean();
      expect(before.revision).toBe(2);
      expect(before.pendingSnapshot.headRevision).toBe(2);
      expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id, status: 'pending' })).toBe(1);

      const reconciled = await revisionService.reconcileIssueSnapshots(req, issue.id);
      expect(reconciled).toEqual({ committed: 1, discarded: 0 });
      const row = await PivotCarouselRevision.findOne({ issueId: issue.id, headRevision: 2 }).lean();
      expect(row.status).toBe('committed');
      expect(JSON.stringify(row.document)).toContain('interrupted');
      expect((await PivotCarouselDeck.findById(issue.id).lean()).pendingSnapshot).toBeNull();
    });

    test('a pending row for a head write that never landed is discarded', async () => {
      const issue = await manualIssue();
      const { PivotCarouselRevision, PivotCarouselDeck } = models();
      const doc = await PivotCarouselDeck.findById(issue.id);
      await revisionService.beginHeadSnapshot(req, { doc, targetRevision: 7 });
      expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id, status: 'pending' })).toBe(1);

      expect(await revisionService.reconcileIssueSnapshots(req, issue.id))
        .toEqual({ committed: 0, discarded: 1 });
      expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id })).toBe(0);
    });

    test('the next write settles an interrupted one before layering on top', async () => {
      const issue = await manualIssue();
      const spy = jest.spyOn(revisionService, 'commitHeadSnapshot')
        .mockImplementationOnce(async () => { throw new Error('process died'); });
      await expect(updateCarouselIssue(req, accountId, issue.id, {
        revision: 1,
        document: makeDocument('interrupted'),
      })).rejects.toThrow('process died');
      spy.mockRestore();

      const next = await updateCarouselIssue(req, accountId, issue.id, {
        revision: 2,
        document: makeDocument('after restart'),
      });
      expect(next.data.issue.revision).toBe(3);

      const { PivotCarouselRevision } = models();
      const rows = await PivotCarouselRevision.find({ issueId: issue.id, kind: 'save' })
        .sort({ headRevision: 1 }).lean();
      expect(rows.map((row) => row.headRevision)).toEqual([2, 3]);
      expect(rows.every((row) => row.status === 'committed')).toBe(true);
    });

    test('unreconciled issues are discoverable for a sweep', async () => {
      const issue = await manualIssue();
      const spy = jest.spyOn(revisionService, 'commitHeadSnapshot')
        .mockImplementationOnce(async () => { throw new Error('process died'); });
      await expect(updateCarouselIssue(req, accountId, issue.id, {
        revision: 1,
        document: makeDocument('interrupted'),
      })).rejects.toThrow('process died');
      spy.mockRestore();

      const pending = await revisionService.findUnreconciledIssues(req);
      expect(pending.map((row) => String(row._id))).toEqual([issue.id]);
      await revisionService.reconcileIssueSnapshots(req, issue.id);
      expect(await revisionService.findUnreconciledIssues(req)).toEqual([]);
    });
  });

  describe('protected baselines survive autosave retention', () => {
    test('pruning past twenty-five autosaves keeps generation, approval and posted rows', async () => {
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

      for (const kind of ['generation', 'approval', 'posted']) {
        const rows = await PivotCarouselRevision.find({ issueId: issue.id, kind }).lean();
        expect(rows).toHaveLength(1);
        expect(rows[0].headRevision).toBe(1);
      }
      const generation = await PivotCarouselRevision.findOne({ issueId: issue.id, kind: 'generation' }).lean();
      expect(JSON.stringify(generation.document)).toContain('lanterns');
    });

    test('a baseline can capture a legacy issue that has slides but no document', async () => {
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

  describe('migration', () => {
    test('backfill is additive, idempotent, and never infers a post', async () => {
      const { PivotCarouselDeck } = models();
      const account = await getGlobalModels(req, 'PivotCarouselAccount').PivotCarouselAccount.findById(accountId);
      await PivotCarouselDeck.collection.insertOne({
        tenantKey: 'sf',
        title: 'Legacy issue',
        name: 'Legacy issue',
        accountId: account._id,
        status: 'archived',
        schemaVersion: 1,
        revision: 4,
        slides: [{ type: 'cover', values: {} }],
        lastExportedAt: new Date('2026-09-01T00:00:00.000Z'),
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      });

      const dryRun = await backfillCarouselEditorialFields(req);
      expect(dryRun.apply).toBe(false);
      expect(dryRun.steps.find((step) => step.name === 'origin').matched).toBe(1);
      expect(dryRun.steps.every((step) => step.modified === 0)).toBe(true);

      const applied = await backfillCarouselEditorialFields(req, { apply: true });
      expect(applied.steps.find((step) => step.name === 'origin').modified).toBe(1);
      expect(applied.captionRevision.modified).toBe(1);

      const stored = await PivotCarouselDeck.findOne({ title: 'Legacy issue' }).lean();
      expect(stored.origin).toBe('manual');
      expect(stored.reviewState).toBeNull();
      expect(stored.socialCaption).toBe('');
      expect(stored.captionRevision).toBe(4);
      // An export and an archive are not evidence of a post.
      expect(stored.posting).toBeUndefined();
      expect(stored.postHistory).toBeUndefined();
      expect(stored.approval).toBeUndefined();

      const second = await backfillCarouselEditorialFields(req, { apply: true });
      expect(second.steps.every((step) => step.matched === 0)).toBe(true);
      expect(second.captionRevision.matched).toBe(0);
    });
  });
});
