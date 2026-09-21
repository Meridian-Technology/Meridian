const { explainCoverImageSkip, probeCoverImageUrl } = require('../../utilities/pivotCoverImage');

describe('explainCoverImageSkip', () => {
  it('flags missing and non-http covers', () => {
    expect(explainCoverImageSkip(null).code).toBe('MISSING_IMAGE');
    expect(explainCoverImageSkip('   ').code).toBe('MISSING_IMAGE');
    expect(explainCoverImageSkip('not-a-url').code).toBe('BROKEN_IMAGE');
    expect(explainCoverImageSkip('ftp://cdn.example/a.jpg').code).toBe('BROKEN_IMAGE');
    expect(explainCoverImageSkip('https://cdn.example/a.jpg')).toBeNull();
  });
});

describe('probeCoverImageUrl', () => {
  it('treats 404 as broken and 200 as ok', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: { get: () => 'text/html' },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'image/jpeg' },
      });

    await expect(probeCoverImageUrl('https://cdn.example/missing.jpg', { fetchImpl }))
      .resolves.toEqual({ ok: false, reason: 'http' });
    await expect(probeCoverImageUrl('https://cdn.example/ok.jpg', { fetchImpl }))
      .resolves.toEqual({ ok: true });
  });
});
