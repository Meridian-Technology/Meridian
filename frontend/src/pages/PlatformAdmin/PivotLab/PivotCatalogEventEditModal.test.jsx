import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PivotCatalogEventEditModal from './PivotCatalogEventEditModal';

jest.mock('../../../components/Popup/Popup', () => ({ isOpen, children }) =>
  (isOpen ? <div>{children}</div> : null));
jest.mock('../../../components/IphoneDeviceFrame', () => ({ children, label }) => (
  <div aria-label={label}>{children}</div>
));
jest.mock('./PivotTmdbLookup', () => () => null);

const event = {
  name: 'Rooftop dance party',
  organizerName: 'Night Moves',
  location: '123 Main St',
  description: 'Dancing above the city.',
  image: 'https://images.example/event.jpg',
  sourceUrl: 'https://partiful.com/e/example',
  source: 'partiful',
  start_time: '2026-09-26T02:00:00.000Z',
  end_time: '2026-09-26T05:00:00.000Z',
  ingestStatus: 'staged',
  tags: ['nightlife'],
};

describe('PivotCatalogEventEditModal import mode', () => {
  it('reuses the editable review and live deck preview before staging', async () => {
    const onSave = jest.fn().mockResolvedValue(true);
    const onClose = jest.fn();

    render(
      <PivotCatalogEventEditModal
        open
        event={event}
        onClose={onClose}
        catalogTags={[{ slug: 'nightlife', label: 'Nightlife' }]}
        cityLabel="Brooklyn"
        batchWeek="2026-W39"
        onSave={onSave}
        saving={false}
        mode="import"
        title="Review Luma / Partiful event"
        saveLabel="Stage event"
        notices={['A matching event will be updated.']}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Review Luma / Partiful event' }))
      .toBeInTheDocument();
    expect(screen.getByText('A matching event will be updated.')).toBeInTheDocument();
    expect(screen.getByLabelText('Mobile deck preview')).toBeInTheDocument();
    expect(screen.getByText(/staged for review and will stay off the live feed/i))
      .toBeInTheDocument();
    expect(screen.queryByText('Ingest status')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Enrichment' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stage event' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({
      name: 'Rooftop dance party',
      organizerName: 'Night Moves',
      tags: ['nightlife'],
    }));
  });
});
