import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { authenticatedRequest } from '../../../../hooks/useFetch';
import PivotCarouselCurationWorkspace from './PivotCarouselCurationWorkspace';

jest.mock('../../../../hooks/useFetch', () => ({ authenticatedRequest: jest.fn() }));

test('a missing draft stops curation instead of silently autosaving and revalidating it', async () => {
  authenticatedRequest.mockResolvedValue({ error: 'Curation draft not found.', code: 404 });
  const onCancel = jest.fn();
  render(<PivotCarouselCurationWorkspace
    account={{ id: 'account-1', defaultFormat: 'city-picks', sourceTenantKeys: ['sf'], ownerTenantKey: 'sf' }}
    draftId="missing-draft"
    onDraftId={() => {}}
    onCreated={() => {}}
    onApplied={() => {}}
    onCancel={onCancel}
  />);

  expect(await screen.findByText(/This curation draft is no longer available/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Review selection' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'All carousels' }));
  expect(onCancel).toHaveBeenCalled();
  await waitFor(() => expect(authenticatedRequest).toHaveBeenCalledTimes(1));
  expect(authenticatedRequest).toHaveBeenCalledWith('/admin/pivot/carousel-accounts/account-1/curation/drafts/missing-draft');
});
