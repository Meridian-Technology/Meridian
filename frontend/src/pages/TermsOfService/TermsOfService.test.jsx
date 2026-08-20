import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import TermsOfService from './TermsOfService';

const mockIsJustGoHost = jest.fn(() => false);

jest.mock('../../config/tenantRedirect', () => ({
  isJustGoHost: (...args) => mockIsJustGoHost(...args),
}));

jest.mock('../../components/Header/Header', () => ({
  __esModule: true,
  default: () => <header>campus-header</header>,
}));

function renderTerms(path = '/terms-of-service') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TermsOfService />
    </MemoryRouter>,
  );
}

describe('TermsOfService', () => {
  beforeEach(() => {
    mockIsJustGoHost.mockReset();
    mockIsJustGoHost.mockReturnValue(false);
  });

  it('keeps campus terms on meridian.study', () => {
    renderTerms();
    expect(screen.getByRole('banner')).toHaveTextContent('campus-header');
    expect(screen.getByText(/Meridian Platform/i)).toBeInTheDocument();
    expect(screen.getByText(/at least 13 years old/i)).toBeInTheDocument();
  });

  it('shows just go branded terms on justgo.lol', () => {
    mockIsJustGoHost.mockReturnValue(true);
    renderTerms('/terms-of-service');
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByText(/study rooms/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'terms' })).toBeInTheDocument();
    expect(screen.getByText(/at least 18 years old/i)).toBeInTheDocument();
    expect(screen.getByText(/does not process those payments/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'back to just go' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
