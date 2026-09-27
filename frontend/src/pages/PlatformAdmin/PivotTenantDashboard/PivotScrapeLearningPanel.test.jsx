import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PivotScrapeLearningPanel from './PivotScrapeLearningPanel';
import { authenticatedRequest } from '../../../hooks/useFetch';

jest.mock('../../../hooks/useFetch', () => ({ authenticatedRequest: jest.fn() }));

const source = {
  _id: 'source-1', provider: 'generic-site', promptHints: ['Use section dates.'],
  entrypoints: [{ id: 'job-1', label: 'Venue calendar', provider: 'generic-site',
    url: 'https://venue.example/events', extractionProfile: {
      promptHints: ['Check detail pages.'],
      suggestedHints: [{ id: 'event-1:location', field: 'location', eventId: 'event-1',
        text: 'Use the event detail venue.' }],
      learningRuns: [{ runKey: 'run-1', completedAt: '2026-09-25T00:00:00Z',
        hintCount: 2, discovered: 8, upserted: 5, corrections: 1, estimatedCredits: 5 }],
    } }],
};

describe('PivotScrapeLearningPanel', () => {
  beforeEach(() => authenticatedRequest.mockReset());

  it('shows approved hints, a reviewable suggestion, and run outcomes', () => {
    render(<PivotScrapeLearningPanel tenantKey="nyc" source={source} onUpdated={jest.fn()} />);
    expect(screen.getByDisplayValue('Use section dates.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Check detail pages.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Use the event detail venue.')).toBeInTheDocument();
    expect(screen.getByText(/8 extracted · 5 applied/)).toBeInTheDocument();
    expect(screen.getByText(/~5 Firecrawl credits/)).toBeInTheDocument();
  });

  it('submits reviewed suggestion text to the job endpoint', async () => {
    authenticatedRequest.mockResolvedValue({ data: { success: true } });
    const onUpdated = jest.fn();
    render(<PivotScrapeLearningPanel tenantKey="nyc" source={source} onUpdated={onUpdated} />);
    fireEvent.change(screen.getByLabelText('Suggested location hint'), {
      target: { value: 'Check each event detail page for its venue.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(authenticatedRequest).toHaveBeenCalledWith(
      '/admin/pivot/tenants/nyc/curation-jobs/job-1',
      { method: 'PATCH', data: { hintDecision: { id: 'event-1:location', action: 'approve',
        text: 'Check each event detail page for its venue.' } } },
    ));
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });
});
