export const IMAGE_CHECK_TIMEOUT_MS = 12_000;
export const CATALOG_IMAGE_CHECK_TIMEOUT_MS = 8_000;
export const CATALOG_IMAGE_CHECK_CONCURRENCY = 6;

export function normalizeImageUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function imagePreviewErrorMessage(reason) {
  if (reason === 'timeout') {
    return 'Image took too long to load — check the URL or try again.';
  }
  if (reason === 'invalid') {
    return 'Enter a valid http(s) image URL.';
  }
  return 'Could not load image — the URL may be broken, not an image, or blocked by the host.';
}

export function checkImageUrl(url, { timeoutMs = IMAGE_CHECK_TIMEOUT_MS, signal } = {}) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ ok: false, reason: 'aborted' });
      return;
    }

    const img = new Image();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      img.onload = null;
      img.onerror = null;
      resolve(result);
    };

    const onAbort = () => finish({ ok: false, reason: 'aborted' });
    signal?.addEventListener('abort', onAbort);

    const timeoutId = setTimeout(() => {
      finish({ ok: false, reason: 'timeout' });
    }, timeoutMs);

    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        finish({ ok: true });
        return;
      }
      finish({ ok: false, reason: 'empty' });
    };

    img.onerror = () => {
      finish({ ok: false, reason: 'blocked' });
    };

    img.referrerPolicy = 'no-referrer';
    img.src = url;
  });
}

export async function collectBrokenImageEventIds(
  events,
  {
    concurrency = CATALOG_IMAGE_CHECK_CONCURRENCY,
    timeoutMs = CATALOG_IMAGE_CHECK_TIMEOUT_MS,
    isAborted,
    signal,
    onBroken,
  } = {},
) {
  const broken = new Set();
  const cache = new Map();
  const inflight = new Map();
  const queue = [];

  for (const event of events || []) {
    if (event?._id == null) continue;
    const raw = String(event.image || '').trim();
    if (!raw) continue;
    const id = String(event._id);
    const normalized = normalizeImageUrl(raw);
    if (!normalized) {
      broken.add(id);
      onBroken?.(id);
      continue;
    }
    queue.push({ id, url: normalized });
  }

  let cursor = 0;
  const resolveUrl = (url) => {
    if (cache.has(url)) return Promise.resolve(cache.get(url));
    if (inflight.has(url)) return inflight.get(url);
    const pending = checkImageUrl(url, { timeoutMs, signal }).then((result) => {
      if (result.reason === 'aborted') return false;
      cache.set(url, result.ok);
      inflight.delete(url);
      return result.ok;
    });
    inflight.set(url, pending);
    return pending;
  };
  const workerCount = Math.min(concurrency, queue.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < queue.length) {
      if (isAborted?.()) return;
      const item = queue[cursor];
      cursor += 1;
      const ok = await resolveUrl(item.url);
      if (isAborted?.()) return;
      if (!ok) {
        broken.add(item.id);
        onBroken?.(item.id);
      }
    }
  });

  await Promise.all(workers);
  return broken;
}
