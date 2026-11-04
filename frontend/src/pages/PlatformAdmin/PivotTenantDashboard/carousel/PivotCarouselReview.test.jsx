import { render, screen, within } from '@testing-library/react';

jest.mock('../../../../hooks/useFetch', () => ({ authenticatedRequest: jest.fn() }));

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
