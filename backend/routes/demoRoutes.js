const express = require('express');
const { isDemoTenant } = require('../constants/demoTenant');
const { requireDemoSession } = require('../middlewares/demoSession');
const { demoAdminGate } = require('../middlewares/demoBootstrapAccess');
const {
    loginDemoCredential,
    getDemoSessionUser,
    listDemoCredentials,
    createDemoCredential,
    updateDemoCredential,
    getDemoCredentialAnalytics,
    getDemoCredentialJourney,
    expireDemoCredentials,
    clearDemoAccessCookie,
    getDemoAccessTokenFromRequest,
} = require('../services/demoCredentialService');
const { getDemoWorkspace, getDemoTasks, getDemoAgenda } = require('../services/demoEventSnapshotService');
const jwt = require('jsonwebtoken');

const router = express.Router();

router.use((req, res, next) => {
    if (!isDemoTenant(req.school)) {
        return res.status(404).json({
            success: false,
            message: 'Demo features are only available on the demo tenant',
            code: 'DEMO_TENANT_ONLY',
        });
    }
    return next();
});

router.post('/events-demo/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        const data = await loginDemoCredential(req.db, req, res, { email, password });
        console.log(`POST /events-demo/auth/login credential=${data.credential.id}`);
        res.json({ success: true, data });
    } catch (err) {
        const status = err.code === 'RATE_LIMITED' ? 429
            : err.code === 'DEMO_NOT_SEEDED' ? 503
            : err.code === 'INVALID_CREDENTIALS' ? 401
            : 500;
        if (status >= 500) console.error('POST /events-demo/auth/login failed:', err);
        res.status(status).json({
            success: false,
            message: err.message,
            code: err.code || 'LOGIN_FAILED',
        });
    }
});

router.post('/events-demo/auth/logout', (req, res) => {
    clearDemoAccessCookie(req, res);
    res.json({ success: true, message: 'Logged out' });
});

router.get('/events-demo/auth/me', async (req, res) => {
    const token = getDemoAccessTokenFromRequest(req);
    if (!token) {
        return res.status(401).json({ success: false, message: 'Not authenticated', code: 'DEMO_AUTH_REQUIRED' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded.isDemoSession) {
            return res.status(403).json({ success: false, message: 'Not a demo session', code: 'DEMO_AUTH_REQUIRED' });
        }
        const data = await getDemoSessionUser(req.db, decoded);
        if (!data) {
            clearDemoAccessCookie(req, res);
            return res.status(401).json({ success: false, message: 'Demo session invalid', code: 'DEMO_SESSION_INVALID' });
        }
        return res.json({ success: true, data });
    } catch (err) {
        clearDemoAccessCookie(req, res);
        const code = err.name === 'TokenExpiredError' ? 'DEMO_SESSION_EXPIRED' : 'DEMO_SESSION_INVALID';
        return res.status(401).json({ success: false, message: 'Demo session invalid', code });
    }
});

router.get('/events-demo/workspace', requireDemoSession, async (req, res) => {
    try {
        const phase = req.query.phase;
        const workspace = await getDemoWorkspace(req.db, { phase });
        res.json({
            success: true,
            data: workspace.data,
            meta: {
                phase: workspace.phase,
                orgId: workspace.orgId,
                eventId: workspace.eventId,
            },
        });
    } catch (err) {
        const status = err.code === 'DEMO_NOT_SEEDED' ? 503 : 500;
        if (status >= 500) console.error('GET /events-demo/workspace failed:', err);
        res.status(status).json({ success: false, message: err.message, code: err.code || 'WORKSPACE_FAILED' });
    }
});

router.get('/events-demo/tasks', requireDemoSession, async (req, res) => {
    try {
        const { phase, status, priority, search } = req.query;
        const payload = await getDemoTasks(req.db, { phase, status, priority, search });
        res.json({
            success: true,
            data: {
                event: payload.event,
                tasks: payload.tasks,
                summary: payload.summary,
            },
            meta: { phase: payload.phase },
        });
    } catch (err) {
        const status = err.code === 'DEMO_NOT_SEEDED' ? 503 : 500;
        if (status >= 500) console.error('GET /events-demo/tasks failed:', err);
        res.status(status).json({ success: false, message: err.message, code: err.code || 'TASKS_FAILED' });
    }
});

router.get('/events-demo/agenda', requireDemoSession, async (req, res) => {
    try {
        const phase = req.query.phase;
        const payload = await getDemoAgenda(req.db, { phase });
        res.json({
            success: true,
            data: { agenda: payload.agenda },
            meta: { phase: payload.phase },
        });
    } catch (err) {
        const status = err.code === 'DEMO_NOT_SEEDED' ? 503 : 500;
        if (status >= 500) console.error('GET /events-demo/agenda failed:', err);
        res.status(status).json({ success: false, message: err.message, code: err.code || 'AGENDA_FAILED' });
    }
});

router.get('/admin/demo-credentials', demoAdminGate, async (req, res) => {
    try {
        const data = await listDemoCredentials(req.db);
        res.json({ success: true, data });
    } catch (err) {
        console.error('GET /admin/demo-credentials failed:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/admin/demo-credentials/analytics', demoAdminGate, async (req, res) => {
    try {
        const data = await getDemoCredentialAnalytics(req.db);
        res.json({ success: true, data });
    } catch (err) {
        console.error('GET /admin/demo-credentials/analytics failed:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/admin/demo-credentials/:id/journey', demoAdminGate, async (req, res) => {
    try {
        const data = await getDemoCredentialJourney(req.db, req.params.id, {
            limit: req.query.limit,
        });
        res.json({ success: true, data });
    } catch (err) {
        const status = err.code === 'NOT_FOUND' ? 404 : 500;
        if (status >= 500) console.error('GET /admin/demo-credentials/:id/journey failed:', err);
        res.status(status).json({ success: false, message: err.message, code: err.code });
    }
});

router.post('/admin/demo-credentials', demoAdminGate, async (req, res) => {
    try {
        const { label, expiresAt, metadata } = req.body || {};
        const data = await createDemoCredential(req.db, {
            label,
            expiresAt,
            metadata,
            createdBy: req.user.userId || null,
        });
        console.log(`POST /admin/demo-credentials created=${data.id} by=${req.user.userId || 'unknown'}`);
        res.status(201).json({ success: true, data });
    } catch (err) {
        console.error('POST /admin/demo-credentials failed:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.patch('/admin/demo-credentials/:id', demoAdminGate, async (req, res) => {
    try {
        const { label, revoke, expiresAt } = req.body || {};
        const data = await updateDemoCredential(req.db, req.params.id, { label, revoke, expiresAt });
        res.json({ success: true, data });
    } catch (err) {
        const status = err.code === 'NOT_FOUND' ? 404 : 500;
        if (status >= 500) console.error('PATCH /admin/demo-credentials failed:', err);
        res.status(status).json({ success: false, message: err.message, code: err.code });
    }
});

router.post('/admin/demo-credentials/expire-stale', demoAdminGate, async (req, res) => {
    try {
        const data = await expireDemoCredentials(req.db);
        if (data.expiredCount > 0) {
            console.log(`POST /admin/demo-credentials/expire-stale expired=${data.expiredCount}`);
        }
        res.json({ success: true, data });
    } catch (err) {
        console.error('POST /admin/demo-credentials/expire-stale failed:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
