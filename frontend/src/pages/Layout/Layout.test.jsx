import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from './Layout';

const mockIsJustGoHost = jest.fn(() => false);
const mockIsWww = jest.fn(() => true);

jest.mock('../../config/tenantRedirect', () => ({
  isWww: (...args) => mockIsWww(...args),
  isJustGoHost: (...args) => mockIsJustGoHost(...args),
  isJustGoWwwHost: () => false,
  justGoApexUrl: (path) => `https://justgo.lol${path || '/'}`,
  isPathAllowedOnWww: () => true,
  isPathAllowedOnJustGoHost: () => true,
  hasDevTenantOverride: () => false,
  getLastTenant: () => null,
  getTenantKeys: () => [],
  getTenantRedirectUrl: () => '',
}));

jest.mock('../../hooks/useAuth', () => ({
  __esModule: true,
  default: () => ({
    pendingOrgInvites: [],
    showOrgInviteModal: false,
    dismissOrgInviteModal: jest.fn(),
    setPendingOrgInvites: jest.fn(),
  }),
}));

jest.mock('../../NotificationContext', () => ({
  useNotification: () => ({ addNotification: jest.fn() }),
}));

jest.mock('../../components/Banner/Banner', () => function Banner() {
  return <div data-testid="campus-banner">banner</div>;
});

jest.mock('../../components/OrgInviteModal/OrgInviteModal', () => () => null);

jest.mock('../../utils/referrerContext', () => ({
  updateReferrerOnNavigation: jest.fn(),
}));

function renderLayout(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<p>index</p>} />
          <Route path="justgo" element={<p>justgo</p>} />
          <Route path="privacy-policy" element={<p>privacy</p>} />
          <Route path=":tenantKey" element={<p>city</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Layout banner on Just Go host', () => {
  beforeEach(() => {
    mockIsJustGoHost.mockReset();
    mockIsWww.mockReset();
    mockIsJustGoHost.mockReturnValue(false);
    mockIsWww.mockReturnValue(true);
    document.head.innerHTML =
      '<link rel="icon" href="/icon.svg" /><link rel="apple-touch-icon" href="/Logo.svg" />';
  });

  it('hides the campus banner on Just Go landing', () => {
    mockIsJustGoHost.mockReturnValue(true);
    mockIsWww.mockReturnValue(false);
    renderLayout('/');
    expect(screen.queryByTestId('campus-banner')).not.toBeInTheDocument();
    expect(screen.getByText('index')).toBeInTheDocument();
  });

  it('still shows the campus banner on campus www home', () => {
    mockIsJustGoHost.mockReturnValue(false);
    mockIsWww.mockReturnValue(true);
    renderLayout('/');
    expect(screen.getByTestId('campus-banner')).toBeInTheDocument();
  });

  it('hides the campus banner on /justgo for the meridian alias', () => {
    mockIsJustGoHost.mockReturnValue(false);
    mockIsWww.mockReturnValue(true);
    renderLayout('/justgo');
    expect(screen.queryByTestId('campus-banner')).not.toBeInTheDocument();
  });

  it('uses justgo-icon.svg as the tab icon on Just Go pages', () => {
    mockIsJustGoHost.mockReturnValue(false);
    mockIsWww.mockReturnValue(true);
    renderLayout('/justgo');
    expect(document.querySelector('link[rel="icon"]').getAttribute('href')).toContain(
      'justgo-icon.svg',
    );
  });

  it('keeps the campus tab icon off Just Go pages', () => {
    mockIsJustGoHost.mockReturnValue(false);
    mockIsWww.mockReturnValue(true);
    renderLayout('/');
    expect(document.querySelector('link[rel="icon"]').getAttribute('href')).toContain('icon.svg');
    expect(document.querySelector('link[rel="icon"]').getAttribute('href')).not.toContain(
      'justgo-icon.svg',
    );
  });
});
