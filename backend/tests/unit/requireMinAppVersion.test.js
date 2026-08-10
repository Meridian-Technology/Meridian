const express = require('express');
const request = require('supertest');
const { requireMinAppVersion, APP_VERSION_HEADER } = require('../../middlewares/requireMinAppVersion');

function buildApp(minVersion) {
  const app = express();
  app.get('/gated', requireMinAppVersion(minVersion), (_req, res) => {
    res.status(200).json({ success: true });
  });
  return app;
}

describe('requireMinAppVersion', () => {
  it('allows requests at or above the minimum version', async () => {
    const app = buildApp('2.0.0');

    const exact = await request(app).get('/gated').set(APP_VERSION_HEADER, '2.0.0');
    expect(exact.statusCode).toBe(200);

    const newer = await request(app).get('/gated').set(APP_VERSION_HEADER, '2.1.3');
    expect(newer.statusCode).toBe(200);
  });

  it('returns 426 APP_UPGRADE_REQUIRED when header is missing or too low', async () => {
    const app = buildApp('2.0.0');

    const missing = await request(app).get('/gated');
    expect(missing.statusCode).toBe(426);
    expect(missing.body).toEqual({
      success: false,
      code: 'APP_UPGRADE_REQUIRED',
      minAppVersion: '2.0.0',
      message: 'App upgrade required.',
    });

    const tooOld = await request(app).get('/gated').set(APP_VERSION_HEADER, '1.9.9');
    expect(tooOld.statusCode).toBe(426);
    expect(tooOld.body.code).toBe('APP_UPGRADE_REQUIRED');
    expect(tooOld.body.minAppVersion).toBe('2.0.0');
  });

  it('rejects invalid version strings', async () => {
    const app = buildApp('1.0.0');
    const response = await request(app).get('/gated').set(APP_VERSION_HEADER, 'not-a-version');
    expect(response.statusCode).toBe(426);
  });
});
