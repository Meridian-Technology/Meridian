const axios = require('axios');
const { loadAccount } = require('./pivotCarouselIssueService');
const referral = url => `${url}${url.includes('?') ? '&' : '?'}utm_source=just_go&utm_medium=referral`;
const serialize = photo => ({
  id: `unsplash:${photo.id}`, provider: 'unsplash', photoId: photo.id,
  src: photo.urls.regular, thumbnail: photo.urls.small, width: photo.width, height: photo.height,
  alt: photo.alt_description || photo.description || 'Unsplash photograph',
  credit: `${photo.user.name} / Unsplash`, photographer: photo.user.name,
  photographerUrl: referral(photo.user.links.html), sourceUrl: referral(photo.links.html),
});
async function request(path, params) {
  return (await axios.get(`https://api.unsplash.com${path}`, {
    headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`, 'Accept-Version': 'v1' },
    params, timeout: 10000,
  })).data;
}
async function withAccess(req, accountId, operation) {
  let gate;
  try { gate = await loadAccount(req, accountId); }
  catch (_) { return { error: 'Could not verify carousel account access.', status: 500, code: 'ACCOUNT_UNAVAILABLE' }; }
  if (gate.error) return gate;
  if (!process.env.UNSPLASH_ACCESS_KEY) return { error: 'Unsplash is not connected yet. Ask an administrator to configure the Unsplash access key.', status: 503, code: 'UNSPLASH_NOT_CONFIGURED' };
  try { return { data: await operation() }; }
  catch (error) { return { error: error.response?.status === 429 || error.response?.status === 403 ? 'Unsplash is temporarily unavailable or its request limit was reached. Try again later.' : 'Could not reach Unsplash. Please try again.', status: 502, code: 'UNSPLASH_UNAVAILABLE' }; }
}
function searchPhotos(req, accountId, query = {}) {
  return withAccess(req, accountId, async () => {
    const page = Math.max(1, Math.min(100, Number.parseInt(query.page, 10) || 1));
    const term = String(query.query || '').trim().slice(0, 200);
    const data = await request(term ? '/search/photos' : '/photos', { ...(term ? { query: term, content_filter: 'high' } : {}), page, per_page: 24 });
    const photos = term ? data.results : data;
    return { photos: photos.map(serialize), page, hasMore: term ? page < data.total_pages : photos.length === 24 };
  });
}
function selectPhoto(req, accountId, photoId) {
  if (!/^[\w-]{1,100}$/.test(String(photoId || ''))) return Promise.resolve({ error: 'Invalid photograph.', status: 400, code: 'INVALID_PHOTO' });
  return withAccess(req, accountId, async () => {
    const photo = await request(`/photos/${photoId}`);
    // Construct the fixed provider endpoint from its ID; never fetch a client-supplied URL.
    await request(`/photos/${photoId}/download`);
    return { asset: serialize(photo) };
  });
}
module.exports = { searchPhotos, selectPhoto };
