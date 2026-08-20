import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import JustGoQrHop from './JustGoQrHop';
import justGoLandingCopy from './justGoLandingCopy';
import { JUSTGO_LANDING_QR_SCAN_PATH, JUSTGO_LANDING_VISITOR_KEY } from './justGoLandingTracking';

const mockApi = jest.fn();
const mockIsJustGoHost = jest.fn(() => true);

jest.mock('../../utils/postRequest', () => (...args) => mockApi(...args));
jest.mock('../../services/analytics/analytics', () => ({
  analytics: {
    screen: jest.fn(),
    track: jest.fn(),
  },
}));
jest.mock('../../config/tenantRedirect', () => {
  const actual = jest.requireActual('../../config/tenantRedirect');
  return {
    ...actual,
    isJustGoHost: (...args) => mockIsJustGoHost(...args),
  };
});

function renderHop(path = '/qr/poster-a') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/qr/:name" element={<JustGoQrHop />} />
        <Route path="/justgo/qr/:name" element={<JustGoQrHop />} />
        <Route path="/:tenantKey" element={<div data-testid="city-landing" />} />
        <Route path="/justgo/:tenantKey" element={<div data-testid="alias-landing" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('JustGoQrHop (Task 5.2)', () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockIsJustGoHost.mockReset();
    mockIsJustGoHost.mockReturnValue(true);
    window.localStorage.clear();
  });

  it('redirects an active code to the city landing with src=qr', async () => {
    mockApi.mockResolvedValue({
      success: true,
      data: {
        name: 'poster-a',
        tenantKey: 'troy',
        redirectUrl: 'https://justgo.lol/troy?src=qr&qr=poster-a',
        path: '/troy',
      },
    });

    renderHop('/qr/poster-a?utm=ig');

    await waitFor(() => {
      expect(screen.getByTestId('city-landing')).toBeInTheDocument();
    });
    expect(screen.queryByText(justGoLandingCopy.qrMissingTitle)).not.toBeInTheDocument();
    expect(mockApi).toHaveBeenCalledWith(
      JUSTGO_LANDING_QR_SCAN_PATH,
      expect.objectContaining({
        name: 'poster-a',
        unique: true,
        visitorId: expect.any(String),
      }),
    );
    expect(window.localStorage.getItem(JUSTGO_LANDING_VISITOR_KEY)).toBeTruthy();
  });

  it('shows a Just Go error and does not redirect when the code is inactive', async () => {
    mockApi.mockResolvedValue({
      error: 'QR code is inactive.',
      code: 400,
      errorCode: 'QR_INACTIVE',
    });

    renderHop();

    expect(screen.getByTestId('justgo-qr-hop')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(justGoLandingCopy.qrMissingTitle)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('city-landing')).not.toBeInTheDocument();
  });

  it('shows a Just Go error when the code is missing', async () => {
    mockApi.mockResolvedValue({
      error: 'QR code not found.',
      code: 404,
      errorCode: 'QR_NOT_FOUND',
    });

    renderHop('/qr/missing');

    await waitFor(() => {
      expect(screen.getByText(justGoLandingCopy.qrMissingTitle)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('city-landing')).not.toBeInTheDocument();
  });
});
