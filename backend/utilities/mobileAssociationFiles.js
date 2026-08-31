const APPLE_TEAM_ID = 'S22WF3L7P9';
const MERIDIAN_APP_ID = 'com.meridian.mobile';
const JUSTGO_APP_ID = 'app.justgo';

const ASSOCIATED_PATHS = Object.freeze([
  '/invite',
  '/invite/*',
  '/pivot/*',
  '/events/*',
]);

const SHA256_FINGERPRINT = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

function appleAppSiteAssociation() {
  return {
    applinks: {
      apps: [],
      details: [MERIDIAN_APP_ID, JUSTGO_APP_ID].map((bundleId) => ({
        appID: `${APPLE_TEAM_ID}.${bundleId}`,
        paths: [...ASSOCIATED_PATHS],
      })),
    },
  };
}

function parseFingerprints(value, variableName) {
  const fingerprints = String(value || '')
    .split(',')
    .map((fingerprint) => fingerprint.trim().toUpperCase())
    .filter(Boolean);

  if (!fingerprints.length || fingerprints.some((fingerprint) => !SHA256_FINGERPRINT.test(fingerprint))) {
    throw new Error(`${variableName} must contain comma-separated release SHA-256 certificate fingerprints`);
  }

  return [...new Set(fingerprints)];
}

function androidAssetLinks(env = process.env) {
  const targets = [
    [MERIDIAN_APP_ID, 'ANDROID_MERIDIAN_SHA256_CERT_FINGERPRINTS'],
    [JUSTGO_APP_ID, 'ANDROID_JUSTGO_SHA256_CERT_FINGERPRINTS'],
  ];

  return targets.map(([packageName, variableName]) => ({
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: packageName,
      sha256_cert_fingerprints: parseFingerprints(env[variableName], variableName),
    },
    relation_extensions: {
      'delegate_permission/common.handle_all_urls': {
        dynamic_app_link_components: ASSOCIATED_PATHS.map((path) => ({ '/': path })),
      },
    },
  }));
}

function sendAssociationJson(res, body) {
  return res
    .status(200)
    .set('Content-Type', 'application/json')
    .set('Cache-Control', 'public, max-age=300, s-maxage=3600')
    .send(JSON.stringify(body));
}

function registerMobileAssociationRoutes(app, env = process.env) {
  app.get('/.well-known/apple-app-site-association', (_req, res) => (
    sendAssociationJson(res, appleAppSiteAssociation())
  ));

  app.get('/.well-known/assetlinks.json', (_req, res) => {
    try {
      return sendAssociationJson(res, androidAssetLinks(env));
    } catch (error) {
      console.error('[mobile-associations] Android release fingerprints are not configured');
      return res
        .status(503)
        .set('Cache-Control', 'no-store')
        .json({ error: 'association_unavailable' });
    }
  });
}

module.exports = {
  APPLE_TEAM_ID,
  MERIDIAN_APP_ID,
  JUSTGO_APP_ID,
  ASSOCIATED_PATHS,
  appleAppSiteAssociation,
  androidAssetLinks,
  registerMobileAssociationRoutes,
};
