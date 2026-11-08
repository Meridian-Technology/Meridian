/**
 * The www path lock exists twice: once in Express, which redirects a document
 * request before React loads, and once in the client, which redirects after it
 * does. A path allowed by one and not the other fails in a way that looks like
 * a routing bug rather than a policy one — and for the carousel export it fails
 * by screenshotting an institution picker.
 */

const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');

jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(async () => ({})),
  connectToGlobalDatabase: jest.fn(async () => ({})),
}));

// ESM-only; jest here loads CommonJS. Only the auth routes call it.
jest.mock('otplib', () => ({}));

// A private repo CI does not clone; the symlink dangles there.
jest.mock('../../events/index.js', () => require('express').Router(), { virtual: true });

jest.mock('../../services/tenantConfigService', () => ({
  ...jest.requireActual('../../services/tenantConfigService'),
  syncTenantUriCache: jest.fn(async () => {}),
  getMergedTenants: jest.fn(async () => [{ tenantKey: 'rpi' }]),
}));

const serverSource = fs.readFileSync(
  path.join(__dirname, '../../app.js'),
  'utf8',
);
const clientSource = fs.readFileSync(
  path.join(__dirname, '../../../frontend/src/config/tenantRedirect.js'),
  'utf8',
);

function listBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  const body = source
    .slice(start, end)
    // Comments first: an apostrophe in prose pairs with the next real quote and
    // shifts every entry after it by one.
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

const serverPaths = listBetween(serverSource, 'wwwAllowedPathPrefixes = [', '];');
const clientPaths = listBetween(clientSource, 'WWW_ALLOWED_PATHS = [', '];');

describe('the www path lock', () => {
  test('both halves were found', () => {
    expect(serverPaths.length).toBeGreaterThan(5);
    expect(clientPaths.length).toBeGreaterThan(5);
  });

  test('the carousel export route is allowed by the server', () => {
    expect(serverPaths).toContain('/carousel-export');
  });

  test('the carousel export route is allowed by the client', () => {
    expect(clientPaths).toContain('/carousel-export');
  });

  /*
   * Not a full equality check: the client allows landing paths Express never
   * sees, and Express allows API prefixes the client never routes. Only the
   * paths that render a page have to agree, and the export route is one.
   */
  test('every path the server allows that renders a page is allowed by the client', () => {
    const pageRendering = ['/platform-admin', '/justgo', '/login', '/carousel-export'];
    for (const route of pageRendering) {
      if (!serverPaths.includes(route)) continue;
      expect(clientPaths).toContain(route);
    }
  });

  /*
   * Grokbot calls the connector on www. The router's own token check answers
   * 401 NO_TOKEN; the www lock would answer 403 USE_TENANT_SUBDOMAIN first.
   */
  test('a www POST to the carousel connector reaches its router', async () => {
    const { createApp } = require('../../app');
    const { app } = createApp();

    const response = await request(app)
      .post('/mcp/carousel')
      .set('Host', 'www.meridian.study')
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

    expect(response.body.code).not.toBe('USE_TENANT_SUBDOMAIN');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('NO_TOKEN');
  });
});
