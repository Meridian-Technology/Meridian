import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import PrivacyPolicy from './PrivacyPolicy';

const mockIsJustGoHost = jest.fn(() => false);

jest.mock('../../config/tenantRedirect', () => ({
  isJustGoHost: (...args) => mockIsJustGoHost(...args),
}));

jest.mock('../../components/Header/Header', () => ({
  __esModule: true,
  default: () => <header>campus-header</header>,
}));

function renderPolicy(path = '/privacy-policy') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PrivacyPolicy />
    </MemoryRouter>,
  );
}

describe('PrivacyPolicy (Task 6.1)', () => {
  beforeEach(() => {
    mockIsJustGoHost.mockReset();
    mockIsJustGoHost.mockReturnValue(false);
  });

  it('documents Just Go waitlist email retention on the campus policy', () => {
    renderPolicy();
    expect(
      screen.getByText(/kept until a platform administrator deletes/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Just Go city waitlist/i)).toBeInTheDocument();
    expect(screen.getByRole('banner')).toHaveTextContent('campus-header');
    expect(screen.getByText(/Meridian Platform/i)).toBeInTheDocument();
  });

  it('shows just go branded copy on justgo.lol', () => {
    mockIsJustGoHost.mockReturnValue(true);
    renderPolicy('/privacy-policy');
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByText(/Meridian Platform/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Camera \(for QR/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'privacy' })).toBeInTheDocument();
    expect(screen.getByText(/hash them on the device/i)).toBeInTheDocument();
    expect(screen.getByText(/people 18 and older/i)).toBeInTheDocument();
    expect(screen.getByText(/sign in with apple/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'back to just go' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('shows just go copy on the campus /justgo/privacy-policy alias', () => {
    renderPolicy('/justgo/privacy-policy');
    expect(screen.getByRole('heading', { name: 'privacy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'back to just go' })).toHaveAttribute(
      'href',
      '/justgo',
    );
  });
});
