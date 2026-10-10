const express = require('express');
const request = require('supertest');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');

const ADMIN = { globalUserId: '507f191e810c19729de860ea', email: 'editor@justgo.lol' };
const OUTSIDER = { globalUserId: '507f191e810c19729de860eb', email: 'outsider@justgo.lol' };

let currentUser = ADMIN;
let platformAdmin = true;

jest.mock('../../middlewares/verifyToken', () => ({
  verifyToken: (req, _res, next) => {
    req.user = { ...currentUser };
    next();
  },
}));

jest.mock('../../middlewares/requirePlatformAdmin', () => ({
  requirePlatformAdmin: (_req, res, next) => {
    if (!platformAdmin) return res.status(403).json({ success: false, message: 'Platform admin required.' });
    return next();
  },
}));

jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(async (_req, key) => {
    const tenantKey = String(key || '').toLowerCase();
    if (['sf', 'nyc'].includes(tenantKey)) return { tenantKey, pivotPilot: true };
    return null;
  }),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const pivotAdminRoutes = require('../../routes/pivotAdminRoutes');
const { createGeneratedCarouselIssue } = require('../../services/pivotCarouselIssueService');
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

describe('pivotAdmin carousel editorial routes outcomes', () => {
  let mongo;
  let app;
  let serviceReq;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    serviceReq = { globalDb: mongo.globalConnection, user: { ...ADMIN } };

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      // Mirrors the real request shape: a tenant connection, the tenant key the
      // host resolved to, and the separate platform connection.
      req.db = mongo.connection;
      req.school = 'sf';
      req.globalDb = mongo.globalConnection;
      next();
    });
    app.use('/admin/pivot', pivotAdminRoutes);
  });

  beforeEach(async () => {
    await mongo.reset();
    currentUser = ADMIN;
    platformAdmin = true;
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  function models() {
    return getGlobalModels(serviceReq, 'PivotCarouselDeck', 'PivotCarouselRevision');
  }

  async function createAccount(overrides = {}) {
    const response = await request(app)
      .post('/admin/pivot/carousel-accounts')
      .send({
        displayName: 'Just Go SF',
        ownerTenantKey: 'sf',
        sourceTenantKeys: ['sf'],
        ...overrides,
      });
    expect(response.status).toBe(201);
    return response.body.data.account;
  }

  async function createManualIssue(accountId, body = {}) {
    const response = await request(app)
      .post(`/admin/pivot/carousel-accounts/${accountId}/issues`)
      .send({ name: 'Lanterns', document: makeDocument(), ...body });
    expect(response.status).toBe(201);
    return response.body.data.issue;
  }

  async function createGenerated(accountId, overrides = {}) {
    const created = await createGeneratedCarouselIssue(serviceReq, accountId, {
      name: 'Made by hand',
      document: makeDocument(),
      socialCaption: 'three nights worth leaving the house for',
      generation: {
        jobId: 'job:compose-sf-0001',
        attemptId: '653000000000000000000301',
        proposalIdempotencyKey: 'idem:compose-proposal-sf-0001',
        policyVersion: 'pol:carousel.0123456789abcdef0123456789abcdef',
        feedbackVersion: 'fb:sf.v3',
      },
      ...overrides,
    });
    expect(created.error).toBeUndefined();
    return created.data.issue;
  }

  describe('authorization and scope', () => {
    it('refuses every editorial action without platform admin', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      platformAdmin = false;

      for (const path of ['approve', 'reject', 'mark-posted']) {
        const response = await request(app)
          .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/${path}`)
          .send({ revision: 1 });
        expect(response.status).toBe(403);
      }

      platformAdmin = true;
      const { PivotCarouselDeck } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.reviewState).toBe('unapproved-draft');
      expect(stored.posting).toBeNull();
    });

    it('refuses an issue that belongs to another account', async () => {
      const sf = await createAccount();
      const nyc = await createAccount({
        displayName: 'Just Go NYC',
        ownerTenantKey: 'nyc',
        sourceTenantKeys: ['nyc'],
      });
      const issue = await createGenerated(sf.id);

      const response = await request(app)
        .post(`/admin/pivot/carousel-accounts/${nyc.id}/issues/${issue.id}/approve`)
        .send({ revision: 1 });
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ISSUE_NOT_FOUND');

      const { PivotCarouselDeck } = models();
      expect((await PivotCarouselDeck.findById(issue.id).lean()).reviewState).toBe('unapproved-draft');
    });

    it('refuses an account whose owner tenant is not a Pivot city', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      const { PivotCarouselAccount } = getGlobalModels(serviceReq, 'PivotCarouselAccount');
      await PivotCarouselAccount.updateOne({ _id: account.id }, { $set: { ownerTenantKey: 'campus' } });

      const response = await request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/approve`)
        .send({ revision: 1 });
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('TENANT_NOT_FOUND');
    });
  });

  describe('captions over the wire', () => {
    it('saves, reloads and conflicts on a caption like any other content', async () => {
      const account = await createAccount();
      const issue = await createManualIssue(account.id);

      const saved = await request(app)
        .patch(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`)
        .send({ revision: 1, socialCaption: 'three openings and a long walk' });
      expect(saved.status).toBe(200);
      expect(saved.body.data.issue.socialCaption).toBe('three openings and a long walk');
      expect(saved.body.data.issue.captionRevision).toBe(2);

      const reloaded = await request(app)
        .get(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`);
      expect(reloaded.body.data.issue.socialCaption).toBe('three openings and a long walk');

      const stale = await request(app)
        .patch(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`)
        .send({ revision: 1, socialCaption: 'too late' });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('REVISION_CONFLICT');
      expect(stale.body.storedRevision).toBe(2);

      const { PivotCarouselDeck } = models();
      expect((await PivotCarouselDeck.findById(issue.id).lean()).socialCaption)
        .toBe('three openings and a long walk');
    });

    it('rejects an oversized caption and stores nothing', async () => {
      const account = await createAccount();
      const issue = await createManualIssue(account.id);

      const response = await request(app)
        .patch(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`)
        .send({ revision: 1, socialCaption: 'x'.repeat(2201) });
      expect(response.status).toBe(422);
      expect(response.body.code).toBe('CAPTION_TOO_LONG');

      const { PivotCarouselDeck } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.revision).toBe(1);
      expect(stored.socialCaption).toBe('');
    });
  });

  describe('approve, reject and mark posted', () => {
    it('approves an exact revision and records what was approved', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);

      const response = await request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/approve`)
        .send({ revision: 1, captionRevision: 1, note: 'ship it' });
      expect(response.status).toBe(200);
      expect(response.body.data.issue.reviewState).toBe('approved');
      expect(response.body.data.issue.approval).toMatchObject({ revision: 1, captionRevision: 1 });

      const { PivotCarouselDeck, PivotCarouselRevision } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.reviewState).toBe('approved');
      expect(stored.approval.approvedBy).toBe(ADMIN.globalUserId);
      expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id, kind: 'approval' })).toBe(1);
    });

    it('refuses to approve a manual issue', async () => {
      const account = await createAccount();
      const issue = await createManualIssue(account.id);

      const response = await request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/approve`)
        .send({ revision: 1 });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('NOT_GENERATED_ISSUE');

      const { PivotCarouselDeck } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.reviewState).toBeNull();
      expect(stored.approval).toBeNull();
    });

    it('returns a generated issue to unapproved draft after an edit', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      await request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/approve`)
        .send({ revision: 1 });

      const edited = await request(app)
        .patch(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`)
        .send({ revision: 1, socialCaption: 'rewritten after approval' });
      expect(edited.status).toBe(200);
      expect(edited.body.data.issue.reviewState).toBe('unapproved-draft');
      expect(edited.body.data.issue.approval).toBeNull();

      const posted = await request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/mark-posted`)
        .send({ revision: 2 });
      expect(posted.status).toBe(409);
      expect(posted.body.code).toBe('APPROVAL_REQUIRED');

      const { PivotCarouselDeck } = models();
      expect((await PivotCarouselDeck.findById(issue.id).lean()).posting).toBeNull();
    });

    it('records a manual post with its actual publication time and link', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      await request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/approve`)
        .send({ revision: 1 });

      const response = await request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/mark-posted`)
        .send({
          revision: 1,
          postedAt: '2026-10-05T23:04:00.000Z',
          instagramUrl: 'https://www.instagram.com/p/fixture-post-001/',
        });
      expect(response.status).toBe(200);
      expect(response.body.data.issue.posting).toMatchObject({
        revision: 1,
        instagramUrl: 'https://www.instagram.com/p/fixture-post-001/',
      });

      const { PivotCarouselDeck, PivotCarouselRevision } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.posting.postedAt.toISOString()).toBe('2026-10-05T23:04:00.000Z');
      expect(stored.posting.postedBy).toBe(ADMIN.globalUserId);
      expect(stored.postHistory).toHaveLength(1);

      const snapshot = await PivotCarouselRevision.findById(stored.posting.snapshotRevisionId).lean();
      expect(snapshot.kind).toBe('posted');
      expect(snapshot.socialCaption).toBe('three nights worth leaving the house for');
    });

    it('lets a manual issue acquire posted history with no review state', async () => {
      const account = await createAccount();
      const issue = await createManualIssue(account.id);

      const response = await request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/mark-posted`)
        .send({ revision: 1, postedAt: '2026-10-01T23:00:00.000Z' });
      expect(response.status).toBe(200);
      expect(response.body.data.issue.origin).toBe('manual');
      expect(response.body.data.issue.reviewState).toBeNull();
      expect(response.body.data.issue.posting.revision).toBe(1);
    });

    it('treats a duplicate mark-posted request as the post it already recorded', async () => {
      const account = await createAccount();
      const issue = await createManualIssue(account.id);
      const send = () => request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/mark-posted`)
        .send({ revision: 1, postedAt: '2026-10-01T23:00:00.000Z' });

      const first = await send();
      const retry = await send();
      expect(first.status).toBe(200);
      expect(retry.status).toBe(200);
      expect(retry.body.data.alreadyPosted).toBe(true);

      const { PivotCarouselDeck, PivotCarouselRevision } = models();
      expect((await PivotCarouselDeck.findById(issue.id).lean()).postHistory).toHaveLength(1);
      expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id, kind: 'posted' })).toBe(1);
    });

    it('rejects a bad publication time or link without recording a post', async () => {
      const account = await createAccount();
      const issue = await createManualIssue(account.id);

      const badTime = await request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/mark-posted`)
        .send({ revision: 1, postedAt: 'last tuesday' });
      expect(badTime.status).toBe(422);
      expect(badTime.body.code).toBe('INVALID_POSTED_AT');

      const badLink = await request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/mark-posted`)
        .send({ revision: 1, instagramUrl: 'https://example.test/not-instagram' });
      expect(badLink.status).toBe(422);
      expect(badLink.body.code).toBe('INVALID_INSTAGRAM_URL');

      const { PivotCarouselDeck } = models();
      expect((await PivotCarouselDeck.findById(issue.id).lean()).posting).toBeNull();
    });

    it('rejecting archives without posting and without deleting the draft', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);

      const response = await request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/reject`)
        .send({ revision: 1, archive: true });
      expect(response.status).toBe(200);
      expect(response.body.data.issue.status).toBe('archived');
      expect(response.body.data.issue.reviewState).toBe('unapproved-draft');

      const { PivotCarouselDeck } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored).toBeTruthy();
      expect(stored.posting).toBeNull();
    });
  });

  describe('concurrency over the wire', () => {
    it('an approval and an edit on the same revision never both take effect', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);

      const [approve, edit] = await Promise.all([
        request(app)
          .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/approve`)
          .send({ revision: 1 }),
        request(app)
          .patch(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`)
          .send({ revision: 1, document: makeDocument('raced') }),
      ]);
      expect([approve.status, edit.status]).toContain(200);

      const { PivotCarouselDeck } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      if (stored.approval) {
        expect(stored.approval.revision).toBe(stored.revision);
      } else {
        expect(stored.reviewState).toBe('unapproved-draft');
      }
      if (edit.status === 200) {
        expect(stored.revision).toBe(2);
        expect(stored.approval).toBeFalsy();
      }
    });

    it('an edit racing a post leaves at most one posted record for a revision', async () => {
      const account = await createAccount();
      const issue = await createManualIssue(account.id);

      const [post, edit] = await Promise.all([
        request(app)
          .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/mark-posted`)
          .send({ revision: 1 }),
        request(app)
          .patch(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`)
          .send({ revision: 1, document: makeDocument('raced') }),
      ]);
      expect([post.status, edit.status]).toContain(200);

      const { PivotCarouselDeck } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      const history = stored.postHistory || [];
      expect(history.length).toBeLessThanOrEqual(1);
      for (const entry of history) {
        expect(entry.revision).toBe(1);
      }
    });
  });

  describe('history durability over the wire', () => {
    it('keeps a committed history row for every accepted save', async () => {
      const account = await createAccount();
      const issue = await createManualIssue(account.id);

      for (let revision = 1; revision <= 3; revision += 1) {
        const response = await request(app)
          .patch(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`)
          .send({ revision, document: makeDocument(`pass-${revision}`) });
        expect(response.status).toBe(200);
      }

      const { PivotCarouselDeck, PivotCarouselRevision } = models();
      expect((await PivotCarouselDeck.findById(issue.id).lean()).pendingSnapshot).toBeNull();
      const rows = await PivotCarouselRevision.find({ issueId: issue.id, kind: 'save' }).lean();
      expect(rows.map((row) => row.headRevision).sort()).toEqual([2, 3, 4]);
      expect(rows.every((row) => row.status === 'committed')).toBe(true);
    });

    it('prunes past twenty-five autosaves while protected baselines survive', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      await request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/approve`)
        .send({ revision: 1 });
      await request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/mark-posted`)
        .send({ revision: 1 });

      const passes = RETENTION.autosaveSnapshotsPerIssue + 4;
      for (let index = 0; index < passes; index += 1) {
        const response = await request(app)
          .patch(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`)
          .send({ revision: index + 1, document: makeDocument(`autosave-${index}`) });
        expect(response.status).toBe(200);
      }

      const { PivotCarouselRevision } = models();
      expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id, kind: 'save' }))
        .toBe(RETENTION.autosaveSnapshotsPerIssue);
      for (const kind of ['generation', 'approval', 'posted']) {
        expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id, kind })).toBe(1);
      }
      const posted = await PivotCarouselRevision.findOne({ issueId: issue.id, kind: 'posted' }).lean();
      expect(JSON.stringify(posted.document)).toContain('lanterns');
    });
  });
});
