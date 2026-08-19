import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import JustGoLanding from './JustGoLanding';
import justGoLandingCopy, { JUSTGO_PLAY_STORE_URL } from './justGoLandingCopy';

const mockApi = jest.fn();
const mockScreen = jest.fn();

jest.mock('../../utils/postRequest', () => (...args) => mockApi(...args));
jest.mock('../../services/analytics/analytics', () => ({
  analytics: { screen: (...args) => mockScreen(...args) },
}));
jest.mock('./justGoLandingMotion', () => ({
  useJustGoLandingMotion: () => ({ slap: true }),
}));

const CITIES = [
  { tenantKey: 'brooklyn', cityDisplayName: 'Brooklyn' },
  { tenantKey: 'troy', cityDisplayName: 'Troy' },
];

const DROP_EVENTS = [
  {
    id: '1',
    name: 'friday night market',
    hostName: 'public records',
    startTime: '2026-08-14T23:00:00.000Z',
    location: 'brooklyn',
    tag: 'food',
    description: 'should never render',
    externalLink: 'https://partiful.com/e/secret',
  },
  {
    id: '2',
    name: 'saturday warehouse',
    hostName: 'nowadays',
    startTime: '2026-08-16T02:00:00.000Z',
    location: 'ridgewood',
    tag: 'live-music',
  },
  {
    id: '3',
    name: 'sunday matinee',
    hostName: 'film forum',
    startTime: '2026-08-16T18:00:00.000Z',
    location: 'village',
    tag: 'film',
  },
  {
    id: '4',
    name: 'monday film',
    hostName: 'metrograph',
    startTime: '2026-08-18T00:00:00.000Z',
    location: 'les',
    tag: 'film',
  },
  {
    id: '5',
    name: 'tuesday fifth card',
    hostName: 'leaked',
    startTime: '2026-08-19T00:00:00.000Z',
    location: 'nowhere',
  },
];

function mockMatchMedia(desktop) {
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches: Boolean(desktop && /min-width:\s*900px/.test(query)),
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

async function renderLanding({ desktop = true } = {}) {
  mockMatchMedia(desktop);
  const view = render(
    <MemoryRouter initialEntries={['/justgo']}>
      <Routes>
        <Route path="/justgo" element={<JustGoLanding />} />
        <Route path="/justgo/creator/login" element={<p>creator login</p>} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: /what are you doing this week/i });
  await screen.findByText(/live in brooklyn/i);
  return view;
}

beforeEach(() => {
  mockApi.mockReset();
  mockScreen.mockReset();
  window.localStorage.clear();
  mockApi.mockImplementation((url) => {
    if (url === '/pivot/cities') {
      return Promise.resolve({ success: true, data: { cities: CITIES } });
    }
    if (url === '/pivot/landing/drop') {
      return Promise.resolve({
        success: true,
        data: {
          tenantKey: 'brooklyn',
          cityDisplayName: 'Brooklyn',
          batchWeek: '2026-W33',
          events: DROP_EVENTS.slice(0, 4),
        },
      });
    }
    return Promise.resolve({ success: false });
  });
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('JustGoLanding', () => {
  it('speaks Just Go, not campus Meridian', async () => {
    await renderLanding();

    expect(
      screen.getByRole('heading', { name: /what are you doing this week/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(justGoLandingCopy.story[2])).toBeInTheDocument();
    expect(screen.queryByText(/Welcome Back/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Meridian Go/i)).not.toBeInTheDocument();
    expect(mockScreen).toHaveBeenCalledWith('Just Go Landing');
    expect(await screen.findByText(/live in brooklyn/i)).toBeInTheDocument();
    expect(mockApi).toHaveBeenCalledWith('/pivot/cities', null, { method: 'GET' });
    expect(mockApi).not.toHaveBeenCalledWith(
      '/pivot/landing/drop',
      null,
      expect.anything(),
    );
  });

  it('puts a next-drop countdown in the top bar', async () => {
    await renderLanding();

    const countdown = screen.getByRole('link', { name: /next drop/i });
    expect(countdown).toHaveAttribute('href', '#drop');
    expect(countdown).toHaveTextContent(/next drop/i);
    expect(countdown).toHaveTextContent(/in/i);
    expect(countdown).toHaveTextContent(/^\s*next drop\s*in\s*\d{2}d\d{2}h\d{2}m\d{2}s\s*$/i);
  });

  it('puts the week’s flyer wall on the desktop page', async () => {
    await renderLanding({ desktop: true });

    expect(screen.getByRole('heading', { name: justGoLandingCopy.flyersTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'night market' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'board game night' })).toBeInTheDocument();
    expect(screen.getByText(/fri night/i)).toBeInTheDocument();
  });

  it('keeps a host path into the creator console', async () => {
    await renderLanding();

    expect(
      screen.getByRole('link', { name: justGoLandingCopy.footerHostLink }),
    ).toHaveAttribute('href', '/justgo/creator/login');
    expect(screen.getByText(justGoLandingCopy.contactLead)).toBeInTheDocument();
    expect(screen.getByText(justGoLandingCopy.footerStamp)).toBeInTheDocument();
  });

  it('points android visitors at play', async () => {
    const original = window.navigator.userAgent;
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
    });

    await renderLanding();

    expect(screen.getByRole('link', { name: justGoLandingCopy.ctaAriaAndroid })).toHaveAttribute(
      'href',
      JUSTGO_PLAY_STORE_URL,
    );

    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: original,
    });
  });

  it('swipes a live four-card drop on mobile and ends on a download prompt', async () => {
    await renderLanding({ desktop: false });

    expect(await screen.findByRole('heading', { name: justGoLandingCopy.deckTitle })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'night market' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'friday night market' })).toBeInTheDocument();
    expect(screen.queryByText('should never render')).not.toBeInTheDocument();
    expect(screen.queryByText('https://partiful.com/e/secret')).not.toBeInTheDocument();
    expect(screen.queryByText('tuesday fifth card')).not.toBeInTheDocument();
    expect(mockApi).toHaveBeenCalledWith('/pivot/landing/drop', null, {
      method: 'GET',
      params: { tenantKey: 'brooklyn' },
    });

    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: justGoLandingCopy.deckPass }));
    }

    expect(
      await screen.findByRole('heading', { name: justGoLandingCopy.deckDownloadTitle }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: justGoLandingCopy.deckPass })).not.toBeInTheDocument();
    expect(screen.getByText(justGoLandingCopy.deckDownloadBody)).toBeInTheDocument();
  });

  it('refetches the drop when the city chip changes', async () => {
    await renderLanding({ desktop: false });
    await screen.findByRole('heading', { name: 'friday night market' });

    fireEvent.click(screen.getByRole('option', { name: 'troy' }));

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/pivot/landing/drop', null, {
        method: 'GET',
        params: { tenantKey: 'troy' },
      });
    });
    expect(window.localStorage.getItem('justgo.landing.city')).toBe('troy');
  });

  it('renders bundled copy when the landing copy API is down', async () => {
    mockApi.mockImplementation((url) => {
      if (url === '/pivot/landing/copy') {
        return Promise.reject(new Error('down'));
      }
      if (url === '/pivot/cities') {
        return Promise.resolve({ success: true, data: { cities: CITIES } });
      }
      if (url === '/pivot/landing/drop') {
        return Promise.resolve({
          success: true,
          data: {
            tenantKey: 'brooklyn',
            cityDisplayName: 'Brooklyn',
            batchWeek: '2026-W33',
            events: DROP_EVENTS.slice(0, 4),
          },
        });
      }
      return Promise.resolve({ success: false });
    });

    await renderLanding();
    expect(screen.getAllByText(justGoLandingCopy.cta).length).toBeGreaterThan(0);
    expect(screen.getByText(justGoLandingCopy.story[2])).toBeInTheDocument();
  });

  it('applies a platform overlay without blocking first paint', async () => {
    let resolveCopy;
    const copyPromise = new Promise((resolve) => {
      resolveCopy = resolve;
    });
    mockApi.mockImplementation((url) => {
      if (url === '/pivot/landing/copy') {
        return copyPromise;
      }
      if (url === '/pivot/cities') {
        return Promise.resolve({ success: true, data: { cities: CITIES } });
      }
      return Promise.resolve({ success: false });
    });

    mockMatchMedia(true);
    render(
      <MemoryRouter initialEntries={['/justgo']}>
        <Routes>
          <Route path="/justgo" element={<JustGoLanding />} />
          <Route path="/justgo/creator/login" element={<p>creator login</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: /what are you doing this week/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(justGoLandingCopy.cta).length).toBeGreaterThan(0);

    resolveCopy({
      success: true,
      data: {
        entries: { 'landing.cta': 'grab the app' },
        tokens: {},
      },
    });

    expect(await screen.findAllByText('grab the app')).not.toHaveLength(0);
  });
});
