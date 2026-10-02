import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PivotNotificationSendNow from './PivotNotificationSendNow';

const mockUseFetch = jest.fn();
const mockAuthenticatedRequest = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
  authenticatedRequest: (...args) => mockAuthenticatedRequest(...args),
}));

jest.mock('../../../components/PivotOps', () => ({
  PivotOpsStatus: ({ children }) => <span>{children}</span>,
}));

const tenants = [
  { tenantKey: 'nyc', location: 'New York' },
  { tenantKey: 'sf', location: 'San Francisco' },
];

const definition = {
  id: 'def-1',
  definitionKey: 'friday_lunch',
  handlerKey: 'scheduled_push',
  tenantKey: null,
  enabled: false,
  copyBodyFallback: 'Plans for tonight?',
};

function preview(tenantKey, people, fingerprint, quietHours = { active: false }) {
  return {
    success: true,
    data: { tenantKey, count: people.length, overflow: 0, people, fingerprint, quietHours },
  };
}

describe('PivotNotificationSendNow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFetch.mockReturnValue({
      data: { success: true, data: [{ handlerKey: 'scheduled_push', scope: 'city', channel: 'push' }] },
      loading: false,
      error: null,
    });
  });

  it('walks through cities, every recipient, and a confirmation before sending', async () => {
    const onSent = jest.fn();
    mockAuthenticatedRequest.mockImplementation(async (url, options) => {
      if (url.includes('/eligibility')) {
        return {
          data: preview(
            'nyc',
            [{ userId: 'u1', name: 'Ari', username: 'ari' }, { userId: 'u2', name: 'Bo', username: 'bo' }],
            'fp-nyc',
            { active: true, timezone: 'America/New_York', endsAt: '2026-06-05T12:00:00.000Z' },
          ),
        };
      }
      if (url.includes('/send-now')) {
        expect(options.data).toEqual({
          cities: [{ tenantKey: 'nyc', fingerprint: 'fp-nyc' }],
          ignoreQuietHours: true,
        });
        return { data: { success: true, data: { runs: [{ tenantKey: 'nyc', created: true, runId: 'r1' }] } } };
      }
      return { data: null };
    });

    render(
      <PivotNotificationSendNow definition={definition} tenants={tenants} onClose={jest.fn()} onSent={onSent} />,
    );

    expect(screen.getByText('Where should it go?')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Send to New York · nyc'));
    fireEvent.click(screen.getByRole('button', { name: 'Review recipients (1 city)' }));

    expect(await screen.findByText('Review who gets it')).toBeInTheDocument();
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/meridian/jobs/notifications/eligibility',
      { params: { handlerKey: 'scheduled_push', definitionKey: 'friday_lunch', tenantKey: 'nyc' } },
    );
    expect(screen.getByText('Plans for tonight?')).toBeInTheDocument();
    expect(screen.getByText("This schedule is paused. Sending now doesn't turn it on.")).toBeInTheDocument();
    expect(screen.getByText('Ari')).toBeInTheDocument();
    expect(screen.getByText('Bo')).toBeInTheDocument();
    expect(screen.getByText(/Quiet hours until/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Find a recipient'), { target: { value: 'bo' } });
    expect(screen.queryByText('Ari')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Send during quiet hours'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue with 2 people' }));

    const sendButton = screen.getByRole('button', { name: 'Send to 2 people' });
    expect(sendButton).toBeDisabled();
    fireEvent.click(screen.getByLabelText('I reviewed every recipient'));
    fireEvent.click(sendButton);

    expect(await screen.findByText('Queued to send')).toBeInTheDocument();
    expect(onSent).toHaveBeenCalledWith([{ tenantKey: 'nyc', created: true, runId: 'r1' }]);
  });

  it('sends the sender back to review when the list changed', async () => {
    mockAuthenticatedRequest.mockImplementation(async (url) => {
      if (url.includes('/eligibility')) {
        return { data: preview('nyc', [{ userId: 'u1', name: 'Ari' }], 'fp-old') };
      }
      return {
        error: 'changed',
        errorCode: 'RECIPIENTS_CHANGED',
        errorData: {
          details: {
            cities: [{
              tenantKey: 'nyc',
              count: 2,
              overflow: 0,
              fingerprint: 'fp-new',
              people: [{ userId: 'u1', name: 'Ari' }, { userId: 'u3', name: 'Cy' }],
            }],
          },
        },
      };
    });

    render(
      <PivotNotificationSendNow
        definition={{ ...definition, tenantKey: 'nyc', enabled: true }}
        tenants={tenants}
        onClose={jest.fn()}
      />,
    );

    expect(await screen.findByText('Ari')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with 1 person' }));
    fireEvent.click(screen.getByLabelText('I reviewed every recipient'));
    fireEvent.click(screen.getByRole('button', { name: 'Send to 1 person' }));

    await waitFor(() => {
      expect(screen.getByText('The list changed in New York · nyc. Review it again before sending.')).toBeInTheDocument();
    });
    expect(screen.getByText('Cy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with 2 people' })).toBeInTheDocument();
  });
});
