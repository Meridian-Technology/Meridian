import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import InviteLanding from './InviteLanding';

const mockApi = jest.fn();

jest.mock('../../utils/postRequest', () => (...args) => mockApi(...args));
jest.mock('@iconify-icon/react/dist/iconify.mjs', () => ({ Icon: () => null }));

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invite" element={<InviteLanding />} />
        <Route path="/invite/:code" element={<InviteLanding />} />
        <Route path="/pivot/crew/join" element={<InviteLanding />} />
      </Routes>
    </MemoryRouter>,
  );
}

function openLink() {
  return screen.getByRole('link', { name: 'open in just go' });
}

describe('InviteLanding', () => {
  beforeEach(() => {
    mockApi.mockReset();
    window.matchMedia = window.matchMedia || (() => ({ matches: false }));
  });

  it('shows who invited you on a personal link and deep links back into the app', async () => {
    mockApi.mockResolvedValue({
      success: true,
      data: {
        valid: true,
        code: 'k7m2qx9a',
        inviter: { name: 'Maya', picture: null },
        city: { tenantKey: 'boston', subdomain: 'boston', cityDisplayName: 'Boston' },
      },
    });

    renderAt('/invite/K7M2QX9A');

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Maya invited you to just go in boston',
    );
    expect(mockApi).toHaveBeenCalledWith('/pivot/invites/k7m2qx9a/preview', null, { method: 'GET' });
    expect(openLink()).toHaveAttribute('href', 'justgo://invite/k7m2qx9a');
    expect(screen.getByLabelText('Download on the App Store')).toBeInTheDocument();
  });

  it('still offers the download when the link is unknown', async () => {
    mockApi.mockResolvedValue({ success: true, data: { valid: false } });

    renderAt('/invite/zzzzzzzz');

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'what are you doing this week?',
    );
    expect(screen.queryByText(/didn't work/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Download on the App Store')).toBeInTheDocument();
  });

  it('treats a maxed legacy cohort code as a normal download, keeping the code on the deep link', async () => {
    mockApi.mockResolvedValue({ success: true, data: { valid: false, cityDisplayName: null } });

    renderAt('/invite?code=nyc-pilot-a&ref=user-1');

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'what are you doing this week?',
    );
    expect(openLink()).toHaveAttribute('href', 'justgo://invite?code=NYC-PILOT-A&ref=user-1');
  });

  it('gives crew links a page instead of a 404', async () => {
    renderAt('/pivot/crew/join?token=abc123');

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      "join a friend's circle on just go",
    );
    expect(mockApi).not.toHaveBeenCalled();
    expect(openLink()).toHaveAttribute('href', 'justgo://pivot/crew/join?token=abc123');
  });
});
