jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../../services/pivotCarouselIssueService', () => ({ loadAccount: jest.fn() }));
const axios = require('axios');
const { loadAccount } = require('../../services/pivotCarouselIssueService');
const { searchPhotos, selectPhoto } = require('../../services/pivotCarouselUnsplashService');
const photo = { id: 'abc', urls: { regular: 'https://images.unsplash.com/test?ixid=123', small: 'https://images.unsplash.com/thumb?ixid=123' }, user: { name: 'Pat', links: { html: 'https://unsplash.com/@pat' } }, links: { html: 'https://unsplash.com/photos/abc' }, width: 1200, height: 900 };
const previousKey = process.env.UNSPLASH_ACCESS_KEY;
beforeEach(() => { jest.clearAllMocks(); process.env.UNSPLASH_ACCESS_KEY = 'test-only'; loadAccount.mockResolvedValue({ data: {} }); });
afterAll(() => { if (previousKey === undefined) delete process.env.UNSPLASH_ACCESS_KEY; else process.env.UNSPLASH_ACCESS_KEY = previousKey; });
test('account authorization runs before any provider request', async () => {
  loadAccount.mockResolvedValue({ error: 'Forbidden', status: 403 });
  expect((await searchPhotos({}, 'other')).status).toBe(403); expect(axios.get).not.toHaveBeenCalled();
});
test('missing configuration is actionable without exposing credentials', async () => {
  delete process.env.UNSPLASH_ACCESS_KEY;
  expect((await searchPhotos({}, 'a')).code).toBe('UNSPLASH_NOT_CONFIGURED'); expect(axios.get).not.toHaveBeenCalled();
});
test('search retains hotlinked URLs and photographer attribution with paging', async () => {
  axios.get.mockResolvedValue({ data: { results: [photo], total_pages: 4 } });
  const result = await searchPhotos({}, 'a', { query: 'city nights', page: 2 });
  expect(result.data).toMatchObject({ page: 2, hasMore: true, photos: [{ src: photo.urls.regular, photographer: 'Pat', photographerUrl: 'https://unsplash.com/@pat?utm_source=just_go&utm_medium=referral' }] });
  expect(axios.get).toHaveBeenCalledWith('https://api.unsplash.com/search/photos', expect.objectContaining({ params: expect.objectContaining({ query: 'city nights', page: 2 }) }));
});
test('select fetches authoritative metadata and tracks use at a fixed endpoint', async () => {
  axios.get.mockResolvedValueOnce({ data: photo }).mockResolvedValueOnce({ data: {} });
  expect((await selectPhoto({}, 'a', 'abc')).data.asset.src).toBe(photo.urls.regular);
  expect(axios.get.mock.calls[1][0]).toBe('https://api.unsplash.com/photos/abc/download');
  expect((await selectPhoto({}, 'a', 'https://evil.test')).status).toBe(400);
});
test('tracking failure does not return an asset or expose provider errors', async () => {
  axios.get.mockResolvedValueOnce({ data: photo }).mockRejectedValueOnce(new Error('secret header'));
  const result = await selectPhoto({}, 'a', 'abc'); expect(result.data).toBeUndefined(); expect(result.error).not.toContain('secret');
});
