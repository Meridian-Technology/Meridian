import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PivotNotificationOneTimeSend from './PivotNotificationOneTimeSend';

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

describe('PivotNotificationOneTimeSend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFetch.mockReturnValue({
      data: {
        success: true,
        data: {
          handlerKey: 'scheduled_push',
          attributes: [{ key: 'hasCrew', label: 'Has a crew', type: 'boolean', operators: ['eq'] }],
          defaultRules: [],
        },
      },
      loading: false,
      error: null,
    });
  });

  it('requires a message and a city before review', () => {
    render(<PivotNotificationOneTimeSend tenants={tenants} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review recipients' }));
    expect(screen.getByText('Write a message')).toBeInTheDocument();
    expect(screen.getByText('Pick at least one city')).toBeInTheDocument();
    expect(mockAuthenticatedRequest).not.toHaveBeenCalled();
  });

  it('composes, reviews every recipient, confirms, and can go back to edit', async () => {
    const onSent = jest.fn();
    mockAuthenticatedRequest.mockImplementation(async (url, options) => {
      if (url.endsWith('/one-time/preview')) {
        return {
          data: {
            success: true,
            data: {
              tenantKey: options.data.tenantKey,
              count: 1,
              overflow: 0,
              people: [{ userId: 'u1', name: 'Ari' }],
              fingerprint: `fp-${options.data.tenantKey}`,
              quietHours: { active: false },
            },
          },
        };
      }
      if (url.endsWith('/one-time')) {
        expect(options.data).toEqual({
          label: 'Rain plan',
          title: null,
          body: 'Indoor picks are up',
          rules: [],
          sendAt: null,
          cities: [{ tenantKey: 'nyc', fingerprint: 'fp-nyc' }],
          ignoreQuietHours: false,
        });
        return {
          data: {
            success: true,
            data: { oneTimeId: 'ot1', runs: [{ tenantKey: 'nyc', created: true, runId: 'r1' }] },
          },
        };
      }
      return { data: null };
    });

    render(<PivotNotificationOneTimeSend tenants={tenants} onClose={jest.fn()} onSent={onSent} />);

    fireEvent.change(screen.getByLabelText('Send name'), { target: { value: 'Rain plan' } });
    fireEvent.change(screen.getByLabelText('Push message'), { target: { value: 'Indoor picks are up' } });
    fireEvent.click(screen.getByLabelText('Send to New York · nyc'));
    expect(screen.getByText('No conditions. Sends to everyone in those cities with push on.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review recipients' }));

    expect(await screen.findByText('Ari')).toBeInTheDocument();
    expect(screen.getByText('Indoor picks are up')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Push message')).toHaveValue('Indoor picks are up');
    fireEvent.click(screen.getByRole('button', { name: 'Review recipients' }));
    expect(await screen.findByText('Ari')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue with 1 person' }));
    fireEvent.click(screen.getByLabelText('I reviewed every recipient'));
    fireEvent.click(screen.getByRole('button', { name: 'Send to 1 person' }));

    expect(await screen.findByText('Queued to send')).toBeInTheDocument();
    expect(onSent).toHaveBeenCalled();
  });

  it('schedules for later with the send time in the review', async () => {
    mockAuthenticatedRequest.mockResolvedValue({
      data: {
        success: true,
        data: {
          tenantKey: 'nyc',
          count: 1,
          overflow: 0,
          people: [{ userId: 'u1', name: 'Ari' }],
          fingerprint: 'fp',
          quietHours: { active: false },
        },
      },
    });

    render(<PivotNotificationOneTimeSend tenants={tenants} tenantKey="nyc" onClose={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Push message'), { target: { value: 'Tonight' } });
    fireEvent.click(screen.getByLabelText('Send later'));
    fireEvent.change(screen.getByLabelText('Send at'), { target: { value: '2099-06-05T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review recipients' }));

    expect(await screen.findByText('Ari')).toBeInTheDocument();
    expect(mockAuthenticatedRequest.mock.calls[0][1].data.sendAt).toBe(new Date('2099-06-05T12:00').toISOString());
    fireEvent.click(screen.getByRole('button', { name: 'Continue with 1 person' }));
    expect(screen.getByRole('button', { name: 'Schedule for 1 person' })).toBeInTheDocument();
  });
});
