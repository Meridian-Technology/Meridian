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
  const input = screen.getByLabelText('Add photograph file'); const click = jest.spyOn(input, 'click');
  fireEvent.click(screen.getByRole('button', { name: /Add a photograph/ })); expect(click).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { files: [new File(['image'], 'photo.png', { type: 'image/png' })] } });
  await screen.findByText('Image uploaded. Save to keep it in this issue.');
  expect(node().getAttribute('data-frame')).toBe('40,50,120,80'); expect(node().querySelector('img').src).toBe(image.src);
  fireEvent.click(screen.getByRole('button', { name: 'Undo', exact: true }));
  expect(screen.getByRole('button', { name: /Add a photograph/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled(); click.mockRestore();
});
test('failed image uploads preserve the original image and geometry', async () => {
  const photo = { ...shape, kind: 'image', asset: { src: 'https://assets.test/original.png' } };
  authenticatedRequest.mockRejectedValueOnce(new Error('Upload failed'));
  render(<StudioEditor issue={makeIssue([photo])} />);
  fireEvent.pointerDown(node(), { clientX: 10, clientY: 10 }); fireEvent.pointerUp(node());
  fireEvent.change(screen.getByLabelText('Replace image'), { target: { files: [new File(['image'], 'photo.png', { type: 'image/png' })] } });
  await screen.findByText('Upload failed'); expect(node().querySelector('img').src).toBe(photo.asset.src);
  expect(screen.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});
