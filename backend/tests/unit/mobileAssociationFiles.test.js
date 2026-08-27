const {
  appleAppSiteAssociation,
  androidAssetLinks,
  registerMobileAssociationRoutes,
} = require('../../utilities/mobileAssociationFiles');

const MERIDIAN_FINGERPRINT = Array(32).fill('11').join(':');
const JUSTGO_FINGERPRINT = Array(32).fill('AB').join(':');

function response() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; },
  };
}

describe('mobile association files', () => {
  it('associates both iOS apps with event links while preserving existing routes', () => {
    const body = appleAppSiteAssociation();
    expect(body.applinks.details.map(({ appID }) => appID)).toEqual([
      'S22WF3L7P9.com.meridian.mobile',
      'S22WF3L7P9.app.justgo',
    ]);
    body.applinks.details.forEach(({ paths }) => {
      expect(paths).toEqual(expect.arrayContaining(['/invite', '/pivot/*', '/events/*']));
    });
  });

  it('builds Android declarations from exact release fingerprints and scopes dynamic links', () => {
    const body = androidAssetLinks({
      ANDROID_MERIDIAN_SHA256_CERT_FINGERPRINTS: MERIDIAN_FINGERPRINT,
      ANDROID_JUSTGO_SHA256_CERT_FINGERPRINTS: JUSTGO_FINGERPRINT.toLowerCase(),
    });
    expect(body.map(({ target }) => target.package_name)).toEqual([
      'com.meridian.mobile',
      'app.justgo',
    ]);
    expect(body[1].target.sha256_cert_fingerprints).toEqual([JUSTGO_FINGERPRINT]);
    expect(body[0].relation_extensions['delegate_permission/common.handle_all_urls']
      .dynamic_app_link_components).toContainEqual({ '/': '/events/*' });
  });

  it.each([
    [{}, 'missing'],
    [{
      ANDROID_MERIDIAN_SHA256_CERT_FINGERPRINTS: 'REPLACE_WITH_RELEASE_SHA256_FINGERPRINT',
      ANDROID_JUSTGO_SHA256_CERT_FINGERPRINTS: JUSTGO_FINGERPRINT,
    }, 'placeholder'],
  ])('rejects %s Android certificate configuration', (env) => {
    expect(() => androidAssetLinks(env)).toThrow(/release SHA-256/);
  });

  it('serves both declarations as JSON without a redirect', () => {
    const routes = {};
    const app = { get(path, handler) { routes[path] = handler; } };
    registerMobileAssociationRoutes(app, {
      ANDROID_MERIDIAN_SHA256_CERT_FINGERPRINTS: MERIDIAN_FINGERPRINT,
      ANDROID_JUSTGO_SHA256_CERT_FINGERPRINTS: JUSTGO_FINGERPRINT,
    });

    for (const path of [
      '/.well-known/apple-app-site-association',
      '/.well-known/assetlinks.json',
    ]) {
      const res = response();
      routes[path]({}, res);
      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toBe('application/json');
      expect(res.headers['Cache-Control']).toContain('s-maxage');
      expect(() => JSON.parse(res.body)).not.toThrow();
    }
  });

  it('fails closed rather than serving invalid Android placeholders', () => {
    const routes = {};
    const app = { get(path, handler) { routes[path] = handler; } };
    registerMobileAssociationRoutes(app, {});
    const res = response();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    routes['/.well-known/assetlinks.json']({}, res);
    expect(res.statusCode).toBe(503);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.body).toEqual({ error: 'association_unavailable' });
    error.mockRestore();
  });
});
