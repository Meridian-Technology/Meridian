import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PivotLandingQrManager from './PivotLandingQrManager';

const mockUseFetch = jest.fn();
const mockAuthenticatedRequest = jest.fn();
const mockAddNotification = jest.fn();
const mockDownloadJustGoQr = jest.fn();

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

jest.mock('../../../components/JustGoQr/StyledJustGoQr', () => ({
  __esModule: true,
  default: ({ url, fgColor }) => (
    <div data-testid="justgo-qr-canvas">{`${url}|${fgColor}`}</div>
  ),
}));

jest.mock('../../../components/JustGoQr/justGoQrTheme', () => {
  const actual = jest.requireActual('../../../components/JustGoQr/justGoQrTheme');
  return {
    ...actual,
    downloadJustGoQr: (...args) => mockDownloadJustGoQr(...args),
  };
});

jest.mock('@iconify-icon/react', () => ({
  Icon: () => null,
}));

function qrItem(overrides = {}) {
  return {
    name: 'poster-night',
    tenantKey: 'nyc',
    description: 'Union Square posters',
    isActive: true,
    fgColor: '#1A1714',
    bgColor: '#FAF6EF',
    transparentBg: true,
    scans: 4,
    uniqueScans: 3,
    lastScannedAt: '2026-08-18T18:00:00.000Z',
    payloadUrl: 'https://justgo.lol/qr/poster-night',
    ...overrides,
  };
}

function qrsPayload(items = []) {
  return {
    success: true,
    data: { tenantKey: 'nyc', items },
  };
}

function stubQrs({ items = [], loading = false, error = null, refetch = jest.fn() } = {}) {
  mockUseFetch.mockImplementation((url) => {
    expect(String(url || '')).toContain('/admin/pivot/tenants/nyc/landing-qrs');
    return {
      data: qrsPayload(items),
      loading,
      error,
      refetch,
    };
  });
  return { refetch };
}

function renderManager(props = {}) {
  return render(<PivotLandingQrManager tenantKey="nyc" {...props} />);
}

describe('PivotLandingQrManager', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
    mockDownloadJustGoQr.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows an empty state when the city has no tracking QRs', () => {
    stubQrs({ items: [] });
    renderManager();
    expect(screen.getByRole('heading', { name: 'Tracking QRs' })).toBeInTheDocument();
    expect(screen.getByText('No tracking QRs yet.')).toBeInTheDocument();
  });

  it('creates a QR then lists the row', async () => {
    let items = [];
    const refetch = jest.fn();
    mockUseFetch.mockImplementation(() => ({
      data: qrsPayload(items),
      loading: false,
      error: null,
      refetch,
    }));
    mockAuthenticatedRequest.mockImplementation(async () => {
      const created = qrItem();
      items = [created];
      return { data: { success: true, data: created } };
    });

    const { rerender } = renderManager();
    fireEvent.click(screen.getByRole('button', { name: 'Create QR' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('e.g. poster-night'), {
      target: { value: 'poster-night' },
    });
    fireEvent.change(screen.getByPlaceholderText('Optional campaign notes'), {
      target: { value: 'Union Square posters' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        '/admin/pivot/tenants/nyc/landing-qrs',
        expect.objectContaining({
          method: 'POST',
          data: expect.objectContaining({
            name: 'poster-night',
            description: 'Union Square posters',
            fgColor: '#1A1714',
            transparentBg: true,
            dotType: 'extra-rounded',
            cornerType: 'extra-rounded',
          }),
        }),
      );
    });
    expect(refetch).toHaveBeenCalled();

    rerender(<PivotLandingQrManager tenantKey="nyc" />);
    expect(screen.getByText('poster-night')).toBeInTheDocument();
    expect(screen.getByText('→ https://justgo.lol/qr/poster-night')).toBeInTheDocument();
  });

  it('prompts for PNG or SVG in place, then downloads with Just Go ink', async () => {
    stubQrs({ items: [qrItem()] });
    renderManager();

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(screen.getByRole('group', { name: 'Download format' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'PNG' }));
    await waitFor(() => {
      expect(mockDownloadJustGoQr).toHaveBeenCalledWith(
        'https://justgo.lol/qr/poster-night',
        expect.objectContaining({
          format: 'png',
          fgColor: '#1A1714',
          filename: 'justgo-qr-poster-night.png',
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    fireEvent.click(screen.getByRole('button', { name: 'SVG' }));
    await waitFor(() => {
      expect(mockDownloadJustGoQr).toHaveBeenCalledWith(
        'https://justgo.lol/qr/poster-night',
        expect.objectContaining({
          format: 'svg',
          fgColor: '#1A1714',
          filename: 'justgo-qr-poster-night.svg',
        }),
      );
    });
  });

  it('copies the public hop URL', async () => {
    stubQrs({ items: [qrItem()] });
    renderManager();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'https://justgo.lol/qr/poster-night',
      );
    });
  });
});
