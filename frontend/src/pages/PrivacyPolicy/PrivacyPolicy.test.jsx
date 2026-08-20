import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import PrivacyPolicy from './PrivacyPolicy';

const mockNavigate = jest.fn();
const mockIsJustGoHost = jest.fn(() => false);

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

jest.mock('../../config/tenantRedirect', () => ({
  isJustGoHost: (...args) => mockIsJustGoHost(...args),
}));

jest.mock('../../components/Header/Header', () => ({
  __esModule: true,
  default: () => <header>campus-header</header>,
}));

function renderPolicy() {
  return render(
    <MemoryRouter>
      <PrivacyPolicy />
    </MemoryRouter>,
  );
}

describe('PrivacyPolicy (Task 6.1)', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockIsJustGoHost.mockReset();
    mockIsJustGoHost.mockReturnValue(false);
  });

  it('documents Just Go waitlist phone retention', () => {
    renderPolicy();
    expect(
      screen.getByText(/kept until a platform administrator deletes/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Just Go city waitlist/i)).toBeInTheDocument();
    expect(screen.getByRole('banner')).toHaveTextContent('campus-header');
  });

  it('skips campus header on justgo.lol and backs to the landing', () => {
    mockIsJustGoHost.mockReturnValue(true);
    renderPolicy();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
