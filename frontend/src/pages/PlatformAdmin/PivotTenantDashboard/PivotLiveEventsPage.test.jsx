import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PivotLiveEventsPage from './PivotLiveEventsPage';

const mockUseFetch = jest.fn();
const mockAuthenticatedRequest = jest.fn();
const mockAddNotification = jest.fn();
const mockRefetch = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
  authenticatedRequest: (...args) => mockAuthenticatedRequest(...args),
}));

jest.mock('../../../NotificationContext', () => ({
  useNotification: () => ({ addNotification: mockAddNotification }),
}));

const SAVED = {
  eventId: 'underground-6',
  title: 'underground pro-wrestling 6',
  matches: 1,
  hasPin: true,
  fans: 0,
  status: { label: 'not started', tone: 'muted' },
  definition: {
    eventId: 'underground-6',
    title: 'underground pro-wrestling 6',
    matches: [{ id: 'm1', title: 'rex vs. vega', sides: [{ id: 'm1-a', name: 'Rex' }, { id: 'm1-b', name: 'Vega' }] }],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseFetch.mockReturnValue({ data: { success: true, data: { events: [] } }, loading: false, refetch: mockRefetch });
});

function fill(label, value) {
  fireEvent.change(screen.getAllByLabelText(label)[0], { target: { value } });
}

describe('PivotLiveEventsPage', () => {
  it('creates an event from the form and then shows its fan link and QR', async () => {
    mockAuthenticatedRequest.mockResolvedValue({ data: { success: true, data: { event: SAVED } } });
    render(<PivotLiveEventsPage tenants={[{ tenantKey: 'ic' }, { tenantKey: 'sf' }]} />);
    expect(screen.getByText(/No live events yet/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New event' }));
    // Nothing is sent without an id and a PIN.
    fireEvent.click(screen.getByRole('button', { name: 'Create event' }));
    expect(await screen.findByText(/Give the event an id/)).toBeInTheDocument();
    expect(mockAuthenticatedRequest).not.toHaveBeenCalled();

    fill(/^Event id/, 'underground-6');
    fill(/^Spotter PIN/, '24a68');
    fill(/^Title/, 'underground pro-wrestling 6');
    fill(/^Name/, 'Rex');
    fireEvent.change(screen.getAllByLabelText(/^Name/)[1], { target: { value: 'Vega' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create event' }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledTimes(1));
    const [url, options] = mockAuthenticatedRequest.mock.calls[0];
    expect(url).toBe('/admin/pivot/live-events/underground-6');
    expect(options.method).toBe('PUT');
    // The PIN field keeps digits only.
    expect(options.data).toMatchObject({ pin: '2468', create: true, hours: { opensAt: null, closesAt: null } });
    expect(options.data.definition.title).toBe('underground pro-wrestling 6');
    expect(options.data.definition.matches[0].sides.map((side) => side.name)).toEqual(['Rex', 'Vega']);

    expect(await screen.findByText('https://justgo.lol/clip/ic?live=underground-6')).toBeInTheDocument();
    expect(screen.getByText(/\/pivot\/live\/underground-6\/spot$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows every reason the server refused a card', async () => {
    mockAuthenticatedRequest.mockResolvedValue({
      data: { success: false, message: 'The card has problems.', errors: ['title is required', 'matches[0]: needs 2 to 4 sides'] },
    });
    render(<PivotLiveEventsPage tenants={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'New event' }));
    fill(/^Event id/, 'night-2');
    fill(/^Spotter PIN/, '1234');
    fireEvent.click(screen.getByRole('button', { name: 'Create event' }));
    expect(await screen.findByText('title is required')).toBeInTheDocument();
    expect(screen.getByText('matches[0]: needs 2 to 4 sides')).toBeInTheDocument();
  });

  it('sends the hours with the card, and closes the night to phones on confirm', async () => {
    const open = { ...SAVED, open: true, hours: { opensAt: '2026-10-30T22:00:00.000Z', closesAt: '2026-10-31T05:00:00.000Z' } };
    mockUseFetch.mockReturnValue({ data: { success: true, data: { events: [open] } }, loading: false, refetch: mockRefetch });
    mockAuthenticatedRequest.mockResolvedValue({ data: { success: true, data: { event: open } } });
    render(<PivotLiveEventsPage tenants={[{ tenantKey: 'ic' }]} />);
    fireEvent.click(screen.getByText('underground pro-wrestling 6'));
    await screen.findByRole('button', { name: 'Close to phones now' });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledTimes(2));
    expect(mockAuthenticatedRequest.mock.calls[1][1].data.hours).toEqual(open.hours);

    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockAuthenticatedRequest.mockResolvedValue({ data: { success: true, data: { event: { ...open, open: false } } } });
    fireEvent.click(screen.getByRole('button', { name: 'Close to phones now' }));
    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledWith('/admin/pivot/live-events/underground-6/close', { method: 'POST' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close to phones now' })).toBeDisabled());
    confirm.mockRestore();
  });

  it('only resets once the event id is typed back', async () => {
    mockUseFetch.mockReturnValue({ data: { success: true, data: { events: [SAVED] } }, loading: false, refetch: mockRefetch });
    mockAuthenticatedRequest.mockResolvedValue({ data: { success: true, data: { event: SAVED } } });
    render(<PivotLiveEventsPage tenants={[{ tenantKey: 'ic' }]} />);
    fireEvent.click(screen.getByText('underground pro-wrestling 6'));
    const reset = await screen.findByRole('button', { name: 'Reset' });
    expect(reset).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Type underground-6'), { target: { value: 'underground-6' } });
    expect(reset).toBeEnabled();
    fireEvent.click(reset);
    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/pivot/live-events/underground-6/reset',
      { method: 'POST', data: { confirm: 'underground-6' } },
    ));
  });
});
