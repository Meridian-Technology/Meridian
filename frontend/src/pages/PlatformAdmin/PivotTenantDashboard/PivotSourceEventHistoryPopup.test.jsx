import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PivotSourceEventHistoryPopup from './PivotSourceEventHistoryPopup';
import { authenticatedRequest } from '../../../hooks/useFetch';

jest.mock('../../../hooks/useFetch', () => ({ authenticatedRequest: jest.fn() }));
jest.mock('../../../components/Popup/Popup', () => ({ isOpen, children }) => isOpen ? <div>{children}</div> : null);
jest.mock('../PivotLab/PivotCatalogEventEditModal', () => ({
  __esModule: true,
  default: ({ open, event, onSave, lockIngestStatus }) => open ? <div>
    <span>{event.name} editor</span>
    <span>{lockIngestStatus ? 'Status locked' : 'Status editable'}</span>
    <button type="button" onClick={() => onSave({ ingestStatus: 'published', name: 'Corrected title' },
      { rememberForCalendar: true })}>Save correction</button>
  </div> : null,
  catalogEditDraftToOverrides: (draft) => draft,
}));

const source = { _id: 'source-1', label: 'Venue calendar', host: 'venue.example',
  entrypoints: [{ id: 'job-1', label: 'Main calendar' }] };
const response = { success: true, data: { total: 1, page: 1, pageSize: 24,
  events: [{ _id: 'event-1', name: 'Wrong title', ingestStatus: 'staged', attribution: 'primary',
    batchWeek: '2026-W35', start_time: '2026-08-27T18:00:00Z', location: 'Venue' }] } };

describe('PivotSourceEventHistoryPopup', () => {
  beforeEach(() => { authenticatedRequest.mockReset(); authenticatedRequest.mockResolvedValue({ data: response }); });

  it('loads historical events and filters by status', async () => {
    render(<PivotSourceEventHistoryPopup open source={source} tenantKey="nyc" onClose={jest.fn()} />);
    expect(await screen.findByText('Wrong title')).toBeInTheDocument();
    expect(screen.getByText(/2026-W35/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter source events by status'), { target: { value: 'published' } });
    await waitFor(() => expect(authenticatedRequest).toHaveBeenCalledWith(
      '/admin/pivot/tenants/nyc/sources/source-1/events?page=1&status=published',
    ));
    fireEvent.change(screen.getByLabelText('Filter source events by entrypoint'), { target: { value: 'job-1' } });
    await waitFor(() => expect(authenticatedRequest).toHaveBeenCalledWith(
      '/admin/pivot/tenants/nyc/sources/source-1/events?page=1&status=published&entrypointId=job-1',
    ));
  });

  it('saves corrections without changing publication status', async () => {
    const onUpdated = jest.fn();
    render(<PivotSourceEventHistoryPopup open source={source} tenantKey="nyc" onClose={jest.fn()} onUpdated={onUpdated} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit event' }));
    expect(screen.getByText('Status locked')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    await waitFor(() => expect(authenticatedRequest).toHaveBeenCalledWith('/admin/pivot/ingest/event-1', {
      method: 'PATCH', data: { tenantKey: 'nyc', overrides: { name: 'Corrected title' }, rememberForCalendar: true },
    }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });
});
