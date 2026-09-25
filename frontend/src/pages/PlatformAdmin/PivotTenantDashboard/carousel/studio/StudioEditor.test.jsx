/* eslint-disable testing-library/no-node-access -- Canvas gestures must assert the rendered geometry wrappers. */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudioEditor from './StudioEditor';
import { authenticatedRequest } from '../../../../../hooks/useFetch';
jest.mock('@iconify/react', () => ({ Icon: () => null }));
jest.mock('../PivotCarouselCurationWorkspace', () => () => null);
jest.mock('../../../../../hooks/useFetch', () => ({ authenticatedRequest: jest.fn(async () => ({ data: { success: true, data: { assets: [] } } })) }));
const shape = { id: 'mark', kind: 'shape', layout: 'free', rotation: 0, frame: { x: 40, y: 50, width: 120, height: 80 } };
const makeIssue = (elements = [shape]) => ({ _id: 'i', name: 'Lanterns', revision: 1, document: { schemaVersion: 2, width: 1080, height: 1350, slides: [{ id: 's', role: 'event', width: 1080, height: 1350, elements }] } });
const node = () => screen.getByTestId('editor-stage').querySelector('[data-element-id="mark"]');
beforeAll(() => { window.PointerEvent = MouseEvent; });
test('typed text stays when the field closes', () => {
  const text = { id: 'mark', kind: 'text', text: 'Hello', presence: 'custom', frame: { x: 40, y: 50, width: 200, height: 80 } };
  render(<StudioEditor issue={makeIssue([text])} />);
  fireEvent.doubleClick(node());
  const field = document.querySelector('.studio-art__text.is-editing');
  field.textContent = 'Hello there';
  fireEvent.change(screen.getByLabelText('Zoom'), { target: { value: '0.4' } });
  expect(field.textContent).toBe('Hello there');
  fireEvent.pointerDown(screen.getByTestId('editor-stage'), { button: 0, clientX: 1, clientY: 1 });
  fireEvent.pointerUp(screen.getByTestId('editor-stage'), { button: 0, clientX: 1, clientY: 1 });
  expect(node().textContent).toBe('Hello there');
});
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
  expect(screen.getByTestId('export-issue').title).toMatch(/confirmed saved revision/);
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

test('a saved issue can export through Relay or a command', async () => {
  const onExport = jest.fn();
  authenticatedRequest.mockImplementation(async (url) => {
    if (String(url).includes('/export-token')) {
      return { data: { success: true, data: { token: 'tok.en', deckId: 'deck1', slideCount: 1 } } };
    }
    return { data: { success: true, data: { assets: [] } } };
  });
  render(<StudioEditor issue={{ ...makeIssue(), tenantKey: 'sf', _id: 'deck1' }} onExport={onExport} />);
  expect(screen.getByTestId('export-issue')).toBeEnabled();
  expect(screen.getByTestId('export-issue').title).toMatch(/saved revision/);
  fireEvent.click(screen.getByTestId('export-issue'));
  fireEvent.click(screen.getByRole('button', { name: 'Relay' }));
  expect(onExport).toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('export-issue'));
  fireEvent.click(screen.getByRole('button', { name: 'Command line' }));
  expect(await screen.findByLabelText('Export command')).toHaveValue(
    `node scripts/export-carousel.js deck1 'tok.en' 1 '${window.location.origin}'`,
  );
  authenticatedRequest.mockImplementation(async () => ({ data: { success: true, data: { assets: [] } } }));
});

test('autosave keeps a newer edit, undo still restores, and a later save uses the new revision', async () => {
  let resolve;
  const save = jest.fn(() => new Promise((done) => { resolve = done; }));
  render(<StudioEditor issue={makeIssue()} onSave={save} autosaveMs={800} />);
  fireEvent.pointerDown(node(), { clientX: 10, clientY: 10 }); fireEvent.pointerUp(node());
  fireEvent.change(screen.getByLabelText('width'), { target: { value: '180' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  fireEvent.change(screen.getByLabelText('width'), { target: { value: '220' } });
  await act(async () => resolve({ document: { schemaVersion: 2, slides: [] }, revision: 2 }));
  expect(node().style.width).toBe('220px');
  expect(screen.getByTestId('save-state')).toHaveTextContent('Unsaved');
  fireEvent.click(screen.getByRole('button', { name: 'Undo', exact: true }));
  expect(node().style.width).toBe('180px');
  expect(save).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), 1);
});

test('a conflict keeps the local edit and can reload, compare, or save a new issue', async () => {
  const serverDocument = { schemaVersion: 2, width: 1080, height: 1350, slides: [{ id: 's', role: 'event', width: 1080, height: 1350, elements: [{ ...shape, frame: { ...shape.frame, width: 90 } }] }] };
  const onSaveCopy = jest.fn(async () => ({ id: 'copy' }));
  const onOpenIssue = jest.fn();
  render(<StudioEditor issue={makeIssue()} onSave={async () => ({ error: 'Changed elsewhere', code: 'REVISION_CONFLICT', issue: { revision: 4, document: serverDocument, curation: null, sources: [] } })} onSaveCopy={onSaveCopy} onOpenIssue={onOpenIssue} />);
  fireEvent.pointerDown(node(), { clientX: 10, clientY: 10 }); fireEvent.pointerUp(node());
  fireEvent.change(screen.getByLabelText('width'), { target: { value: '200' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Changed elsewhere');
  expect(node().style.width).toBe('200px');
  fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
  expect(screen.getByRole('dialog', { name: 'Compare versions' })).toHaveTextContent('Revision 4');
  fireEvent.click(screen.getByRole('button', { name: 'Save as a new issue' }));
  await waitFor(() => expect(onOpenIssue).toHaveBeenCalledWith('copy'));
  expect(onSaveCopy).toHaveBeenCalled();
});

test('recovery is offered only for the same user, account, and issue, and is not marked saved', () => {
  authenticatedRequest.mockResolvedValue({ data: { success: true, data: { assets: [] } } });
  const { recoveryStorageKey } = require('./studioPersistence');
  const issue = { ...makeIssue(), accountId: 'account', updatedAt: '2026-09-24T00:00:00.000Z' };
  const newer = { ...issue.document, slides: [{ ...issue.document.slides[0], elements: [{ ...shape, frame: { ...shape.frame, width: 300 } }] }] };
  const payload = { userId: 'user-a', accountId: 'account', issueId: 'i', schemaVersion: 2, document: newer, editorial: { curation: { refs: [] }, sources: [] }, savedAt: '2026-09-24T01:00:00.000Z' };
  window.localStorage.setItem(recoveryStorageKey(payload), JSON.stringify(payload));
  const { unmount } = render(<StudioEditor issue={issue} userId="user-b" autosaveMs={60000} />);
  expect(screen.queryByRole('button', { name: 'Restore local edits' })).not.toBeInTheDocument();
  unmount();
  render(<StudioEditor issue={issue} userId="user-a" autosaveMs={60000} />);
  fireEvent.click(screen.getByRole('button', { name: 'Restore local edits' }));
  expect(screen.getByText(/not saved on the server yet/)).toBeInTheDocument();
  expect(screen.getByTestId('save-state')).toHaveTextContent('Unsaved');
  expect(node().style.width).toBe('300px');
  window.localStorage.clear();
});
