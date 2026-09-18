const mockAuthenticatedRequest = jest.fn();
const mockAddNotification = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  authenticatedRequest: (...args) => mockAuthenticatedRequest(...args),
}));
jest.mock('../../../NotificationContext', () => ({
  useNotification: () => ({ addNotification: mockAddNotification }),
}));

const React = require('react');
const { fireEvent, render, screen, waitFor } = require('@testing-library/react');
const PivotFleetMobileUpdatePanel = require('./PivotFleetMobileUpdatePanel').default;

const TENANTS = [
  {
    tenantKey: 'nyc',
    location: 'New York',
    tenantType: 'pivot',
    pivotMobileConfig: { minAppVersion: '1.0.0', forceUpdate: false },
  },
  {
    tenantKey: 'sf',
    location: 'San Francisco',
    tenantType: 'pivot',
    pivotMobileConfig: { minAppVersion: '1.0.0', forceUpdate: false },
  },
];

describe('PivotFleetMobileUpdatePanel', () => {
  const originalConfirm = window.confirm;

  beforeEach(() => {
    mockAuthenticatedRequest.mockResolvedValue({ data: { success: true } });
    window.confirm = jest.fn(() => true);
  });

  afterEach(() => {
    jest.clearAllMocks();
    window.confirm = originalConfirm;
  });

  it('saves the same mobile gate to every pivot city', async () => {
    const onSaved = jest.fn();
    render(
      <PivotFleetMobileUpdatePanel
        tenants={TENANTS}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('1.0.0'), {
      target: { value: '1.2.0' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /force update/i }));
    fireEvent.click(screen.getByRole('button', { name: /apply to 2 cities/i }));

    await waitFor(() => {
      expect(mockAuthenticatedRequest).toHaveBeenCalledTimes(2);
    });

    expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/platform/tenants/nyc',
      expect.objectContaining({
        method: 'PUT',
        data: {
          pivotMobileConfig: expect.objectContaining({
            minAppVersion: '1.2.0',
            forceUpdate: true,
          }),
        },
      }),
    );
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/platform/tenants/sf',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(onSaved).toHaveBeenCalled();
    expect(window.confirm).toHaveBeenCalled();
  });

  it('warns when API env overrides tenant values', () => {
    render(
      <PivotFleetMobileUpdatePanel
        tenants={TENANTS}
        envOverrides={{ minAppVersion: '9.0.0', forceUpdate: true }}
      />,
    );

    expect(screen.getByText(/API env overrides tenant values/i)).toBeInTheDocument();
    expect(screen.getByText(/minAppVersion=9.0.0/)).toBeInTheDocument();
  });
});
