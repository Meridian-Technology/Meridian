import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

jest.mock('../../../../hooks/useFetch', () => ({ authenticatedRequest: jest.fn() }));

import { authenticatedRequest } from '../../../../hooks/useFetch';
import PivotCarouselReview, { trendLabel } from './PivotCarouselReview';

const issue = (overrides = {}) => ({
  id: 'issue-1', accountId: 'account-1', reviewState: 'unapproved', approval: null, feedbackNotes: [], ...overrides,
});
const renderReview = (props) => render(
  <PivotCarouselReview revision={1} caption="" onCaption={() => {}} disabled={false} onIssue={() => {}} onConflict={() => {}} {...props} />,
);

test('lists the online trends a generated draft cites so the reviewer can judge them', () => {
  renderReview({ issue: issue({ trendRefs: ['trend:kym:chinamaxxing', 'trend:later:small-text-zoom'] }) });
  const trends = screen.getByLabelText('Trends this draft uses');
  expect(within(trends).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'Chinamaxxing · Know Your Meme',
    'Small text zoom · Later',
  ]);
});

test('shows nothing about trends when the draft uses none', () => {
  renderReview({ issue: issue({ trendRefs: [] }) });
  expect(screen.queryByLabelText('Trends this draft uses')).toBeNull();
});

test('labels every trend source', () => {
  expect(trendLabel('trend:google:lunar-new-year')).toBe('Lunar new year · Google Trends');
  expect(trendLabel('trend:giphy:very-demure')).toBe('Very demure · GIPHY');
});

test('lists the other options with theme and state, and restores an archived one', async () => {
  const options = [
    { id: 'issue-1', themeLabel: 'This draft', status: 'active', reviewState: 'unapproved', picked: true, revision: 1 },
    { id: 'option-jazz', themeLabel: 'Jazz this weekend', status: 'archived', reviewState: 'unapproved', picked: false, revision: 2 },
    { id: 'option-campus', themeLabel: 'Campus weekdays', status: 'active', reviewState: 'approved', picked: false, revision: 1 },
  ];
  authenticatedRequest.mockImplementation(async (path, request = {}) => {
    if (path === '/admin/pivot/carousel-accounts/account-1/issues/issue-1/options' && !request.method) {
      return { data: { success: true, data: { optionSetId: 'job:compose-1', pickedIssueId: 'issue-1', options } } };
    }
    if (path === '/admin/pivot/carousel-accounts/account-1/issues/option-jazz/restore') {
      return { data: { success: true, data: { issue: { id: 'option-jazz', themeLabel: 'Jazz this weekend', status: 'active', reviewState: 'unapproved', picked: false, revision: 3 } } } };
    }
    throw new Error(`Unexpected request: ${path}`);
  });
  renderReview({ issue: issue({ optionSetId: 'job:compose-1' }) });
  const list = await screen.findByRole('list', { name: 'Other options' });
  const items = within(list).getAllByRole('listitem');
  expect(within(items[0]).getByText('Jazz this weekend')).toBeInTheDocument();
  expect(within(items[0]).getByText('Archived · Unapproved')).toBeInTheDocument();
  expect(within(items[0]).getByRole('button', { name: 'Restore' })).toBeEnabled();
  expect(within(items[1]).getByText('Campus weekdays')).toBeInTheDocument();
  expect(within(items[1]).getByText('Approved')).toBeInTheDocument();
  expect(within(items[1]).queryByRole('button', { name: 'Restore' })).toBeNull();

  fireEvent.click(within(items[0]).getByRole('button', { name: 'Restore' }));
  await waitFor(() => expect(within(items[0]).getByText('Unapproved')).toBeInTheDocument());
  expect(authenticatedRequest).toHaveBeenCalledWith(
    '/admin/pivot/carousel-accounts/account-1/issues/option-jazz/restore',
    { method: 'POST', data: { revision: 2 } },
  );
  expect(within(items[0]).queryByRole('button', { name: 'Restore' })).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('Option restored.');
});

test('shows the revision request thread when the draft has one', () => {
  renderReview({ issue: issue({ revisionRequests: [
    { id: 'req-1', requester: 'ada', time: '2026-11-06T20:00:00.000Z', revision: 1, text: 'Swap the cover line.' },
    { id: 'req-2', requester: 'ada', time: '2026-11-06T21:00:00.000Z', revision: 2, text: 'Shorten the caption.', reason: 'The caption is already that short.' },
  ] }) });
  const thread = screen.getByRole('list', { name: 'Revision requests' });
  const items = within(thread).getAllByRole('listitem');
  expect(items[0]).toHaveTextContent('Revision 1 · ada · 2026-11-06 20:00');
  expect(items[0]).toHaveTextContent('Swap the cover line.');
  expect(items[1]).toHaveTextContent('Shorten the caption.');
  expect(items[1]).toHaveTextContent('Reason: The caption is already that short.');
});

test('hides the option list and the request thread when the draft has neither', () => {
  renderReview({ issue: issue() });
  expect(screen.queryByRole('list', { name: 'Other options' })).toBeNull();
  expect(screen.queryByRole('list', { name: 'Revision requests' })).toBeNull();
  expect(authenticatedRequest).not.toHaveBeenCalled();
});
