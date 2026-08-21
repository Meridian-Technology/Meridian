const { isJustGoPublicHost } = require('./corsOrigins');
const { justGoPublicUrl } = require('./justGoPublicUrl');

const JUSTGO_TITLE = 'just go. this week in your city';
const JUSTGO_DESCRIPTION =
  "stop planning. swipe what's on in your city this week. just go.";
const JUSTGO_THEME_COLOR = '#1E1A16';
const JUSTGO_SITE_NAME = 'just go';
const JUSTGO_OG_IMAGE_PATH = '/justgo/og.jpg';
const JUSTGO_ICON_PATH = '/justgo-icon.svg';

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function requestPath(req) {
  const raw = String(req?.originalUrl || req?.path || '/').split('?')[0];
  return raw && raw.trim() ? raw : '/';
}

function wantsJustGoHtmlMeta(req) {
  const host = req?.headers?.host || (typeof req?.get === 'function' ? req.get('host') : '');
  if (isJustGoPublicHost(host)) return true;
  const path = requestPath(req);
  return path === '/justgo' || path.startsWith('/justgo/');
}

function justGoCanonicalPath(req) {
  const path = requestPath(req);
  if (path === '/justgo' || path === '/justgo/') return '/';
  if (path.startsWith('/justgo/')) {
    const stripped = path.slice('/justgo'.length) || '/';
    return stripped;
  }
  return path;
}

function setMetaContent(html, attr, key, value) {
  const escaped = escapeAttr(value);
  const re = new RegExp(
    `(<meta\\s[^>]*${attr}\\s*=\\s*"${key}"[^>]*\\scontent\\s*=\\s*")[^"]*(")`,
    'gi',
  );
  const next = html.replace(re, `$1${escaped}$2`);
  if (next !== html) return next;
  return html.replace(
    /<\/head>/i,
    `    <meta ${attr}="${key}" content="${escaped}">\n  </head>`,
  );
}

function setLinkHref(html, rel, href) {
  const escaped = escapeAttr(href);
  const re = new RegExp(
    `(<link\\s[^>]*rel\\s*=\\s*"${rel}"[^>]*\\shref\\s*=\\s*")[^"]*(")`,
    'i',
  );
  const next = html.replace(re, `$1${escaped}$2`);
  if (next !== html) return next;
  return html.replace(
    /<\/head>/i,
    `    <link rel="${rel}" href="${escaped}">\n  </head>`,
  );
}

function applyJustGoIndexHtml(html, req) {
  const urlOpts = { nodeEnv: 'production' };
  const canonical = justGoPublicUrl(justGoCanonicalPath(req), req, urlOpts);
  const image = justGoPublicUrl(JUSTGO_OG_IMAGE_PATH, req, urlOpts);
  const icon = justGoPublicUrl(JUSTGO_ICON_PATH, req, urlOpts);
  let out = String(html || '');
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttr(JUSTGO_TITLE)}</title>`);
  out = setMetaContent(out, 'name', 'description', JUSTGO_DESCRIPTION);
  out = setMetaContent(out, 'name', 'theme-color', JUSTGO_THEME_COLOR);
  out = setMetaContent(out, 'property', 'og:title', JUSTGO_TITLE);
  out = setMetaContent(out, 'property', 'og:description', JUSTGO_DESCRIPTION);
  out = setMetaContent(out, 'property', 'og:image', image);
  out = setMetaContent(out, 'property', 'og:url', canonical);
  out = setMetaContent(out, 'property', 'og:type', 'website');
  out = setMetaContent(out, 'property', 'og:site_name', JUSTGO_SITE_NAME);
  out = setMetaContent(out, 'name', 'twitter:card', 'summary_large_image');
  out = setMetaContent(out, 'name', 'twitter:title', JUSTGO_TITLE);
  out = setMetaContent(out, 'name', 'twitter:description', JUSTGO_DESCRIPTION);
  out = setMetaContent(out, 'name', 'twitter:image', image);
  out = setLinkHref(out, 'icon', icon);
  out = setLinkHref(out, 'apple-touch-icon', icon);
  return out;
}

module.exports = {
  JUSTGO_TITLE,
  JUSTGO_DESCRIPTION,
  JUSTGO_OG_IMAGE_PATH,
  wantsJustGoHtmlMeta,
  justGoCanonicalPath,
  applyJustGoIndexHtml,
};
