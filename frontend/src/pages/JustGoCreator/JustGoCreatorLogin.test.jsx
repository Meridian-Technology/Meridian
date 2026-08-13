import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import JustGoCreatorLogin, { safeReturnPath } from './JustGoCreatorLogin';
import justGoCreatorCopy from './justGoCreatorCopy';
import { JUSTGO_CREATOR_ROUTES } from './justGoCreatorRoutes';

const copy = justGoCreatorCopy.login;

const mockLogin = jest.fn();
let mockAuthState = { isAuthenticated: false, isAuthenticating: false };

jest.mock('../../hooks/useAuth', () => ({
  __esModule: true,
  default: () => ({ ...mockAuthState, login: mockLogin }),
}));

const mockGoogle = jest.fn();
jest.mock('@react-oauth/google', () => ({
  __esModule: true,
  useGoogleLogin: () => mockGoogle,
}));

jest.mock('../../config/tenantRedirect', () => ({
  __esModule: true,
  getCurrentTenantDisplayName: () => 'New York',
}));

/** Stands in for the console, so a successful sign-in has somewhere to land. */
function Landed() {
  return <p>console home</p>;
}

function renderLogin({ entry = JUSTGO_CREATOR_ROUTES.login, state } = {}) {
  return render(
    <MemoryRouter initialEntries={[state ? { pathname: entry, state } : entry]}>
      <Routes>
        <Route path={JUSTGO_CREATOR_ROUTES.login} element={<JustGoCreatorLogin />} />
        <Route path={JUSTGO_CREATOR_ROUTES.home} element={<Landed />} />
        <Route path="/justgo/creator/events/:eventId" element={<p>the listing</p>} />
        <Route path="/events-dashboard" element={<p>clubdash</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockAuthState = { isAuthenticated: false, isAuthenticating: false };
  mockLogin.mockReset();
  mockGoogle.mockReset();
  sessionStorage.clear();
});

describe('safeReturnPath', () => {
  it('keeps same-origin absolute paths', () => {
    expect(safeReturnPath('/justgo/creator/events/abc')).toBe('/justgo/creator/events/abc');
  });

  it.each([
    ['//evil.example/phish', 'protocol-relative'],
    ['https://evil.example', 'absolute url'],
    ['justgo/creator', 'relative'],
    ['', 'empty'],
    [null, 'missing'],
  ])('rejects %s (%s)', (candidate) => {
    expect(safeReturnPath(candidate)).toBeNull();
  });
});

describe('JustGoCreatorLogin', () => {
  it('speaks Just Go, not Meridian', () => {
    renderLogin();

    expect(screen.getByRole('heading', { name: 'sign in to new york' })).toBeInTheDocument();
    expect(screen.getByText(copy.inviteOnly)).toBeInTheDocument();
    expect(screen.queryByText(/Welcome Back/i)).not.toBeInTheDocument();
  });

  it('signs in and returns to the console', async () => {
    mockLogin.mockResolvedValue({ user: { email: 'host@example.com' } });
    renderLogin();

    fireEvent.change(screen.getByLabelText(copy.emailLabel), {
      target: { name: 'email', value: 'host@example.com' },
    });
    fireEvent.change(screen.getByLabelText(copy.passwordLabel), {
      target: { name: 'password', value: 'hunter2' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.submit }));

    expect(await screen.findByText('console home')).toBeInTheDocument();
    expect(mockLogin).toHaveBeenCalledWith({ email: 'host@example.com', password: 'hunter2' });
  });

  it('returns to the page the gate interrupted', async () => {
    mockLogin.mockResolvedValue({});
    renderLogin({ state: { from: { pathname: '/justgo/creator/events/evt-9' } } });

    fireEvent.change(screen.getByLabelText(copy.emailLabel), {
      target: { name: 'email', value: 'host@example.com' },
    });
    fireEvent.change(screen.getByLabelText(copy.passwordLabel), {
      target: { name: 'password', value: 'hunter2' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.submit }));

    expect(await screen.findByText('the listing')).toBeInTheDocument();
  });

  it('never falls through to ClubDash, which is the bug this page exists to fix', async () => {
    mockAuthState = { isAuthenticated: true, isAuthenticating: false };
    renderLogin();

    expect(await screen.findByText('console home')).toBeInTheDocument();
    expect(screen.queryByText('clubdash')).not.toBeInTheDocument();
  });

  // The login endpoint answers 500 for a wrong password, so any answered request is a rejection.
  it.each([
    [{ response: { status: 401 } }, 'errorInvalid'],
    [{ response: { status: 500 } }, 'errorInvalid'],
    [{ message: 'Network Error' }, 'errorGeneric'],
  ])('maps a failed sign-in to the right message', async (thrown, expected) => {
    mockLogin.mockRejectedValue(thrown);
    renderLogin();

    fireEvent.change(screen.getByLabelText(copy.emailLabel), {
      target: { name: 'email', value: 'host@example.com' },
    });
    fireEvent.change(screen.getByLabelText(copy.passwordLabel), {
      target: { name: 'password', value: 'nope' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.submit }));

    expect(await screen.findByRole('alert')).toHaveTextContent(copy[expected]);
  });

  it('re-enables the form after a rejected sign-in', async () => {
    mockLogin.mockRejectedValue({ response: { status: 500 } });
    renderLogin();

    fireEvent.change(screen.getByLabelText(copy.emailLabel), {
      target: { name: 'email', value: 'host@example.com' },
    });
    fireEvent.change(screen.getByLabelText(copy.passwordLabel), {
      target: { name: 'password', value: 'nope' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.submit }));

    expect(await screen.findByRole('alert')).toHaveTextContent(copy.errorInvalid);
    expect(screen.getByRole('button', { name: copy.submit })).toBeEnabled();
  });

  it('asks for both fields before calling the API', () => {
    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: copy.submit }));

    expect(screen.getByRole('alert')).toHaveTextContent(copy.errorEmpty);
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('hands admin MFA back to Meridian rather than half-implementing it', async () => {
    mockLogin.mockResolvedValue({ requiresMfa: true, methods: ['totp'] });
    renderLogin();

    fireEvent.change(screen.getByLabelText(copy.emailLabel), {
      target: { name: 'email', value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByLabelText(copy.passwordLabel), {
      target: { name: 'password', value: 'hunter2' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.submit }));

    // No route is registered for /login here, so the assertion is that we left this page.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: copy.submit })).not.toBeInTheDocument(),
    );
  });

  it('parks the return path where the OAuth round trip can find it', () => {
    renderLogin({ state: { from: { pathname: '/justgo/creator/events/evt-9' } } });

    fireEvent.click(screen.getByRole('button', { name: copy.continueGoogle }));

    expect(mockGoogle).toHaveBeenCalled();
    expect(sessionStorage.getItem('login_redirect')).toBe('/justgo/creator/events/evt-9');
  });

  it('toggles password visibility', () => {
    renderLogin();

    expect(screen.getByLabelText(copy.passwordLabel)).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: copy.showPassword }));
    expect(screen.getByLabelText(copy.passwordLabel)).toHaveAttribute('type', 'text');
  });
});
