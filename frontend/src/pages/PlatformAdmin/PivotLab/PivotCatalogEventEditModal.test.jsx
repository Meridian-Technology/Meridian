import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PivotCatalogEventEditModal, {
  catalogEditDraftToOverrides,
} from './PivotCatalogEventEditModal';

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
    expect(screen.getByLabelText('Price')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stage event' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({
      name: 'Rooftop dance party',
      organizerName: 'Night Moves',
      tags: ['nightlife'],
    }));
  });

  it('shows the scraped ticket price and sends an edited label when staging', async () => {
    const onSave = jest.fn().mockResolvedValue(true);
    render(
      <PivotCatalogEventEditModal
        open
        event={{
          ...event,
          price: '$15 suggested',
          parsed: {
            price: { raw: '$15 suggested', min: 15, currency: 'USD', suggested: true, band: 'low' },
          },
        }}
        onClose={jest.fn()}
        catalogTags={[{ slug: 'nightlife', label: 'Nightlife' }]}
        cityLabel="Brooklyn"
        batchWeek="2026-W39"
        onSave={onSave}
        saving={false}
        mode="import"
        title="Review Luma / Partiful event"
        saveLabel="Stage event"
      />,
    );

    const price = screen.getByLabelText('Price');
    expect(price).toHaveValue('$15 suggested');
    expect(screen.getByText(/Scraped as 15 USD · suggested · low band/)).toBeInTheDocument();

    fireEvent.change(price, { target: { value: 'Free' } });
    fireEvent.click(screen.getByRole('button', { name: 'Stage event' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].price).toBe('Free');
    expect(catalogEditDraftToOverrides(onSave.mock.calls[0][0]).details).toBeUndefined();
  });

  it('shows named ticket options and keeps them when the price label is unchanged', async () => {
    const onSave = jest.fn().mockResolvedValue(true);
    const details = {
      version: 1,
      admission: 'paid',
      ticketProvider: 'Luma',
      priceRange: {
        min: { amountMinor: 2000, currency: 'USD' },
        max: { amountMinor: 3000, currency: 'USD' },
      },
      tiers: [
        { id: 'ga', name: 'General', kind: 'general', price: { amountMinor: 2000, currency: 'USD' } },
        {
          id: 'sup',
          name: 'Supporter',
          kind: 'other',
          price: { amountMinor: 3000, currency: 'USD' },
          status: 'sold_out',
        },
      ],
    };
    render(
      <PivotCatalogEventEditModal
        open
        event={{
          ...event,
          price: 'General · $20 · Supporter · $30',
          details,
        }}
        onClose={jest.fn()}
        catalogTags={[{ slug: 'nightlife', label: 'Nightlife' }]}
        cityLabel="Brooklyn"
        batchWeek="2026-W39"
        onSave={onSave}
        saving={false}
        mode="import"
        title="Review Luma / Partiful event"
        saveLabel="Stage event"
      />,
    );

    expect(screen.getByRole('region', { name: 'Ticket options' })).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('$20')).toBeInTheDocument();
    expect(screen.getByText('Supporter')).toBeInTheDocument();
    expect(screen.getByText('$30')).toBeInTheDocument();
    expect(screen.getByText('Sold out')).toBeInTheDocument();
    expect(screen.getByText('Luma')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stage event' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(catalogEditDraftToOverrides(onSave.mock.calls[0][0]).details).toEqual(details);
  });
});

describe('PivotCatalogEventEditModal source history mode', () => {
  it('keeps publication status in the batch queue while recording a structured image correction', async () => {
    const onSave = jest.fn().mockResolvedValue(true);
    render(<PivotCatalogEventEditModal open event={{ ...event, source: 'generic-site', entrypointId: 'job-1',
      scrapeEvidence: { imageCandidates: ['https://images.example/event.jpg', 'https://images.example/poster.jpg'] } }}
      catalogTags={[{ slug: 'nightlife', label: 'Nightlife' }]} batchWeek="2026-W39"
      onClose={jest.fn()} onSave={onSave} lockIngestStatus elevated />);
    expect(screen.getByLabelText(/^Ingest status/)).toBeDisabled();
    expect(screen.getByText(/Change publication status from the batch curation queue/)).toBeInTheDocument();
    expect(screen.getByText(/Improve future scrapes from these corrections/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /poster.jpg/i }));
    fireEvent.change(screen.getByLabelText('Image correction reason'), { target: { value: 'venue_logo' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][1].rememberForCalendar).toBe(true);
    expect(onSave.mock.calls[0][1].correctionReasons).toEqual({ image: 'venue_logo' });
    expect(onSave.mock.calls[0][0].imageUrl).toBe('https://images.example/poster.jpg');
  });
});
