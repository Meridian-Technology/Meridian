import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PivotTenantSourcesPanel from './PivotTenantSourcesPanel';

const mockAuthenticatedRequest = jest.fn();
const mockAddNotification = jest.fn();

// The sources panel's import graph includes presentation-only Iconify icons.
// Keep this unit test offline and focused on the policy controls rather than
// allowing Iconify's optional network loader to make a request in jsdom.
jest.mock('@iconify-icon/react', () => ({
  Icon: () => null,
}));

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: () => ({
    data: { success: true, data: { sources: [], plan: { flow: 'native-only' } } },
    loading: false,
    error: null,
    refetch: jest.fn(),
  }),
  authenticatedRequest: (...args) => mockAuthenticatedRequest(...args),
}));

jest.mock('../../../NotificationContext', () => ({
  useNotification: () => ({ addNotification: mockAddNotification }),
}));

jest.mock('./PivotComputeJobRunStatus', () => ({
  __esModule: true,
  default: () => null,
  useTenantComputeJob: () => ({ active: false, updateJob: jest.fn() }),
}));

jest.mock('../PivotLab/PivotTagMultiSelect', () => () => null);

describe('PivotTenantSourcesPanel compute-apply policy', () => {
  beforeEach(() => {
    mockAuthenticatedRequest.mockResolvedValue({
      data: { success: true, data: { policy: { trusted: true } } },
      error: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows the effective origins and guardrails', () => {
    render(
      <PivotTenantSourcesPanel
        tenantKey="city"
        computeApplyPolicy={{
          trusted: true,
          autoApplyOrigins: ['schedule'],
          maxNewSources: 4,
          maxEventCreates: 12,
        }}
      />,
    );

    expect(screen.getByLabelText('Trusted city')).toBeChecked();
    expect(screen.getByLabelText('Auto-apply refresh')).not.toBeChecked();
    expect(screen.getByLabelText('Auto-apply discovery')).not.toBeChecked();
    expect(screen.getByLabelText('Email admins on compute job results')).toBeChecked();
    expect(screen.getByText(/Effective origins: schedule/)).toBeInTheDocument();
    expect(screen.getByText(/Discovery guardrails: 4 · 12/)).toBeInTheDocument();
  });

  it('accepts the policy envelope returned by the admin config API', () => {
    render(
      <PivotTenantSourcesPanel
        tenantKey="city"
        computeApplyPolicy={{
          policy: {
            trusted: true,
            autoApplyRefresh: true,
            autoApplyOrigins: ['admin'],
          },
        }}
      />,
    );

    expect(screen.getByLabelText('Trusted city')).toBeChecked();
    expect(screen.getByLabelText('Auto-apply refresh')).toBeChecked();
    expect(screen.getByText(/Effective origins: admin/)).toBeInTheDocument();
  });

  it('persists a toggle through the compute-apply config endpoint', async () => {
    render(<PivotTenantSourcesPanel tenantKey="city key" />);

    fireEvent.click(screen.getByLabelText('Auto-apply refresh'));

    await waitFor(() => {
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        '/admin/pivot/tenants/city%20key/compute-apply-config',
        { method: 'PATCH', data: { autoApplyRefresh: true } },
      );
      expect(mockAddNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    });
  });

  it('persists the admin-email preference independently', async () => {
    render(<PivotTenantSourcesPanel tenantKey="city" />);

    fireEvent.click(screen.getByLabelText('Email admins on compute job results'));

    await waitFor(() => {
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        '/admin/pivot/tenants/city/compute-apply-config',
        { method: 'PATCH', data: { notifyAdminsEmail: false } },
      );
      expect(mockAddNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    });
  });

  it('reconciles the optimistic toggle with the policy returned by the API', async () => {
    mockAuthenticatedRequest.mockResolvedValueOnce({
      data: {
        success: true,
        data: { policy: { trusted: true, autoApplyRefresh: false } },
      },
      error: null,
    });
    render(<PivotTenantSourcesPanel tenantKey="city" />);

    fireEvent.click(screen.getByLabelText('Auto-apply refresh'));

    await waitFor(() => {
      expect(screen.getByLabelText('Trusted city')).toBeChecked();
      expect(screen.getByLabelText('Auto-apply refresh')).not.toBeChecked();
    });
  });

  it('restores the toggle when saving the policy throws', async () => {
    mockAuthenticatedRequest.mockRejectedValueOnce(new Error('Network unavailable'));
    render(<PivotTenantSourcesPanel tenantKey="city" />);

    const toggle = screen.getByLabelText('Auto-apply discovery');
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();

    await waitFor(() => {
      expect(toggle).not.toBeChecked();
      expect(mockAddNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    });
  });
});
