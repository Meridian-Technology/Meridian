/**
 * Org budget routes — create, submit, org-stage approve, CSV export (multi-tenant req.db).
 */
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

const { createMongoMemoryConnection, getOrCreateModel } = require('../helpers/mongoMemory');
const financeConfigSchema = require('../../schemas/financeConfig');
const orgBudgetSchema = require('../../schemas/orgBudget');
const orgSchema = require('../../schemas/org');
const userSchema = require('../../schemas/user');

let testUserId;
let mongo;

jest.mock('../../middlewares/verifyToken', () => ({
    verifyToken: (req, res, next) => {
        req.user = { userId: testUserId };
        next();
    }
}));

jest.mock('../../middlewares/orgPermissions', () => ({
    requireOrgPermission: () => (req, res, next) => next()
}));

jest.mock('../../services/getModelService', () => (req, ...names) => {
    const models = {
        FinanceConfig: getOrCreateModel(req.db, 'FinanceConfig', financeConfigSchema, 'financeConfigs'),
        OrgBudget: getOrCreateModel(req.db, 'OrgBudget', orgBudgetSchema, 'orgBudgets'),
        Org: getOrCreateModel(req.db, 'Org', orgSchema, 'orgs'),
        User: getOrCreateModel(req.db, 'User', userSchema, 'users')
    };
    return names.reduce((acc, n) => {
        if (models[n]) acc[n] = models[n];
        return acc;
    }, {});
});

const orgBudgetRoutes = require('../../routes/orgBudgetRoutes');
const budgetService = require('../../services/budgetService');

describe('org budget route outcomes', () => {
    let app;
    let orgId;

    beforeAll(async () => {
        mongo = await createMongoMemoryConnection();
        app = express();
        app.use(express.json());
        app.use((req, _res, next) => {
            req.db = mongo.connection;
            req.school = 'rpi';
            next();
        });
        app.use('/org-budgets', orgBudgetRoutes);
    });

    afterAll(async () => {
        await mongo.cleanup();
    });

    beforeEach(async () => {
        await mongo.reset();
        const UserModel = getOrCreateModel(mongo.connection, 'User', userSchema, 'users');
        const OrgModel = getOrCreateModel(mongo.connection, 'Org', orgSchema, 'orgs');
        const u = await UserModel.create({
            email: `u-${new mongoose.Types.ObjectId().toString()}@test.local`,
            name: 'Tester'
        });
        testUserId = u._id;
        const o = await OrgModel.create({
            org_name: 'Test Org',
            org_profile_image: 'https://example.com/p.png',
            org_description: 'd',
            owner: u._id,
            orgTypeKey: 'club'
        });
        orgId = o._id.toString();
        await budgetService.ensureFinanceConfig({ db: mongo.connection, school: 'rpi' });
    });

    test('POST create, PATCH, submit, approve officer stage, export CSV', async () => {
        const createRes = await request(app)
            .post(`/org-budgets/${orgId}/budgets`)
            .send({ fiscalYear: '2026', templateKey: 'annual_club', title: 'FY26' });
        expect(createRes.status).toBe(201);
        const budgetId = createRes.body.data._id;

        const lineItems = createRes.body.data.lineItems.map((li) => {
            if (li.key === 'operating') return { ...li, amount: 500 };
            return li;
        });
        const patchRes = await request(app).patch(`/org-budgets/${orgId}/budgets/${budgetId}`).send({ lineItems });
        expect(patchRes.status).toBe(200);

        const subRes = await request(app).post(`/org-budgets/${orgId}/budgets/${budgetId}/submit`).send();
        expect(subRes.status).toBe(200);
        expect(subRes.body.data.status).toBe('in_review');

        const apprRes = await request(app)
            .put(`/org-budgets/${orgId}/budgets/${budgetId}/stages/officer/approve`)
            .send();
        expect(apprRes.status).toBe(200);
        expect(apprRes.body.data.status).toBe('in_review');
        expect(apprRes.body.data.workflow.currentStageIndex).toBe(1);

        const csvRes = await request(app).get(`/org-budgets/${orgId}/budgets/${budgetId}/export?format=csv`);
        expect(csvRes.status).toBe(200);
        expect(csvRes.headers['content-type']).toMatch(/csv/);
        expect(csvRes.text).toContain('operating');
    });

    test('POST create returns 409 when non-rejected budget exists for same FY + template', async () => {
        const first = await request(app)
            .post(`/org-budgets/${orgId}/budgets`)
            .send({ fiscalYear: '2027', templateKey: 'annual_club' });
        expect(first.status).toBe(201);
        const second = await request(app)
            .post(`/org-budgets/${orgId}/budgets`)
            .send({ fiscalYear: '2027', templateKey: 'annual_club' });
        expect(second.status).toBe(409);
    });

    test('PUT request-revision requires a message', async () => {
        const createRes = await request(app)
            .post(`/org-budgets/${orgId}/budgets`)
            .send({ fiscalYear: '2028', templateKey: 'annual_club' });
        const budgetId = createRes.body.data._id;
        const lineItems = createRes.body.data.lineItems.map((li) =>
            li.key === 'operating' ? { ...li, amount: 100 } : li
        );
        await request(app).patch(`/org-budgets/${orgId}/budgets/${budgetId}`).send({ lineItems });
        await request(app).post(`/org-budgets/${orgId}/budgets/${budgetId}/submit`).send();
        const bad = await request(app)
            .put(`/org-budgets/${orgId}/budgets/${budgetId}/stages/officer/request-revision`)
            .send({ message: '   ' });
        expect(bad.status).toBe(400);
        const good = await request(app)
            .put(`/org-budgets/${orgId}/budgets/${budgetId}/stages/officer/request-revision`)
            .send({ message: 'Add more detail to operating.' });
        expect(good.status).toBe(200);
        expect(good.body.data.status).toBe('revision_requested');
    });
});
