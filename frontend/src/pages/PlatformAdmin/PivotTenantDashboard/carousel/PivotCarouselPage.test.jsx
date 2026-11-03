import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PivotCarouselPage from './PivotCarouselPage';
import { authenticatedRequest } from '../../../../hooks/useFetch';

jest.mock('@iconify/react', () => ({ Icon: () => null }));
jest.mock('../../../../hooks/useFetch', () => ({ authenticatedRequest: jest.fn() }));
jest.mock('../../../../hooks/useAuth', () => () => ({ user: { id: 'reviewer' } }));
const mockNotify = jest.fn();
jest.mock('../../../../NotificationContext', () => ({ useNotification: () => ({ addNotification: mockNotify }) }));
jest.mock('../PivotTenantPage', () => ({ children }) => <div>{children}</div>);
jest.mock('./PivotCarouselEditor', () => () => <div>Legacy editor</div>);
jest.mock('./PivotCarouselCurationWorkspace', () => () => null);
jest.mock('./zineFrames', () => ({}));
jest.mock('./useCarouselExport', () => () => ({ startExport: jest.fn() }));
jest.mock('./PivotCarouselExportPanel', () => () => null);

const issuePath = '/admin/pivot/carousel-accounts/account/issues/issue';
let issue;
let failure;
const success = data => ({ data: { success: true, data } });
const conflict = () => ({ error: 'This issue changed in another session.', code: 409, errorCode: 'REVISION_CONFLICT', errorData: { storedRevision: issue.revision, issue } });

beforeEach(() => {
  localStorage.clear();
  failure = null;
  issue = {
    id: 'issue', accountId: 'account', name: 'City weekend', schemaVersion: 2,
    origin: 'agent-generated', reviewState: 'unapproved', revision: 3,
    socialCaption: 'See you downtown ✨', curation: { refs: [] }, sources: [], feedbackNotes: [],
    document: { schemaVersion: 2, width: 1080, height: 1350, slides: [{ id: 'cover', role: 'cover', elements: [] }] },
  };
  authenticatedRequest.mockImplementation(async (path, options = {}) => {
    // Deliberately omit editorial fields from the old tenant serializer.
    const legacy = { _id: issue.id, accountId: issue.accountId, name: issue.name, schemaVersion: 2, document: issue.document };
    if (path === '/admin/pivot/tenants/iowa/carousels') return success({ decks: [legacy] });
    if (path === '/admin/pivot/tenants/iowa/carousels/issue') return success({ deck: legacy });
    if (path === '/admin/pivot/carousel-accounts') return success({ accounts: [{ id: 'account' }] });
    if (path === '/admin/pivot/carousel-accounts/account/issues') return success({ issues: [issue] });
    if (path.endsWith('/assets')) return success({ assets: [] });
    if (path === issuePath && !options.method) return success({ issue });
    if (failure && (path === issuePath || path.endsWith(`/${failure}`))) return conflict();
    if (options.method === 'PATCH' && path === issuePath) {
      issue = { ...issue, ...options.data, revision: issue.revision + 1, reviewState: 'unapproved', approval: null };
      return success({ issue });
    }
    if (path === `${issuePath}/approve`) {
      issue = { ...issue, reviewState: 'approved', approval: { revision: issue.revision } };
      return success({ issue });
    }
    if (path === `${issuePath}/mark-posted`) {
      issue = { ...issue, reviewState: 'posted' };
      return success({ issue });
    }
    if (path === `${issuePath}/feedback`) return success({ note: { id: 'note', ...options.data } });
    throw new Error(`Unexpected request: ${path}`);
  });
});

function openPage(search = '?deckId=issue') {
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[`/carousel${search}`]}><PivotCarouselPage tenantKey="iowa" cityDisplayName="Iowa City" /></MemoryRouter>);
}

test('the library loads canonical review fields before opening a generated draft', async () => {
  openPage('');
  expect(await screen.findByText('Unapproved draft')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Review status'), { target: { value: 'unapproved' } });
  fireEvent.click(screen.getByRole('button', { name: /City weekend/ }));
  expect(await screen.findByLabelText('Social caption')).toHaveValue(issue.socialCaption);
});

test('caption and slides save together, then approval and posting use the new revision', async () => {
  openPage();
  fireEvent.change(await screen.findByLabelText('Social caption'), { target: { value: 'Make a night of it 🌙 #JustGo' } });
  expect(screen.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(screen.getByTestId('save-state')).toHaveTextContent('Saved'));
  expect(authenticatedRequest).toHaveBeenCalledWith(issuePath, {
    method: 'PATCH', data: expect.objectContaining({ revision: 3, socialCaption: 'Make a night of it 🌙 #JustGo', document: issue.document }),
  });
  fireEvent.click(screen.getByRole('button', { name: 'Approve', exact: true }));
  expect(await screen.findByText('Revision approved.')).toBeInTheDocument();
  expect(authenticatedRequest).toHaveBeenCalledWith(`${issuePath}/approve`, { method: 'POST', data: { revision: 4 } });
  fireEvent.click(screen.getByRole('button', { name: 'Mark posted' }));
  fireEvent.change(screen.getByLabelText('Instagram URL (optional)'), { target: { value: 'https://www.instagram.com/p/weekend/' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm posted' }));
  expect(await screen.findByText('Marked posted.')).toBeInTheDocument();
  expect(authenticatedRequest).toHaveBeenCalledWith(`${issuePath}/mark-posted`, { method: 'POST', data: { revision: 4, instagramUrl: 'https://www.instagram.com/p/weekend/' } });
  expect(screen.getByText('Posted', { exact: true })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Mark posted' })).toBeDisabled();
});

test('records a manual post without requiring an Instagram URL', async () => {
  issue = { ...issue, reviewState: 'approved', approval: { revision: 3 } };
  openPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Mark posted' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm posted' }));
  expect(await screen.findByText('Marked posted.')).toBeInTheDocument();
  expect(authenticatedRequest).toHaveBeenCalledWith(`${issuePath}/mark-posted`, { method: 'POST', data: { revision: 3, instagramUrl: '' } });
});

test('saving an approved caption returns the issue to an unapproved draft', async () => {
  issue = { ...issue, reviewState: 'approved', approval: { revision: 3 } };
  openPage();
  fireEvent.change(await screen.findByLabelText('Social caption'), { target: { value: 'Changed copy' } });
  expect(screen.getByRole('button', { name: 'Mark posted' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(screen.getByTestId('save-state')).toHaveTextContent('Saved'));
  expect(screen.getByText('Unapproved draft')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Mark posted' })).toBeDisabled();
});

test.each(['approve', 'reject', 'change'])('leaves %s feedback at the current revision', async disposition => {
  openPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Leave feedback' }));
  expect(screen.getByRole('button', { name: 'Save feedback' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Disposition'), { target: { value: disposition } });
  fireEvent.change(screen.getByLabelText('Feedback', { exact: true }), { target: { value: 'Use a quieter cover next time.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save feedback' }));
  expect(await screen.findByText('Feedback saved for the next issue.')).toBeInTheDocument();
  expect(authenticatedRequest).toHaveBeenCalledWith(`${issuePath}/feedback`, { method: 'POST', data: { revision: 3, text: 'Use a quieter cover next time.', disposition } });
  expect(screen.getByText(`${disposition} · Revision 3: Use a quieter cover next time.`)).toBeInTheDocument();
});

test.each(['approve', 'mark-posted', 'feedback', 'save'])('%s conflicts show a reload prompt and resume at the stored revision', async action => {
  if (action === 'mark-posted') issue = { ...issue, reviewState: 'approved', approval: { revision: 3 } };
  failure = action;
  openPage();
  await screen.findByLabelText('Social caption');
  // A different session saves after this editor has loaded revision 3.
  issue = { ...issue, socialCaption: 'Newer caption', revision: 7, reviewState: 'unapproved', approval: null };
  if (action === 'save') {
    fireEvent.change(screen.getByLabelText('Social caption'), { target: { value: 'Local caption' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  } else if (action === 'feedback') {
    fireEvent.click(screen.getByRole('button', { name: 'Leave feedback' }));
    fireEvent.change(screen.getByLabelText('Feedback', { exact: true }), { target: { value: 'A note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save feedback' }));
  } else if (action === 'mark-posted') {
    fireEvent.click(screen.getByRole('button', { name: 'Mark posted' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm posted' }));
  } else fireEvent.click(screen.getByRole('button', { name: 'Approve', exact: true }));
  const reload = await screen.findByRole('button', { name: 'Reload saved issue' });
  expect(screen.getByTestId('save-state')).toHaveTextContent('Conflict');
  expect(screen.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Mark posted' })).toBeDisabled();
  expect(screen.getByLabelText('Social caption')).toHaveValue(action === 'save' ? 'Local caption' : 'See you downtown ✨');
  failure = null;
  fireEvent.click(reload);
  await waitFor(() => expect(screen.getByLabelText('Social caption')).toHaveValue('Newer caption'));
  expect(screen.queryByRole('button', { name: 'Reload saved issue' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Approve', exact: true }));
  await screen.findByText('Revision approved.');
  expect(authenticatedRequest).toHaveBeenLastCalledWith(`${issuePath}/approve`, { method: 'POST', data: { revision: 7 } });
});

test('manual issues retain the studio without generated review controls', async () => {
  issue = { ...issue, origin: 'manual', reviewState: null };
  openPage();
  await screen.findByRole('heading', { name: 'City weekend' });
  expect(screen.queryByText('Unapproved draft')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Social caption')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Approve', exact: true })).not.toBeInTheDocument();
});

test('the library follows account issue pagination to find generated drafts', async () => {
  const request = authenticatedRequest.getMockImplementation();
  authenticatedRequest.mockImplementation((path, options) => {
    if (path === '/admin/pivot/carousel-accounts/account/issues') {
      return Promise.resolve(success(options.params.cursor ? { issues: [issue] } : { issues: [], nextCursor: 'next-page' }));
    }
    return request(path, options);
  });
  openPage('');
  expect(await screen.findByText('Unapproved draft')).toBeInTheDocument();
  expect(authenticatedRequest).toHaveBeenCalledWith('/admin/pivot/carousel-accounts/account/issues', { params: { limit: 50, cursor: 'next-page' } });
});

test('a validation failure stays in place and lets the admin correct the URL', async () => {
  issue = { ...issue, reviewState: 'approved', approval: { revision: 3 } };
  const request = authenticatedRequest.getMockImplementation();
  authenticatedRequest.mockImplementation((path, options) => {
    if (path.endsWith('/mark-posted')) return Promise.resolve({ error: 'That does not look like an Instagram URL.', code: 422, errorCode: 'INVALID_INSTAGRAM_URL' });
    return request(path, options);
  });
  openPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Mark posted' }));
  fireEvent.change(screen.getByLabelText('Instagram URL (optional)'), { target: { value: 'https://example.com/p/post' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm posted' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('That does not look like an Instagram URL.');
  expect(screen.getByRole('button', { name: 'Confirm posted' })).toBeEnabled();
  expect(screen.getByLabelText('Instagram URL (optional)')).toHaveValue('https://example.com/p/post');
  expect(screen.queryByRole('button', { name: 'Reload saved issue' })).not.toBeInTheDocument();
});

test('caption edits made during a save remain local until the next revision saves', async () => {
  const request = authenticatedRequest.getMockImplementation();
  let finishSave;
  authenticatedRequest.mockImplementation((path, options) => {
    if (path === issuePath && options?.method === 'PATCH') {
      return new Promise(resolve => { finishSave = () => resolve(request(path, options)); });
    }
    return request(path, options);
  });
  openPage();
  fireEvent.change(await screen.findByLabelText('Social caption'), { target: { value: 'First edit' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  fireEvent.change(screen.getByLabelText('Social caption'), { target: { value: 'Keep typing' } });
  finishSave();
  await waitFor(() => expect(screen.getByTestId('save-state')).toHaveTextContent('Unsaved'));
  expect(screen.getByLabelText('Social caption')).toHaveValue('Keep typing');
  expect(screen.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  finishSave();
  await waitFor(() => expect(screen.getByTestId('save-state')).toHaveTextContent('Saved'));
  expect(authenticatedRequest).toHaveBeenLastCalledWith(issuePath, { method: 'PATCH', data: expect.objectContaining({ revision: 4, socialCaption: 'Keep typing' }) });
});
