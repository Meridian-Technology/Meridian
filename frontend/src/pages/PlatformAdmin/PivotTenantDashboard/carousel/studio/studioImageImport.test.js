import { parseImageImportLink, unsplashPhotoIdFromUrl } from './studioImageImport';

test('parses Unsplash photo page URLs', () => {
  expect(unsplashPhotoIdFromUrl('https://unsplash.com/photos/abc')).toBe('abc');
  expect(unsplashPhotoIdFromUrl('https://unsplash.com/photos/red-japanese-hanging-lanterns-J0-DwclQQs8')).toBe('J0-DwclQQs8');
  expect(parseImageImportLink('https://unsplash.com/photos/crowd-dancing-in-a-dimly-lit-nightclub-ucOj9HnuSM4')).toEqual({
    kind: 'unsplash',
    photoId: 'ucOj9HnuSM4',
  });
});

test('parses direct image links', () => {
  expect(parseImageImportLink('https://cdn.example.com/photos/night.jpg')).toEqual({
    kind: 'url',
    src: 'https://cdn.example.com/photos/night.jpg',
  });
});

test('rejects empty and invalid input', () => {
  expect(parseImageImportLink('')).toEqual({ error: 'Paste an image link or Unsplash URL.' });
  expect(parseImageImportLink('not-a-url')).toEqual({ error: 'Use a direct image link (https://…) or an Unsplash photo page.' });
});
