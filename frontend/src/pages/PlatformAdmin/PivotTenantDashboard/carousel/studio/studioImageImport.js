const UNSPLASH_PHOTO_ID = /^[\w-]{1,100}$/;

/** Unsplash page URLs use `/photos/{id}` or `/photos/{slug}-{id}`. */
export function unsplashPhotoIdFromUrl(input) {
  let url;
  try {
    url = new URL(String(input || '').trim());
  } catch {
    return null;
  }
  if (!/^(?:www\.)?unsplash\.com$/i.test(url.hostname)) return null;
  const segment = url.pathname.match(/\/photos\/([^/?#]+)/)?.[1];
  if (!segment) return null;
  const slugId = segment.match(/-([A-Za-z0-9_-]{11})$/)?.[1];
  if (slugId && UNSPLASH_PHOTO_ID.test(slugId)) return slugId;
  return UNSPLASH_PHOTO_ID.test(segment) ? segment : null;
}

export function isDirectImageUrl(input) {
  let url;
  try {
    url = new URL(String(input || '').trim());
  } catch {
    return false;
  }
  if (!/^https?:$/i.test(url.protocol)) return false;
  if (/unsplash\.com$/i.test(url.hostname) && url.pathname.startsWith('/photos/')) return false;
  return true;
}

/**
 * @returns {{ kind: 'unsplash', photoId: string } | { kind: 'url', src: string } | { error: string }}
 */
export function parseImageImportLink(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return { error: 'Paste an image link or Unsplash URL.' };
  const photoId = unsplashPhotoIdFromUrl(trimmed);
  if (photoId) return { kind: 'unsplash', photoId };
  if (!isDirectImageUrl(trimmed)) return { error: 'Use a direct image link (https://…) or an Unsplash photo page.' };
  return { kind: 'url', src: new URL(trimmed).href };
}
