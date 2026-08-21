import justGoLandingCopy, { JUSTGO_PUBLIC_ORIGIN, justGoPublicUrl } from './justGoLandingCopy';
import { applyJustGoTabIcon } from './justGoLandingUtils';

export const JUSTGO_THEME_COLOR = '#1E1A16';
export const JUSTGO_OG_IMAGE_PATH = '/justgo/og.jpg';

/** Strip the campus `/justgo` alias so share URLs stay on justgo.lol. */
export function justGoDocumentCanonicalPath(pathname) {
  const path = String(pathname || '/').split('?')[0] || '/';
  if (path === '/justgo' || path === '/justgo/') return '/';
  if (path.startsWith('/justgo/')) return path.slice('/justgo'.length) || '/';
  return path;
}

function upsertMeta(root, attr, key, content) {
  if (!root?.head) return;
  const selector = `meta[${attr}="${key}"]`;
  const nodes = root.querySelectorAll(selector);
  if (nodes.length) {
    nodes.forEach((node) => node.setAttribute('content', content));
    return;
  }
  const meta = root.createElement('meta');
  meta.setAttribute(attr, key);
  meta.setAttribute('content', content);
  root.head.appendChild(meta);
}

/**
 * Tab title, description, and share tags for Just Go surfaces.
 * Crawlers still need the server HTML rewrite; this covers in-app navigation.
 */
export function applyJustGoDocumentMeta({
  title = justGoLandingCopy.documentTitle,
  description = justGoLandingCopy.metaDescription,
  canonical,
  root = typeof document !== 'undefined' ? document : null,
} = {}) {
  if (!root) return;
  const origin =
    (typeof window !== 'undefined' && window.location?.origin) || JUSTGO_PUBLIC_ORIGIN;
  const path = justGoDocumentCanonicalPath(
    typeof window !== 'undefined' && window.location?.pathname
      ? window.location.pathname
      : '/',
  );
  const url = canonical || justGoPublicUrl(path, { windowOrigin: origin });
  const image = justGoPublicUrl(JUSTGO_OG_IMAGE_PATH, { windowOrigin: origin });

  root.title = title;
  upsertMeta(root, 'name', 'description', description);
  upsertMeta(root, 'name', 'theme-color', JUSTGO_THEME_COLOR);
  upsertMeta(root, 'property', 'og:title', title);
  upsertMeta(root, 'property', 'og:description', description);
  upsertMeta(root, 'property', 'og:image', image);
  upsertMeta(root, 'property', 'og:url', url);
  upsertMeta(root, 'property', 'og:type', 'website');
  upsertMeta(root, 'property', 'og:site_name', justGoLandingCopy.productName);
  upsertMeta(root, 'name', 'twitter:card', 'summary_large_image');
  upsertMeta(root, 'name', 'twitter:title', title);
  upsertMeta(root, 'name', 'twitter:description', description);
  upsertMeta(root, 'name', 'twitter:image', image);
  applyJustGoTabIcon(root);
}
