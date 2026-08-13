import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import JustGoCreatorEventWorkspace from '../JustGoCreatorEventWorkspace';
import justGoCreatorCopy from '../justGoCreatorCopy';
import { DEMO_PRIMARY_EVENT_ID } from './justGoCreatorDemoData';

/**
 * End-to-end wiring for demo mode: the real `useFetch` runs, so this also proves the demo path
 * issues no request and therefore needs neither a creator grant nor a seeded database.
 */

// A factory rather than automock: axios v1 ships ESM that this jest transform cannot parse.
jest.mock('axios', () => {
  const mockAxios = jest.fn();
  mockAxios.isCancel = jest.fn();
  mockAxios.post = jest.fn();
  return { __esModule: true, default: mockAxios };
});

jest.mock('../../../hooks/useAuth', () => ({
  __esModule: true,
  default: () => ({ user: { email: 'host@example.com' } }),
}));

jest.mock('qrcode.react', () => ({
  QRCodeCanvas: ({ value }) => <div data-testid="qr" data-value={value} />,
}));

// Stubbed for the same reason as the workspace suite: ImageUpload pulls in an ESM icon build this
// transform cannot parse, and the form has its own coverage.
jest.mock('../JustGoCreatorListingForm', () => ({
  __esModule: true,
  default: () => <div data-testid="listing-form" />,
}));

const copy = justGoCreatorCopy.workspace;

function renderAt(eventId) {
  return render(
    <MemoryRouter initialEntries={[`/justgo/creator/events/${eventId}`]}>
      <Routes>
        <Route path="/justgo/creator/events/:eventId" element={<JustGoCreatorEventWorkspace />} />
      </Routes>
    </MemoryRouter>,
  );
}

// This project's jest config resets mock implementations between tests, so re-arm them here. The
// request never settles, which keeps the non-demo case from updating state after the assertion.
beforeEach(() => {
  axios.mockImplementation(() => new Promise(() => {}));
  axios.isCancel.mockReturnValue(false);
});

describe('demo mode wiring', () => {
  it('renders a populated workspace without touching the network', () => {
    renderAt(DEMO_PRIMARY_EVENT_ID);

    expect(axios).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole('banner')).getByText(/Sunset Rooftop Cinema/),
    ).toBeInTheDocument();
  });

  it('exposes every tab, since the demo listing is mid-planning', () => {
    renderAt(DEMO_PRIMARY_EVENT_ID);

    const nav = within(screen.getByRole('navigation', { name: copy.navLabel }));
    expect(nav.getAllByRole('button')).toHaveLength(6);
  });

  it('leaves non-demo ids on the API path', () => {
    renderAt('66b0f1f2c9a1b2c3d4e5f6a7');

    expect(axios).toHaveBeenCalled();
  });
});
