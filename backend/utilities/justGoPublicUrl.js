const JUSTGO_PUBLIC_ORIGIN = 'https://justgo.lol';

function stripTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

/**
 * Canonical public origin for share/QR payloads.
 * Production → https://justgo.lol. Override with JUSTGO_PUBLIC_ORIGIN.
 * Dev → request host when present, else http://localhost:3000.
 */
function justGoPublicOrigin(req, options = {}) {
  const override = options.origin ?? process.env.JUSTGO_PUBLIC_ORIGIN;
  if (typeof override === 'string' && override.trim()) {
    return stripTrailingSlash(override);
  }

  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  if (nodeEnv === 'production') {
    return JUSTGO_PUBLIC_ORIGIN;
  }

  const forwarded = req?.get?.('x-forwarded-host');
  const host = stripTrailingSlash(forwarded || req?.get?.('host') || '');
  if (host) {
    const proto =
      stripTrailingSlash(req?.get?.('x-forwarded-proto') || '') || 'http';
    return `${proto}://${host}`;
  }

  return 'http://localhost:3000';
}

function justGoPublicUrl(path = '/', req, options) {
  const origin = justGoPublicOrigin(req, options);
  let next = path == null || path === '' ? '/' : String(path).trim();
  if (!next.startsWith('/')) next = `/${next}`;
  if (next === '/') return origin;
  return `${origin}${next}`;
}

function justGoWaitlistShareUrl(tenantKey, shareCode, req, options) {
  const key = String(tenantKey || '').trim().toLowerCase();
  const code = String(shareCode || '').trim();
  const base = justGoPublicUrl(`/${encodeURIComponent(key)}`, req, options);
  const params = new URLSearchParams({ ref: code });
  return `${base}?${params.toString()}`;
}

module.exports = {
  JUSTGO_PUBLIC_ORIGIN,
  justGoPublicOrigin,
  justGoPublicUrl,
  justGoWaitlistShareUrl,
};
