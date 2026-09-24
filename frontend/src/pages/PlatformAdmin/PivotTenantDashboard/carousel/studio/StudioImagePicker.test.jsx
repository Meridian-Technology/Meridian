import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudioImagePicker, { eventImages } from './StudioImagePicker';
import { authenticatedRequest } from '../../../../../hooks/useFetch';
jest.mock('../../../../../hooks/useFetch', () => ({ authenticatedRequest: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
const asset = { src: 'https://images.test/photo.jpg', alt: 'Night market' };
test('includes source photographs and other slides without duplicate images', () => {
  expect(eventImages({ editorial: { sources: [{ snapshot: { image: asset.src, name: asset.alt } }] }, slides: [{ elements: [{ kind: 'image', asset }, { kind: 'image', role: 'sticker', asset: { src: 'sticker.svg' } }] }] })).toEqual([{ ...asset, credit: '' }]);
});
test('choosing another event image uses it without uploading', () => {
  const onChoose = jest.fn(); const onClose = jest.fn();
  render(<StudioImagePicker events={[asset]} assets={[]} onChoose={onChoose} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Use Night market' }));
  expect(onChoose).toHaveBeenCalledWith(asset); expect(onClose).toHaveBeenCalled(); expect(authenticatedRequest).not.toHaveBeenCalled();
});
test('Unsplash browse/search/select tracks selection before applying and credits the photographer', async () => {
  const photo = { ...asset, provider: 'unsplash', photoId: 'abc', photographer: 'Pat', photographerUrl: 'https://unsplash.com/@pat', sourceUrl: 'https://unsplash.com/photos/abc' };
  authenticatedRequest.mockResolvedValueOnce({ data: { success: true, data: { photos: [photo], page: 1, hasMore: false } } }).mockResolvedValueOnce({ data: { success: true, data: { asset: photo } } });
  const onChoose = jest.fn();
  render(<StudioImagePicker accountId="a" events={[]} assets={[]} onChoose={onChoose} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Unsplash', exact: true }));
  fireEvent.click(await screen.findByRole('button', { name: 'Use Night market' }));
  await waitFor(() => expect(onChoose).toHaveBeenCalledWith(photo));
  expect(screen.getByRole('link', { name: 'Pat' })).toHaveAttribute('href', photo.photographerUrl);
  expect(authenticatedRequest).toHaveBeenLastCalledWith('/admin/pivot/carousel-accounts/a/unsplash/select', { method: 'POST', data: { photoId: 'abc' } });
});
test('Unsplash failures leave picker open and do not choose a photo', async () => {
  authenticatedRequest.mockRejectedValue(new Error('Service unavailable'));
  const onChoose = jest.fn(); const onClose = jest.fn();
  render(<StudioImagePicker accountId="a" events={[]} assets={[]} onChoose={onChoose} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Unsplash', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
  expect(onChoose).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
});

test('inserting Unsplash metadata survives and replacing an uploaded asset clears its account key', () => {
  const commands = require('./studioEditorCommands');
  const doc = { schemaVersion: 2, width: 1080, height: 1350, slides: [{ id: 's', elements: [] }] };
  const stock = { ...asset, provider: 'unsplash', photoId: 'abc', photographer: 'Pat', sourceUrl: 'https://unsplash.com/photos/abc' };
  const inserted = commands.insertUploadedImage(doc, 's', stock);
  expect(inserted.slides[0].elements[0].asset).toMatchObject(stock);
  const image = inserted.slides[0].elements[0];
  image.asset = { src: 'https://storage.test/old.jpg', accountId: 'a', key: 'pivot-carousel/accounts/a/old.jpg' };
  const changed = commands.replaceImageAsset(inserted, 's', image.id, stock);
  expect(changed.slides[0].elements[0].asset.accountId).toBeUndefined();
  expect(changed.slides[0].elements[0].asset.key).toBeUndefined();
  const replaced = commands.replaceImageAsset(changed, 's', image.id, { src: 'https://events.test/photo.jpg' });
  expect(replaced.slides[0].elements[0].asset.provider).toBeUndefined();
});

test('replacing a background drops the previous account key and Unsplash metadata', () => {
  const commands = require('./studioEditorCommands');
  let doc = { schemaVersion: 2, width: 1080, height: 1350, slides: [{ id: 's', elements: [], background: { kind: 'fill', color: '#111' } }] };
  doc = commands.setBackgroundImage(doc, 's', { src: 'https://storage.test/old.jpg', accountId: 'a', key: 'pivot-carousel/accounts/a/old.jpg', credit: 'Studio' });
  const stock = { ...asset, provider: 'unsplash', photoId: 'abc', photographer: 'Pat', credit: 'Pat / Unsplash' };
  doc = commands.setBackgroundImage(doc, 's', stock);
  expect(doc.slides[0].background.asset.accountId).toBeUndefined();
  expect(doc.slides[0].background.asset.key).toBeUndefined();
  expect(doc.slides[0].background.asset.photoId).toBe('abc');
  doc = commands.setBackgroundImage(doc, 's', { src: 'https://events.test/photo.jpg', credit: 'Event photographer' });
  expect(doc.slides[0].background.asset.provider).toBeUndefined();
  expect(doc.slides[0].background.asset.photoId).toBeUndefined();
  expect(commands.assetsInDocument(doc).map(item => item.src)).toContain('https://events.test/photo.jpg');
});
