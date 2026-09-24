/* eslint-disable testing-library/no-node-access -- Canvas gestures must assert the rendered geometry wrappers. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import StudioEditor from './StudioEditor';
import { authenticatedRequest } from '../../../../../hooks/useFetch';
jest.mock('@iconify/react', () => ({ Icon: () => null }));
jest.mock('../PivotCarouselCurationWorkspace', () => () => null);
jest.mock('../../../../../hooks/useFetch', () => ({ authenticatedRequest: jest.fn(async () => ({ data: { success: true, data: { assets: [] } } })) }));
const shape = { id: 'mark', kind: 'shape', layout: 'free', rotation: 0, frame: { x: 40, y: 50, width: 120, height: 80 } };
const makeIssue = (elements = [shape]) => ({ _id: 'i', name: 'Lanterns', revision: 1, document: { schemaVersion: 2, width: 1080, height: 1350, slides: [{ id: 's', role: 'event', width: 1080, height: 1350, elements }] } });
const node = () => screen.getByTestId('editor-stage').querySelector('[data-element-id="mark"]');
beforeAll(() => { window.PointerEvent = MouseEvent; });
test('a completed drag moves the rendered frame and creates exactly one undo transaction', () => {
  render(<StudioEditor issue={makeIssue()} />);
  fireEvent.pointerDown(node(), { clientX: 50, clientY: 50, pointerId: 1, button: 0 });
  fireEvent.pointerMove(screen.getByTestId('editor-stage'), { clientX: 92, clientY: 71, pointerId: 1 });
  fireEvent.pointerUp(screen.getByTestId('editor-stage'), { clientX: 92, clientY: 71, pointerId: 1 });
  expect(node().style.left).toBe('140px'); expect(node().style.top).toBe('100px');
  fireEvent.click(screen.getByRole('button', { name: 'Undo', exact: true }));
  expect(node().getAttribute('data-frame')).toBe('40,50,120,80');
  expect(screen.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Redo', exact: true }));
  expect(node().style.left).toBe('140px');
});
test('backspace on a sidebar slide deletes that slide', () => {
  const issue = makeIssue();
  issue.document.slides.push({ id: 's2', role: 'event', width: 1080, height: 1350, elements: [] });
  render(<StudioEditor issue={issue} />);
  const slide = screen.getByRole('button', { name: 'Slide 2' });
  fireEvent.click(slide);
  fireEvent.keyDown(slide, { key: 'Backspace' });
  expect(screen.queryByRole('button', { name: 'Slide 2' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Slide 1' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Undo', exact: true }));
  expect(screen.getByRole('button', { name: 'Slide 2' })).toBeInTheDocument();
});
test('escape cancels the gesture and leaves no undo entry', () => {
  render(<StudioEditor issue={makeIssue()} />);
  fireEvent.pointerDown(node(), { clientX: 50, clientY: 50 });
  fireEvent.pointerMove(screen.getByTestId('editor-stage'), { clientX: 90, clientY: 75 });
  expect(node().style.left).not.toBe('40px');
  fireEvent.keyDown(screen.getByTestId('editor-stage'), { key: 'Escape' });
  expect(node().style.left).toBe('40px'); expect(screen.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});
test('typing shortcuts remain in the text field; v2 export explains its unavailable state', () => {
  render(<StudioEditor issue={makeIssue()} />);
  fireEvent.pointerDown(node(), { clientX: 10, clientY: 10 }); fireEvent.pointerUp(node());
  fireEvent.change(screen.getByLabelText('width'), { target: { value: '180' } });
  fireEvent.keyDown(screen.getByLabelText('width'), { key: 'Backspace' });
  expect(node().style.width).toBe('180px'); expect(screen.getByTestId('export-issue')).toBeDisabled();
  expect(screen.getByTestId('export-issue').title).toMatch(/exact-revision/);
});
test('a save response does not overwrite edits made while the request is pending', async () => {
  let resolve; const save = jest.fn(document => new Promise(done => { resolve = () => done({ document }); }));
  render(<StudioEditor issue={makeIssue()} onSave={save} />);
  fireEvent.pointerDown(node(), { clientX: 10, clientY: 10 }); fireEvent.pointerUp(node());
  fireEvent.change(screen.getByLabelText('width'), { target: { value: '180' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  fireEvent.change(screen.getByLabelText('width'), { target: { value: '220' } });
  await act(async () => resolve());
  expect(node().style.width).toBe('220px'); expect(screen.getByTestId('save-state')).toHaveTextContent('Unsaved');
});
test('failed saves preserve edits and expose retry', async () => {
  render(<StudioEditor issue={makeIssue()} onSave={async () => { throw new Error('offline'); }} />);
  fireEvent.pointerDown(node(), { clientX: 10, clientY: 10 }); fireEvent.pointerUp(node());
  fireEvent.change(screen.getByLabelText('width'), { target: { value: '180' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await screen.findByText('The save failed. Your edits are still here. Try again.');
  expect(screen.getByTestId('save-state')).toHaveTextContent('Save failed'); expect(node().style.width).toBe('180px');
  expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
});

test('pointer cancellation restores geometry and a conflicting save keeps the document', async () => {
  render(<StudioEditor issue={makeIssue()} onSave={async () => ({ error: 'Changed elsewhere', code: 'REVISION_CONFLICT' })} />);
  fireEvent.pointerDown(node(), { clientX: 50, clientY: 50 });
  fireEvent.pointerMove(screen.getByTestId('editor-stage'), { clientX: 90, clientY: 75 });
  fireEvent.pointerCancel(screen.getByTestId('editor-stage'));
  expect(node().style.left).toBe('40px');
  fireEvent.change(screen.getByLabelText('width'), { target: { value: '200' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await screen.findByText('Changed elsewhere');
  expect(screen.getByTestId('save-state')).toHaveTextContent('Conflict'); expect(node().style.width).toBe('200px');
});

test('Add a photograph opens the picker and successful replacement is one undo step', async () => {
  const photo = { ...shape, kind: 'image', asset: {}, crop: { focalX: .4, focalY: .6, scale: 1.2 } };
  const image = { id: 'asset', accountId: 'account', key: 'pivot-carousel/accounts/account/image.png', src: 'https://assets.test/image.png' };
  authenticatedRequest.mockResolvedValueOnce({ data: { success: true, data: { asset: image } } });
  render(<StudioEditor issue={makeIssue([photo])} />);
  fireEvent.click(screen.getByRole('button', { name: /Add a photograph/ }));
  expect(screen.getByRole('dialog', { name: 'Choose a photograph' })).toBeInTheDocument();
  const input = screen.getByLabelText('Upload photograph');
  fireEvent.change(input, { target: { files: [new File(['image'], 'photo.png', { type: 'image/png' })] } });
  await screen.findByText('Image uploaded. Save to keep it in this issue.');
  expect(node().getAttribute('data-frame')).toBe('40,50,120,80'); expect(node().querySelector('img').src).toBe(image.src);
  fireEvent.click(screen.getByRole('button', { name: 'Undo', exact: true }));
  expect(screen.getByRole('button', { name: /Add a photograph/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});
test('failed image uploads preserve the original image and geometry', async () => {
  const photo = { ...shape, kind: 'image', asset: { src: 'https://assets.test/original.png' } };
  authenticatedRequest.mockRejectedValueOnce(new Error('Upload failed'));
  render(<StudioEditor issue={makeIssue([photo])} />);
  fireEvent.pointerDown(node(), { clientX: 10, clientY: 10 }); fireEvent.pointerUp(node());
  fireEvent.click(screen.getByRole('button', { name: 'Replace image' }));
  fireEvent.change(screen.getByLabelText('Upload photograph'), { target: { files: [new File(['image'], 'photo.png', { type: 'image/png' })] } });
  expect(await screen.findByRole('alert')).toHaveTextContent('Upload failed'); expect(node().querySelector('img').src).toBe(photo.asset.src);
  expect(screen.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('choosing a source event photograph replaces the frame and undoes in one step', () => {
  const photo = { ...shape, kind: 'image', asset: {}, crop: { focalX: .4, focalY: .6, scale: 1.2 } };
  const issue = { ...makeIssue([photo]), sources: [{ snapshot: { name: 'Other event', image: 'https://assets.test/other.jpg', imageCredit: 'Event photographer' } }] };
  render(<StudioEditor issue={issue} />);
  fireEvent.click(screen.getByRole('button', { name: /Add a photograph/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Use Other event' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(node().querySelector('img').src).toBe('https://assets.test/other.jpg');
  expect(node().getAttribute('data-frame')).toBe('40,50,120,80');
  fireEvent.click(screen.getByRole('button', { name: 'Undo', exact: true }));
  expect(screen.getByRole('button', { name: /Add a photograph/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('saved assets stay account-scoped and an Unsplash photo can be inserted again', async () => {
  const stock = { id: 'unsplash:abc', provider: 'unsplash', photoId: 'abc', src: 'https://images.unsplash.com/night.jpg', alt: 'Night market', photographer: 'Pat', photographerUrl: 'https://unsplash.com/@pat?utm_source=just_go&utm_medium=referral', sourceUrl: 'https://unsplash.com/photos/abc?utm_source=just_go&utm_medium=referral', credit: 'Pat / Unsplash' };
  authenticatedRequest.mockResolvedValueOnce({ data: { success: true, data: { assets: [stock] } } });
  const issue = { ...makeIssue(), accountId: 'account', sources: [{ snapshot: { name: 'Other event', image: 'https://assets.test/other.jpg' } }] };
  render(<StudioEditor issue={issue} />);
  fireEvent.click(screen.getByRole('button', { name: 'Image', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Saved assets', exact: true }));
  expect(await screen.findByRole('button', { name: 'Use Night market' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Use Other event' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close image picker', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Assets', exact: true }));
  fireEvent.click(await screen.findByRole('button', { name: 'Night market' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByTestId('editor-stage').querySelector('img').src).toBe(stock.src);
});

test('a rejected upload explains why and leaves the picker open', async () => {
  render(<StudioEditor issue={makeIssue()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Image', exact: true }));
  fireEvent.change(screen.getByLabelText('Upload photograph'), { target: { files: [new File(['notes'], 'notes.txt', { type: 'text/plain' })] } });
  expect(await screen.findByRole('alert')).toHaveTextContent('Use a PNG, JPEG, WebP, or GIF.');
  expect(screen.getByRole('dialog', { name: 'Choose a photograph' })).toBeInTheDocument();
});

test('an Unsplash background keeps its photographer credit', () => {
  const stock = { provider: 'unsplash', photoId: 'abc', src: 'https://images.unsplash.com/night.jpg', photographer: 'Pat', photographerUrl: 'https://unsplash.com/@pat?utm_source=just_go&utm_medium=referral', sourceUrl: 'https://unsplash.com/photos/abc?utm_source=just_go&utm_medium=referral' };
  const issue = makeIssue();
  issue.document.slides[0].background = { kind: 'image', asset: stock };
  render(<StudioEditor issue={issue} />);
  const credits = screen.getAllByRole('link', { name: 'Pat' });
  expect(credits.length).toBeGreaterThan(0);
  credits.forEach(link => expect(link).toHaveAttribute('href', stock.photographerUrl));
  screen.getAllByRole('link', { name: 'Unsplash' }).forEach(link => expect(link).toHaveAttribute('href', stock.sourceUrl));
});
