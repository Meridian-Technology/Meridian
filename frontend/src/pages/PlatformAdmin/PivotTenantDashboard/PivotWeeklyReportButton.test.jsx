import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PivotWeeklyReportButton from './PivotWeeklyReportButton';

const mockUseFetch = jest.fn();
const mockAuthenticatedRequest = jest.fn();
const mockAddNotification = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
  authenticatedRequest: (...args) => mockAuthenticatedRequest(...args),
}));

jest.mock('../../../NotificationContext', () => ({
  useNotification: () => ({ addNotification: mockAddNotification }),
}));

jest.mock('../../../components/Popup/Popup', () => ({
  __esModule: true,
  default: ({ isOpen, children }) => (isOpen ? <div role="dialog">{children}</div> : null),
}));

const PREVIEW = {
  success: true,
  data: {
    subject: 'Just Go weekly report · Sep 24 – Sep 30',
    recipients: ['a@meridian.study', 'b@meridian.study'],
    sent: false,
    html: '<p>report</p>',
  },
};

describe('PivotWeeklyReportButton', () => {
  const originalConfirm = window.confirm;

  beforeEach(() => {
    mockUseFetch.mockReset();
    mockAuthenticatedRequest.mockReset();
    mockAddNotification.mockReset();
    mockUseFetch.mockImplementation((url) => ({
      data: url ? PREVIEW : null,
      loading: false,
      error: null,
    }));
  });

  afterEach(() => {
    window.confirm = originalConfirm;
  });

  it('loads the preview only when opened', () => {
    render(<PivotWeeklyReportButton />);
    expect(mockUseFetch).toHaveBeenLastCalledWith(null, expect.any(Object));

    fireEvent.click(screen.getByRole('button', { name: 'Weekly report' }));

    expect(mockUseFetch).toHaveBeenLastCalledWith('/admin/pivot/reports/weekly/preview', expect.any(Object));
    expect(screen.getByText('Just Go weekly report · Sep 24 – Sep 30')).toBeInTheDocument();
    expect(screen.getByText(/To 2 platform admins: a@meridian.study, b@meridian.study/)).toBeInTheDocument();
    expect(screen.getByTitle('Weekly report preview')).toHaveAttribute('srcdoc', '<p>report</p>');
  });

  it('sends a test to the signed-in admin without confirming', async () => {
    mockAuthenticatedRequest.mockResolvedValue({
      data: { success: true, data: { sent: true, recipients: ['me@meridian.study'] } },
    });
    window.confirm = jest.fn();
    render(<PivotWeeklyReportButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Weekly report' }));

    fireEvent.click(screen.getByRole('button', { name: 'Send test to me' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Test sent to you.');
    expect(window.confirm).not.toHaveBeenCalled();
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/pivot/reports/weekly/send',
      expect.objectContaining({ method: 'POST', data: { audience: 'me' } }),
    );
  });

  it('confirms before sending to every admin', async () => {
    window.confirm = jest.fn(() => false);
    render(<PivotWeeklyReportButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Weekly report' }));

    fireEvent.click(screen.getByRole('button', { name: 'Send to 2 admins' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('2 platform admins'));
    expect(mockAuthenticatedRequest).not.toHaveBeenCalled();

    window.confirm = jest.fn(() => true);
    mockAuthenticatedRequest.mockResolvedValue({
      data: { success: true, data: { sent: true, recipients: PREVIEW.data.recipients } },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send to 2 admins' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Sent to 2 platform admins.');
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/pivot/reports/weekly/send',
      expect.objectContaining({ data: { audience: 'admins' } }),
    );
  });

  it('shows why a send failed', async () => {
    mockAuthenticatedRequest.mockResolvedValue({
      data: { success: false, message: 'Email is not configured (RESEND_API_KEY).' },
    });
    render(<PivotWeeklyReportButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Weekly report' }));

    fireEvent.click(screen.getByRole('button', { name: 'Send test to me' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email is not configured');
  });
});
