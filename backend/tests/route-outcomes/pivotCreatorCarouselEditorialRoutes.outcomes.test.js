const express = require('express');
const request = require('supertest');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');

const ADMIN = { globalUserId: '507f191e810c19729de860ea', email: 'editor@justgo.lol' };
const OUTSIDER = { globalUserId: '507f191e810c19729de860eb', email: 'outsider@justgo.lol' };

let currentUser = ADMIN;
let platformAdmin = true;

jest.mock('../../middlewares/verifyToken', () => ({
  verifyToken: (req, res, next) => {
    if (!currentUser) return res.status(401).json({ success: false, message: 'Authentication required.' });
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
  let writeHooks = [];

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
    writeHooks = [];
  });

  afterEach(() => {
    try {
      for (const hook of writeHooks) expect(hook).toHaveBeenCalled();
    } finally {
      jest.restoreAllMocks();
    }
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  function models() {
    return getGlobalModels(serviceReq, 'PivotCarouselDeck', 'PivotCarouselRevision');
  }

  // Control the race order while every operation still runs against Mongo.
  // Consume the hook before the inner request, so its write uses the real method.
  function interleaveNextWrite(interleave) {
    const { PivotCarouselDeck } = models();
    // getGlobalModels supplies a collection name on each lookup, so Mongoose
    // creates a fresh model constructor. The underlying collection is shared.
    const collection = PivotCarouselDeck.collection;
    const write = collection.findOneAndUpdate.bind(collection);
    const hook = jest.spyOn(collection, 'findOneAndUpdate').mockImplementationOnce(async (...args) => {
      await interleave();
      return write(...args);
    });
    writeHooks.push(hook);
    return hook;
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
      ...overrides,
    });
    expect(created.error).toBeUndefined();
    return created.data.issue;
  }

  describe('authorization and scope', () => {
    it('requires authentication for approval and mark posted', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      currentUser = null;
      for (const action of ['approve', 'mark-posted', 'feedback']) {
        const response = await request(app)
          .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/${action}`)
          .send({ revision: 1 });
        expect(response.status).toBe(401);
      }
      expect((await request(app).get(`/admin/pivot/carousel-accounts/${account.id}/editorial-feedback`)).status).toBe(401);
      const { PivotCarouselDeck, PivotCarouselRevision } = models();
      expect((await PivotCarouselDeck.findById(issue.id).lean()).approval).toBeNull();
      expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id, kind: 'posted' })).toBe(0);
    });

    it('refuses every editorial action without platform admin', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      platformAdmin = false;

      for (const path of ['approve', 'mark-posted', 'feedback']) {
        const response = await request(app)
          .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/${path}`)
          .send({ revision: 1 });
        expect(response.status).toBe(403);
      }
      expect((await request(app).get(`/admin/pivot/carousel-accounts/${account.id}/editorial-feedback`)).status).toBe(403);

      platformAdmin = true;
      const { PivotCarouselDeck } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.reviewState).toBe('unapproved');
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

      for (const action of ['approve', 'mark-posted', 'feedback']) {
        const response = await request(app)
          .post(`/admin/pivot/carousel-accounts/${nyc.id}/issues/${issue.id}/${action}`)
          .send({ revision: 1 });
        expect(response.status).toBe(404);
        expect(response.body.code).toBe('ISSUE_NOT_FOUND');
      }

      const { PivotCarouselDeck } = models();
      expect((await PivotCarouselDeck.findById(issue.id).lean()).reviewState).toBe('unapproved');
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

  describe('editorial feedback over the wire', () => {
    it('appends generated edits and issue notes and reads them with an account version', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      const base = `/admin/pivot/carousel-accounts/${account.id}`;
      const edited = await request(app).patch(`${base}/issues/${issue.id}`)
        .send({ revision: 1, socialCaption: 'Caption after review' });
      expect(edited.status).toBe(200);
      expect(edited.body.data.issue.editorialVersion).toBe(1);
      const noted = await request(app).post(`${base}/issues/${issue.id}/feedback`)
        .send({ revision: 2, text: '  More specific next time  ', disposition: 'change', author: OUTSIDER.globalUserId });
      expect(noted.status).toBe(201);
      expect(noted.body.data.note).toMatchObject({ author: ADMIN.globalUserId, revision: 2, version: 2, text: 'More specific next time', disposition: 'change' });
      const loaded = await request(app).get(`${base}/issues/${issue.id}`);
      expect(loaded.body.data.issue.revision).toBe(2);
      expect(loaded.body.data.issue.reviewState).toBe('unapproved');
      expect(loaded.body.data.issue.feedbackNotes).toHaveLength(1);
      const feedback = await request(app).get(`${base}/editorial-feedback`);
      expect(feedback.status).toBe(200);
      expect(feedback.body.data.items.map(item => item.kind)).toEqual(['note', 'edit']);
      expect(feedback.body.data.items[1].changes).toEqual([{
        field: 'caption', before: issue.socialCaption, after: 'Caption after review',
      }]);
      const incremental = await request(app).get(`${base}/editorial-feedback`).query({ sinceVersion: feedback.body.data.version });
      expect(incremental.status).toBe(200);
      expect(incremental.body.data.items).toEqual([]);
    });

    it('rejects invalid or stale feedback without creating notes', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      const base = `/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`;
      for (const body of [
        { revision: 1, text: '', disposition: 'change' },
        { revision: 1, text: 'Note', disposition: 'delete' },
      ]) {
        expect((await request(app).post(`${base}/feedback`).send(body)).status).toBe(422);
      }
      expect((await request(app).patch(base).send({ revision: 1, socialCaption: 'Edited' })).status).toBe(200);
      const stale = await request(app).post(`${base}/feedback`).send({ revision: 1, text: 'Old review', disposition: 'approve' });
      expect(stale.status).toBe(409);
      expect(stale.body).toMatchObject({ code: 'REVISION_CONFLICT', storedRevision: 2 });
      const { PivotCarouselDeck } = models();
      expect((await PivotCarouselDeck.findById(issue.id).lean()).feedbackNotes).toEqual([]);
    });

    it('reads only the requested account and refuses another account’s cursor', async () => {
      const first = await createAccount();
      const second = await createAccount({ displayName: 'Other SF' });
      const issue = await createGenerated(first.id);
      expect((await request(app).post(`/admin/pivot/carousel-accounts/${first.id}/issues/${issue.id}/feedback`)
        .send({ revision: 1, text: 'Private account feedback', disposition: 'reject' })).status).toBe(201);
      const feedback = await request(app).get(`/admin/pivot/carousel-accounts/${first.id}/editorial-feedback`);
      expect(feedback.body.data.items).toHaveLength(1);
      const isolated = await request(app).get(`/admin/pivot/carousel-accounts/${second.id}/editorial-feedback`);
      expect(isolated.body.data.items).toEqual([]);
      const foreign = await request(app).get(`/admin/pivot/carousel-accounts/${second.id}/editorial-feedback`)
        .query({ sinceVersion: feedback.body.data.version });
      expect(foreign.status).toBe(400);
      expect(foreign.body.code).toBe('INVALID_FEEDBACK_VERSION');
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

  describe('approve and mark posted', () => {
    it('approves an exact revision and records what was approved', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);

      const response = await request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/approve`)
        .send({ revision: 1 });
      expect(response.status).toBe(200);
      expect(response.body.data.issue.reviewState).toBe('approved');
      expect(response.body.data.issue.approval.revision).toBe(1);

      const { PivotCarouselDeck } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.reviewState).toBe('approved');
      expect(stored.approval.approvedBy).toBe(ADMIN.globalUserId);
      expect(stored.approval.approvedAt).toBeInstanceOf(Date);
      expect(stored.revision).toBe(1);
      expect(stored.posting).toBeNull();
    });

    it('requires an integer expected revision for both actions', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      for (const action of ['approve', 'mark-posted']) {
        for (const body of [{}, { revision: null }, { revision: '1' }, { revision: 1.5 }, { revision: 0 }, { revision: 2 }]) {
          const response = await request(app)
            .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/${action}`)
            .send(body);
          expect(response.status).toBe(409);
          expect(response.body).toMatchObject({ code: 'REVISION_CONFLICT', storedRevision: 1 });
        }
      }
      const { PivotCarouselDeck, PivotCarouselRevision } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.approval).toBeNull();
      expect(stored.posting).toBeNull();
      expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id, kind: 'posted' })).toBe(0);
    });

    it('rejects stale approval and mark-posted even when that revision was already posted', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      const base = `/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`;
      expect((await request(app).post(`${base}/approve`).send({ revision: 1 })).status).toBe(200);
      expect((await request(app).post(`${base}/mark-posted`).send({ revision: 1 })).status).toBe(200);
      expect((await request(app).patch(base).send({ revision: 1, socialCaption: 'changed' })).status).toBe(200);
      for (const action of ['approve', 'mark-posted']) {
        const response = await request(app).post(`${base}/${action}`).send({ revision: 1 });
        expect(response.status).toBe(409);
        expect(response.body).toMatchObject({ code: 'REVISION_CONFLICT', storedRevision: 2 });
      }
      const { PivotCarouselDeck, PivotCarouselRevision } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.reviewState).toBe('unapproved');
      expect(stored.approval).toBeNull();
      expect(stored.postHistory).toHaveLength(1);
      expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id, kind: 'posted' })).toBe(1);
    });

    it('refuses an unapproved generated issue even if the request asks to approve while posting', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      const response = await request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/mark-posted`)
        .send({ revision: 1, approve: true });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('APPROVAL_REQUIRED');
      const { PivotCarouselDeck, PivotCarouselRevision } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.approval).toBeNull();
      expect(stored.posting).toBeNull();
      expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id, kind: 'posted' })).toBe(0);
    });

    it('refuses to post when the approval names another revision', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      const { PivotCarouselDeck, PivotCarouselRevision } = models();
      // Represent a stale approval from an older write; the action must check
      // its exact revision even if the review-state label still says approved.
      await PivotCarouselDeck.updateOne({ _id: issue.id }, { $set: {
        revision: 2, reviewState: 'approved', approval: { revision: 1, approvedAt: new Date(), approvedBy: ADMIN.globalUserId },
      } });
      const post = await request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/mark-posted`)
        .send({ revision: 2 });
      expect(post.status).toBe(409);
      expect(post.body.code).toBe('APPROVAL_REQUIRED');
      expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id, kind: 'posted' })).toBe(0);
    });

    it('prevents legacy routes from saving generated content outside its revision check', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      const base = `/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`;
      expect((await request(app).post(`${base}/approve`).send({ revision: 1 })).status).toBe(200);
      const legacy = `/admin/pivot/tenants/sf/carousels/${issue.id}`;
      const save = await request(app).patch(legacy).send({ title: 'bypassed', voice: { entries: { title: 'bypassed' } } });
      expect(save.status).toBe(409);
      expect(save.body.code).toBe('GENERATED_ISSUE_REQUIRES_REVISION');
      const image = await request(app).post(`${legacy}/slides/slide-a/image`).send({ slotIndex: 0 });
      expect(image.status).toBe(409);
      expect(image.body.code).toBe('GENERATED_ISSUE_REQUIRES_REVISION');
      const { PivotCarouselDeck } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.title).toBe(issue.title);
      expect(stored.revision).toBe(1);
      expect(stored.approval.revision).toBe(1);
      expect(stored.reviewState).toBe('approved');
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

    it.each([
      ['slides', { document: makeDocument('rewritten slides') }],
      ['caption', { socialCaption: 'rewritten after approval' }],
    ])('returns a generated issue to unapproved after a %s save', async (_field, content) => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      await request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/approve`)
        .send({ revision: 1 });

      const edited = await request(app)
        .patch(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`)
        .send({ revision: 1, ...content });
      expect(edited.status).toBe(200);
      expect(edited.body.data.issue.reviewState).toBe('unapproved');
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
      expect(snapshot.document).toEqual(issue.document);
      expect(stored.reviewState).toBe('posted');
      expect(stored.revision).toBe(1);
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
      expect(response.body.data.issue.posting.instagramUrl).toBeNull();
      expect(response.body.data.issue.posting.postedBy).toBe(ADMIN.globalUserId);
    });

    it.each([
      { name: 'empty', slides: [] },
      { name: 'legacy', slides: [{ type: 'cover', values: { title: 'legacy cover' } }] },
    ])('captures $name manual slides and caption without requiring approval', async ({ slides }) => {
      const account = await createAccount();
      const issue = await createManualIssue(account.id, { document: null, slides, socialCaption: 'legacy caption' });
      const posted = await request(app)
        .post(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}/mark-posted`)
        .send({ revision: 1 });
      expect(posted.status).toBe(200);
      expect(posted.body.data.issue.reviewState).toBeNull();
      const { PivotCarouselDeck, PivotCarouselRevision } = models();
      const source = await PivotCarouselDeck.findById(issue.id).lean();
      const snapshot = await PivotCarouselRevision.findById(source.posting.snapshotRevisionId).lean();
      expect(snapshot.document).toBeNull();
      expect(snapshot.slides).toEqual(JSON.parse(JSON.stringify(source.slides)));
      expect(snapshot.socialCaption).toBe('legacy caption');
    });

    it.each(['manual', 'agent-generated'])('keeps the posted slides and caption after a later %s issue save', async origin => {
      const account = await createAccount();
      const issue = origin === 'manual'
        ? await createManualIssue(account.id, { socialCaption: 'as published' })
        : await createGenerated(account.id, { socialCaption: 'as published' });
      const base = `/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`;
      if (origin === 'agent-generated') {
        expect((await request(app).post(`${base}/approve`).send({ revision: 1 })).status).toBe(200);
      }
      const before = new Date();
      const posted = await request(app).post(`${base}/mark-posted`).send({ revision: 1 });
      expect(posted.status).toBe(200);
      const posting = posted.body.data.issue.posting;
      expect(new Date(posting.postedAt).getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(new Date(posting.postedAt).getTime()).toBeLessThanOrEqual(Date.now());
      const { PivotCarouselDeck, PivotCarouselRevision } = models();
      const published = await PivotCarouselRevision.findById(posting.snapshotRevisionId).lean();
      const saved = await request(app).patch(base).send({
        revision: 1, document: makeDocument('later slide copy'), socialCaption: 'later caption',
      });
      expect(saved.status).toBe(200);
      expect(saved.body.data.issue.reviewState).toBe(origin === 'manual' ? null : 'unapproved');
      expect(saved.body.data.issue.approval).toBeNull();
      expect(await PivotCarouselRevision.findById(posting.snapshotRevisionId).lean()).toEqual(published);
      expect(published.document).toEqual(issue.document);
      expect(published.socialCaption).toBe('as published');
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(String(stored.posting.snapshotRevisionId)).toBe(posting.snapshotRevisionId);
      expect(stored.postHistory).toHaveLength(1);
      // An attempted update to a history row cannot replace captured content.
      await PivotCarouselRevision.updateOne({ _id: published._id }, { $set: {
        document: makeDocument('tampered slides'), socialCaption: 'tampered caption', headRevision: 2,
      } });
      const still = await PivotCarouselRevision.findById(published._id).lean();
      expect(still.document).toEqual(published.document);
      expect(still.socialCaption).toBe(published.socialCaption);
      expect(still.headRevision).toBe(published.headRevision);
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
  });

  describe('concurrency over the wire', () => {
    it('clears an approval that lands after the edit has read the issue', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      const base = `/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`;
      interleaveNextWrite(async () => {
        const approved = await request(app).post(`${base}/approve`).send({ revision: 1 });
        expect(approved.status).toBe(200);
      });
      const edit = await request(app).patch(base).send({ revision: 1, document: makeDocument('raced') });
      expect(edit.status).toBe(200);
      const { PivotCarouselDeck } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.revision).toBe(2);
      expect(stored.reviewState).toBe('unapproved');
      expect(stored.approval).toBeNull();
    });

    it('rejects an approval when a caption save lands after its read', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      const base = `/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`;
      interleaveNextWrite(async () => {
        const edit = await request(app).patch(base).send({ revision: 1, socialCaption: 'raced caption' });
        expect(edit.status).toBe(200);
      });
      const approved = await request(app).post(`${base}/approve`).send({ revision: 1 });
      expect(approved.status).toBe(409);
      expect(approved.body).toMatchObject({ code: 'REVISION_CONFLICT', storedRevision: 2 });
      const { PivotCarouselDeck } = models();
      const stored = await PivotCarouselDeck.findById(issue.id).lean();
      expect(stored.approval).toBeNull();
      expect(stored.socialCaption).toBe('raced caption');
    });

    it('preserves the winning approver when two approvals race', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      const base = `/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`;
      let winner;
      interleaveNextWrite(async () => {
        currentUser = OUTSIDER;
        winner = await request(app).post(`${base}/approve`).send({ revision: 1 });
        expect(winner.status).toBe(200);
      });
      const retried = await request(app).post(`${base}/approve`).send({ revision: 1 });
      expect(retried.status).toBe(200);
      expect(retried.body.data.alreadyApproved).toBe(true);
      expect(retried.body.data.issue.approval).toEqual(winner.body.data.issue.approval);
      const { PivotCarouselDeck } = models();
      expect((await PivotCarouselDeck.findById(issue.id).lean()).approval.approvedBy).toBe(OUTSIDER.globalUserId);
    });

    it.each(['manual', 'agent-generated'])('rejects a %s post when an edit wins and removes its unused snapshot', async origin => {
      const account = await createAccount();
      const issue = origin === 'manual' ? await createManualIssue(account.id) : await createGenerated(account.id);
      const base = `/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`;
      if (origin === 'agent-generated') {
        expect((await request(app).post(`${base}/approve`).send({ revision: 1 })).status).toBe(200);
      }
      interleaveNextWrite(async () => {
        const edit = await request(app).patch(base).send({ revision: 1, document: makeDocument('raced') });
        expect(edit.status).toBe(200);
      });
      const post = await request(app).post(`${base}/mark-posted`).send({ revision: 1 });
      expect(post.status).toBe(409);
      expect(post.body).toMatchObject({ code: 'REVISION_CONFLICT', storedRevision: 2 });
      const { PivotCarouselDeck, PivotCarouselRevision } = models();
      expect((await PivotCarouselDeck.findById(issue.id).lean()).posting).toBeNull();
      expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id, kind: 'posted' })).toBe(0);
    });

    it('checks approval again when the post is written', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      const base = `/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`;
      expect((await request(app).post(`${base}/approve`).send({ revision: 1 })).status).toBe(200);
      const { PivotCarouselDeck, PivotCarouselRevision } = models();
      interleaveNextWrite(async () => {
        await PivotCarouselDeck.updateOne({ _id: issue.id }, { $set: { approval: null, reviewState: 'unapproved' } });
      });
      const post = await request(app).post(`${base}/mark-posted`).send({ revision: 1 });
      expect(post.status).toBe(409);
      expect((await PivotCarouselDeck.findById(issue.id).lean()).posting).toBeNull();
      expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id, kind: 'posted' })).toBe(0);
    });

    it('stores one snapshot when two mark-posted requests race', async () => {
      const account = await createAccount();
      const issue = await createGenerated(account.id);
      const base = `/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`;
      expect((await request(app).post(`${base}/approve`).send({ revision: 1 })).status).toBe(200);
      let winner;
      interleaveNextWrite(async () => {
        winner = await request(app).post(`${base}/mark-posted`).send({ revision: 1 });
        expect(winner.status).toBe(200);
      });
      const retry = await request(app).post(`${base}/mark-posted`).send({ revision: 1 });
      expect(retry.status).toBe(200);
      expect(retry.body.data.alreadyPosted).toBe(true);
      expect(retry.body.data.issue.posting).toEqual(winner.body.data.issue.posting);
      const { PivotCarouselDeck, PivotCarouselRevision } = models();
      expect((await PivotCarouselDeck.findById(issue.id).lean()).postHistory).toHaveLength(1);
      expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id, kind: 'posted' })).toBe(1);
    });

    it('fails a losing post after another post and edit have advanced the revision', async () => {
      const account = await createAccount();
      const issue = await createManualIssue(account.id);
      const base = `/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`;
      interleaveNextWrite(async () => {
        expect((await request(app).post(`${base}/mark-posted`).send({ revision: 1 })).status).toBe(200);
        expect((await request(app).patch(base).send({ revision: 1, socialCaption: 'later' })).status).toBe(200);
      });
      const post = await request(app).post(`${base}/mark-posted`).send({ revision: 1 });
      expect(post.status).toBe(409);
      expect(post.body).toMatchObject({ code: 'REVISION_CONFLICT', storedRevision: 2 });
      const { PivotCarouselDeck, PivotCarouselRevision } = models();
      expect((await PivotCarouselDeck.findById(issue.id).lean()).postHistory).toHaveLength(1);
      expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id, kind: 'posted' })).toBe(1);
    });

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
        expect(stored.reviewState).toBe('unapproved');
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

  describe('history over the wire', () => {
    it('keeps a history row for every accepted save', async () => {
      const account = await createAccount();
      const issue = await createManualIssue(account.id);

      for (let revision = 1; revision <= 3; revision += 1) {
        const response = await request(app)
          .patch(`/admin/pivot/carousel-accounts/${account.id}/issues/${issue.id}`)
          .send({ revision, document: makeDocument(`pass-${revision}`) });
        expect(response.status).toBe(200);
      }

      const { PivotCarouselRevision } = models();
      const rows = await PivotCarouselRevision.find({ issueId: issue.id, kind: 'save' }).lean();
      expect(rows.map((row) => row.headRevision).sort()).toEqual([2, 3, 4]);
    });

    it('prunes past twenty-five autosaves while posted snapshots survive', async () => {
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
      expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id, kind: 'posted' })).toBe(1);
      const posted = await PivotCarouselRevision.findOne({ issueId: issue.id, kind: 'posted' }).lean();
      expect(JSON.stringify(posted.document)).toContain('lanterns');
    });
  });
});
