const COVER_PROBE_TIMEOUT_MS = 7_000;
const COVER_PROBE_CONCURRENCY = 6;
const COVER_PROBE_HEADERS = {
  Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
  'User-Agent': 'JustGoCuration/1.0',
};

function explainCoverImageSkip(image) {
  const raw = String(image || '').trim();
  if (!raw) {
    return {
      code: 'MISSING_IMAGE',
      title: 'No cover image',
      detail: 'Add a working cover image before this event can go live.',
    };
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        code: 'BROKEN_IMAGE',
        title: 'Cover URL is not a web image',
        detail: 'Use an http(s) image URL that loads in the app.',
      };
    }
  } catch {
    return {
      code: 'BROKEN_IMAGE',
      title: 'Cover URL is not a web image',
      detail: 'Use an http(s) image URL that loads in the app.',
    };
  }
  return null;
}

function brokenImageSkip(detail) {
  return {
    code: 'BROKEN_IMAGE',
    title: 'Cover image failed to load',
    detail: detail || 'Replace the image URL before this event can go live.',
  };
}

async function probeCoverImageUrl(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = COVER_PROBE_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    return { ok: false, reason: 'no_fetch' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const request = (method, extra = {}) => fetchImpl(url, {
    method,
    redirect: 'follow',
    signal: controller.signal,
    headers: { ...COVER_PROBE_HEADERS, ...extra },
  });

  try {
    let response = await request('HEAD');
    if (response.status === 405 || response.status === 501 || response.status === 403) {
      response = await request('GET', { Range: 'bytes=0-2047' });
    }
    if (!response.ok && response.status !== 404) {
      response = await request('GET', { Range: 'bytes=0-2047' });
    }
    if (!response.ok) {
      return { ok: false, reason: 'http' };
    }
    const type = String(response.headers?.get?.('content-type') || '').toLowerCase();
    if (type.startsWith('text/html') || type.startsWith('application/json')) {
      return { ok: false, reason: 'not_image' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'blocked' };
  } finally {
    clearTimeout(timer);
  }
}

async function partitionDocsByCoverProbe(docs, {
  fetchImpl = globalThis.fetch,
  concurrency = COVER_PROBE_CONCURRENCY,
  timeoutMs = COVER_PROBE_TIMEOUT_MS,
} = {}) {
  const eligible = [];
  const skipped = [];
  const cache = new Map();
  const inflight = new Map();
  let cursor = 0;
  const list = Array.isArray(docs) ? docs : [];

  const resolveUrl = (url) => {
    if (cache.has(url)) return Promise.resolve(cache.get(url));
    if (inflight.has(url)) return inflight.get(url);
    const pending = probeCoverImageUrl(url, { fetchImpl, timeoutMs }).then((result) => {
      cache.set(url, result);
      inflight.delete(url);
      return result;
    });
    inflight.set(url, pending);
    return pending;
  };

  const workerCount = Math.min(concurrency, list.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < list.length) {
      const doc = list[cursor];
      cursor += 1;
      const staticSkip = explainCoverImageSkip(doc?.image);
      if (staticSkip) {
        skipped.push({ doc, skip: staticSkip });
        continue;
      }
      const result = await resolveUrl(String(doc.image).trim());
      if (result.ok) {
        eligible.push(doc);
      } else {
        skipped.push({
          doc,
          skip: brokenImageSkip(
            result.reason === 'not_image'
              ? 'The cover URL did not return an image file.'
              : 'The cover URL did not load.',
          ),
        });
      }
    }
  });

  await Promise.all(workers);
  return { eligible, skipped };
}

module.exports = {
  explainCoverImageSkip,
  probeCoverImageUrl,
  partitionDocsByCoverProbe,
  COVER_PROBE_TIMEOUT_MS,
};
