import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import JustGoLanding from './JustGoLanding';
import JustGoLandingWaitlist from './JustGoLandingWaitlist';
import JustGoQrHop from './JustGoQrHop';
import { JustGoApexCityLanding } from './justGoHostRoutes';
import justGoLandingCopy, {
  JUSTGO_IOS_STORE_URL,
  justGoPublicLandingUrl,
  justGoPublicUrl,
} from './justGoLandingCopy';

const mockApi = jest.fn();
const mockScreen = jest.fn();
const mockTrack = jest.fn();
const mockIsJustGoHost = jest.fn(() => false);

jest.mock('../../utils/postRequest', () => (...args) => mockApi(...args));
jest.mock('../../services/analytics/analytics', () => ({
  analytics: {
    screen: (...args) => mockScreen(...args),
    track: (...args) => mockTrack(...args),
  },
}));
jest.mock('./justGoLandingMotion', () => ({
  useJustGoLandingMotion: () => ({ slap: true }),
}));
jest.mock('../../config/tenantRedirect', () => {
  const actual = jest.requireActual('../../config/tenantRedirect');
  return {
    ...actual,
    isJustGoHost: (...args) => mockIsJustGoHost(...args),
  };
});
jest.mock('@iconify-icon/react/dist/iconify.mjs', () => ({
  Icon: () => null,
}));

const CITIES = [
  { tenantKey: 'brooklyn', cityDisplayName: 'Brooklyn', landingMode: 'launched' },
  { tenantKey: 'troy', cityDisplayName: 'Troy', landingMode: 'waitlist' },
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

function landingRoutes() {
  const justGoHost = mockIsJustGoHost();
  return (
    <Routes>
      <Route path="/justgo/:tenantKey" element={<JustGoLanding />} />
      <Route path="/justgo" element={<JustGoLanding />} />
      <Route path="/justgo/creator/login" element={<p>creator login</p>} />
      <Route path="/justgo/creator" element={<p>creator home</p>} />
      {justGoHost ? (
        <>
          <Route path="/" element={<JustGoLanding />} />
          <Route path="/qr/:name" element={<JustGoQrHop />} />
          <Route path="/justgo/qr/:name" element={<JustGoQrHop />} />
          <Route path="/:tenantKey" element={<JustGoApexCityLanding />} />
        </>
      ) : (
        <>
          <Route path="/" element={<p>campus landing</p>} />
          <Route path="/qr/:id" element={<p>campus qr</p>} />
          <Route path="/justgo/qr/:name" element={<JustGoQrHop />} />
        </>
      )}
    </Routes>
  );
}

async function renderLanding({ desktop = true, path = '/justgo', proof = /live in brooklyn/i } = {}) {
  mockMatchMedia(desktop);
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      {landingRoutes()}
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: /what are you doing this week/i });
  const isGeneric = path === '/justgo' || path === '/';
  if (isGeneric && proof) {
    await screen.findByText(proof);
  }
  if (isGeneric) {
    await waitFor(() => {
      const stage = document.querySelector('.justgo-landing__hero-stage');
      expect(stage?.querySelector('a')).toBeTruthy();
    });
  }
  return view;
}

async function revealWaitlistForm() {
  const stage = document.querySelector('.justgo-landing__hero-stage');
  const cta = await within(stage).findByRole('link', { name: justGoLandingCopy.waitlistCta });
  fireEvent.click(cta);
  return screen.findByLabelText(justGoLandingCopy.waitlistEmailLabel);
}

beforeEach(() => {
  mockApi.mockReset();
  mockScreen.mockReset();
  mockTrack.mockReset();
  mockIsJustGoHost.mockReset();
  mockIsJustGoHost.mockReturnValue(false);
  window.localStorage.clear();
  window.sessionStorage.clear();
  if (window.location.hash) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
  if (Object.prototype.hasOwnProperty.call(navigator, 'share')) {
    delete navigator.share;
  }
  mockApi.mockImplementation((url) => {
    if (url === '/pivot/landing/config') {
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
    if (url === '/pivot/landing/event') {
      return Promise.resolve({ success: true });
    }
    if (url === '/pivot/landing/waitlist') {
      return Promise.resolve({
        success: true,
        data: {
          shareUrl: 'https://justgo.lol/troy?ref=abc12',
          friendsJoined: 0,
          tenantKey: 'troy',
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
    expect(
      screen.getByRole('heading', { name: justGoLandingCopy.storyTitle }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('img', { name: 'Download on the App Store' }),
    ).toBeInTheDocument();
    expect(screen.getByText(justGoLandingCopy.story[2])).toBeInTheDocument();
    expect(screen.queryByText(/why just go/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Welcome Back/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Meridian Go/i)).not.toBeInTheDocument();
    expect(mockScreen).toHaveBeenCalledWith('Just Go Landing');
    expect(await screen.findByText(/live in brooklyn/i)).toBeInTheDocument();
    expect(mockApi).toHaveBeenCalledWith('/pivot/landing/config', null, { method: 'GET' });
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

  it('keeps the creator footer relative on a Just Go host', async () => {
    mockIsJustGoHost.mockReturnValue(true);
    await renderLanding({ path: '/' });

    expect(
      screen.getByRole('link', { name: justGoLandingCopy.footerHostLink }),
    ).toHaveAttribute('href', '/justgo/creator/login');
  });

  it('points canonical at the public landing URL', async () => {
    mockIsJustGoHost.mockReturnValue(true);
    await renderLanding({ path: '/troy' });

    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      justGoPublicLandingUrl('troy'),
    );
    expect(document.querySelector('meta[name="robots"][data-justgo-robots]')).toBeNull();
  });

  it('noindexes the meridian.study/justgo alias', async () => {
    mockIsJustGoHost.mockReturnValue(false);
    await renderLanding({ path: '/justgo' });

    expect(document.querySelector('meta[name="robots"][data-justgo-robots]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
  });

  it('keeps the app store badge on android visitors', async () => {
    const original = window.navigator.userAgent;
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
    });

    await renderLanding();

    const badge = await screen.findByRole('img', { name: 'Download on the App Store' });
    expect(badge.closest('a')).toHaveAttribute('href', JUSTGO_IOS_STORE_URL);
    expect(screen.queryByText(/google play/i)).not.toBeInTheDocument();

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
      if (url === '/pivot/landing/config') {
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
      if (url === '/pivot/landing/event') {
        return Promise.resolve({ success: true });
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
      if (url === '/pivot/landing/config') {
        return Promise.resolve({ success: true, data: { cities: CITIES } });
      }
      if (url === '/pivot/landing/event') {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: false });
    });

    mockMatchMedia(true);
    render(
      <MemoryRouter initialEntries={['/justgo']}>
        {landingRoutes()}
      </MemoryRouter>,
    );

    expect(await screen.findByText(/live in brooklyn/i)).toBeInTheDocument();
    expect(screen.getAllByText(justGoLandingCopy.cta).length).toBeGreaterThan(0);

    resolveCopy({
      success: true,
      data: {
        entries: { 'landing.web.cta': 'grab the app' },
        tokens: {},
      },
    });

    expect(await screen.findAllByText('grab the app')).not.toHaveLength(0);
  });

  it('locks the drop to one city on a tenant landing', async () => {
    await renderLanding({ path: '/justgo/troy' });

    expect(await screen.findByText(/^live in troy$/i)).toBeInTheDocument();
    expect(screen.queryByText(/live in brooklyn/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/· troy$/i).length).toBeGreaterThan(0);
    expect(mockApi).toHaveBeenCalledWith('/pivot/landing/config', null, {
      method: 'GET',
      params: { tenantKey: 'troy' },
    });
  });

  it('swipes only that city’s drop on a tenant landing', async () => {
    await renderLanding({ desktop: false, path: '/justgo/troy' });

    expect(await screen.findByRole('heading', { name: 'friday night market' })).toBeInTheDocument();
    expect(mockApi).toHaveBeenCalledWith('/pivot/landing/drop', null, {
      method: 'GET',
      params: { tenantKey: 'troy' },
    });
    expect(screen.queryByRole('listbox', { name: justGoLandingCopy.cityPickerLabel })).not.toBeInTheDocument();
  });

  it('treats an unknown city slug as not live yet', async () => {
    await renderLanding({ path: '/justgo/paris' });

    expect(await screen.findByText(justGoLandingCopy.citiesEmpty)).toBeInTheDocument();
    expect(screen.queryByText(/live in brooklyn/i)).not.toBeInTheDocument();
  });

  it('renders Just Go on / under a Just Go host', async () => {
    mockIsJustGoHost.mockReturnValue(true);
    await renderLanding({ path: '/' });

    expect(
      screen.getByRole('heading', { name: /what are you doing this week/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/live in brooklyn/i)).toBeInTheDocument();
  });

  it('locks the drop on /:tenantKey under a Just Go host', async () => {
    mockIsJustGoHost.mockReturnValue(true);
    await renderLanding({ path: '/troy' });

    expect(await screen.findByText(/^live in troy$/i)).toBeInTheDocument();
    expect(screen.queryByText(/live in brooklyn/i)).not.toBeInTheDocument();
  });

  it('keeps campus / as campus landing when not a Just Go host', () => {
    mockIsJustGoHost.mockReturnValue(false);
    mockMatchMedia(true);
    render(
      <MemoryRouter initialEntries={['/']}>
        {landingRoutes()}
      </MemoryRouter>,
    );
    expect(screen.getByText('campus landing')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /what are you doing this week/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps /justgo on a campus host', async () => {
    mockIsJustGoHost.mockReturnValue(false);
    await renderLanding({ path: '/justgo' });
    expect(
      screen.getByRole('heading', { name: /what are you doing this week/i }),
    ).toBeInTheDocument();
  });

  it('does not treat /qr/:name as a city on a Just Go host', async () => {
    mockIsJustGoHost.mockReturnValue(true);
    mockMatchMedia(true);
    mockApi.mockImplementation((url) => {
      if (url === '/pivot/landing/qr-scan') {
        return Promise.resolve({
          error: 'QR code not found.',
          code: 404,
          errorCode: 'QR_NOT_FOUND',
        });
      }
      return Promise.resolve({ success: false });
    });
    render(
      <MemoryRouter initialEntries={['/qr/poster-night']}>
        {landingRoutes()}
      </MemoryRouter>,
    );
    expect(screen.getByTestId('justgo-qr-hop')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(justGoLandingCopy.qrMissingTitle)).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('heading', { name: /what are you doing this week/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps campus /qr/:id on a campus host', () => {
    mockIsJustGoHost.mockReturnValue(false);
    mockMatchMedia(true);
    render(
      <MemoryRouter initialEntries={['/qr/campus-code']}>
        {landingRoutes()}
      </MemoryRouter>,
    );
    expect(screen.getByText('campus qr')).toBeInTheDocument();
    expect(screen.queryByTestId('justgo-qr-hop')).not.toBeInTheDocument();
  });

  it('aliases /creator to the creator console on a Just Go host', () => {
    mockIsJustGoHost.mockReturnValue(true);
    mockMatchMedia(true);
    render(
      <MemoryRouter initialEntries={['/creator']}>
        {landingRoutes()}
      </MemoryRouter>,
    );
    expect(screen.getByText('creator home')).toBeInTheDocument();
  });

  it('posts a landing view on render without tenantKey on the generic page', async () => {
    await renderLanding();

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        '/pivot/landing/event',
        expect.objectContaining({
          type: 'view',
          source: 'direct',
          visitorId: expect.any(String),
        }),
      );
    });
    const [, body] = mockApi.mock.calls.find((call) => call[0] === '/pivot/landing/event');
    expect(body).not.toHaveProperty('tenantKey');
    expect(mockTrack).toHaveBeenCalledWith('justgo_landing_view', { source: 'direct' });
    expect(window.localStorage.getItem('justgo.landing.visitor')).toBe(body.visitorId);
  });

  it('includes tenantKey on a city landing view', async () => {
    await renderLanding({ path: '/justgo/troy?src=qr&qr=poster-night' });

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        '/pivot/landing/event',
        expect.objectContaining({
          type: 'view',
          tenantKey: 'troy',
          source: 'qr',
          qr: 'poster-night',
        }),
      );
    });
    expect(mockTrack).toHaveBeenCalledWith('justgo_landing_view', {
      tenantKey: 'troy',
      source: 'qr',
    });
    expect(window.sessionStorage.getItem('justgo.landing.src')).toBe('qr');
    expect(window.sessionStorage.getItem('justgo.landing.qr')).toBe('poster-night');
  });

  it('persists ref from a share URL and implies source=share', async () => {
    await renderLanding({ path: '/justgo/troy?ref=AbC123xyzz' });

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        '/pivot/landing/event',
        expect.objectContaining({
          type: 'view',
          tenantKey: 'troy',
          source: 'share',
          ref: 'abc123xyzz',
        }),
      );
    });
    expect(window.sessionStorage.getItem('justgo.landing.ref')).toBe('abc123xyzz');
    expect(window.sessionStorage.getItem('justgo.landing.src')).toBe('share');
  });

  it('posts store_click when the app store CTA is pressed', async () => {
    await renderLanding();

    fireEvent.click(screen.getByRole('link', { name: justGoLandingCopy.ctaAriaIos }));

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        '/pivot/landing/event',
        expect.objectContaining({
          type: 'store_click',
          store: 'ios',
          source: 'direct',
        }),
      );
    });
    expect(mockTrack).toHaveBeenCalledWith(
      'justgo_landing_store_click',
      expect.objectContaining({ store: 'ios', source: 'direct' }),
    );
    const [, body] = mockApi.mock.calls.find(
      (call) => call[0] === '/pivot/landing/event' && call[1]?.type === 'store_click',
    );
    expect(body).not.toHaveProperty('phone');
  });

  it('keeps the app store CTA for a launched city', async () => {
    await renderLanding();

    expect(
      await screen.findByRole('img', { name: 'Download on the App Store' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(justGoLandingCopy.waitlistEmailLabel)).not.toBeInTheDocument();
    expect(screen.getAllByText(justGoLandingCopy.cta).length).toBeGreaterThan(0);
  });

  it('shows a save-my-spot CTA instead of the waitlist form on a waitlist city', async () => {
    await renderLanding({ path: '/justgo/troy' });

    const stage = document.querySelector('.justgo-landing__hero-stage');
    expect(
      await within(stage).findByRole('link', { name: justGoLandingCopy.waitlistCta }),
    ).toHaveAttribute('href', '#waitlist');
    expect(screen.queryByLabelText(justGoLandingCopy.waitlistEmailLabel)).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Download on the App Store' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: justGoLandingCopy.ctaAriaIos })).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox', { name: justGoLandingCopy.cityPickerLabel })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: justGoLandingCopy.footerHostLink })).not.toBeInTheDocument();
    expect(screen.queryByText(justGoLandingCopy.footerHost)).not.toBeInTheDocument();
  });

  it('opens the waitlist form from the hero CTA', async () => {
    await renderLanding({ path: '/justgo/troy' });
    const email = await revealWaitlistForm();
    const dialog = screen.getByRole('dialog', { name: justGoLandingCopy.waitlistCta });
    const form = email.closest('form');
    const stage = document.querySelector('.justgo-landing__hero-stage');
    expect(email).toBeInTheDocument();
    await waitFor(() => {
      expect(email).toHaveFocus();
    });
    expect(dialog).toBeInTheDocument();
    expect(within(stage).getByRole('link', { name: justGoLandingCopy.waitlistCta })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(justGoLandingCopy.waitlistEmailPlaceholder)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: justGoLandingCopy.waitlistSubmit })).toBeInTheDocument();
    expect(within(form).getByText(justGoLandingCopy.waitlistConsent, { exact: false })).toBeInTheDocument();
    expect(within(form).getByRole('link', { name: justGoLandingCopy.footerPrivacy })).toHaveAttribute(
      'href',
      '/privacy-policy',
    );
    expect(within(form).getByRole('link', { name: justGoLandingCopy.footerTerms })).toHaveAttribute(
      'href',
      '/terms-of-service',
    );
    const consent = within(form).getByText(justGoLandingCopy.waitlistConsent, { exact: false });
    const submit = screen.getByRole('button', { name: justGoLandingCopy.waitlistSubmit });
    expect(consent.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(dialog).queryByRole('listbox', { name: justGoLandingCopy.cityPickerLabel })).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox', { name: justGoLandingCopy.cityPickerLabel })).not.toBeInTheDocument();
  });

  it('closes the waitlist popup without replacing the hero CTA', async () => {
    await renderLanding({ path: '/justgo/troy' });
    await revealWaitlistForm();
    expect(screen.getByRole('dialog', { name: justGoLandingCopy.waitlistCta })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.queryByLabelText(justGoLandingCopy.waitlistEmailLabel)).not.toBeInTheDocument();
    const stage = document.querySelector('.justgo-landing__hero-stage');
    expect(within(stage).getByRole('link', { name: justGoLandingCopy.waitlistCta })).toBeInTheDocument();
  });

  it('swaps the generic landing to a waitlist CTA when a waitlist city is selected', async () => {
    await renderLanding();
    fireEvent.click(screen.getByRole('option', { name: 'troy' }));

    const stage = document.querySelector('.justgo-landing__hero-stage');
    expect(
      await within(stage).findByRole('link', { name: justGoLandingCopy.waitlistCta }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(justGoLandingCopy.waitlistEmailLabel)).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Download on the App Store' })).not.toBeInTheDocument();
  });

  it('lets the generic landing pick a waitlist city before posting', async () => {
    const waitlistCities = [
      { tenantKey: 'troy', cityDisplayName: 'Troy', landingMode: 'waitlist' },
      { tenantKey: 'hudson', cityDisplayName: 'Hudson', landingMode: 'waitlist' },
    ];
    mockApi.mockImplementation((url) => {
      if (url === '/pivot/landing/config') {
        return Promise.resolve({ success: true, data: { cities: waitlistCities } });
      }
      if (url === '/pivot/landing/drop') {
        return Promise.resolve({
          success: true,
          data: {
            tenantKey: 'troy',
            cityDisplayName: 'Troy',
            batchWeek: '2026-W33',
            events: DROP_EVENTS.slice(0, 4),
          },
        });
      }
      if (url === '/pivot/landing/event') {
        return Promise.resolve({ success: true });
      }
      if (url === '/pivot/landing/waitlist') {
        return Promise.resolve({
          success: true,
          data: {
            shareUrl: 'https://justgo.lol/troy?ref=abc12',
            friendsJoined: 0,
            tenantKey: 'troy',
          },
        });
      }
      return Promise.resolve({ success: false });
    });

    await renderLanding({ proof: /live in troy/i });

    expect(
      within(document.querySelector('.justgo-landing__hero-stage')).getByRole('link', {
        name: justGoLandingCopy.waitlistCta,
      }),
    ).toBeInTheDocument();
    await revealWaitlistForm();
    expect(await screen.findByLabelText(justGoLandingCopy.waitlistEmailLabel)).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog', { name: justGoLandingCopy.waitlistCta })).getByRole(
        'listbox',
        { name: justGoLandingCopy.cityPickerLabel },
      ),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(justGoLandingCopy.waitlistEmailLabel), {
      target: { value: 'you@email.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: justGoLandingCopy.waitlistSubmit }));
    });

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        '/pivot/landing/waitlist',
        expect.objectContaining({
          email: 'you@email.com',
          tenantKey: 'troy',
          visitorId: expect.any(String),
          source: 'direct',
        }),
      );
    });
  });

  it('cannot submit waitlist without a city', () => {
    render(
      <MemoryRouter>
        <JustGoLandingWaitlist
          cities={CITIES}
          selectedTenantKey=""
          onCityChange={() => {}}
        />
      </MemoryRouter>,
    );

    const submit = screen.getByRole('button', { name: justGoLandingCopy.waitlistSubmit });
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest('form'));
    expect(screen.getByRole('alert')).toHaveTextContent(justGoLandingCopy.waitlistCityRequired);
    expect(mockApi).not.toHaveBeenCalledWith('/pivot/landing/waitlist', expect.anything());
  });

  it('posts waitlist, shows confirmation with friendsJoined, and copies the public share URL', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await renderLanding({ path: '/justgo/troy' });
    await revealWaitlistForm();
    fireEvent.change(await screen.findByLabelText(justGoLandingCopy.waitlistEmailLabel), {
      target: { value: 'you@email.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: justGoLandingCopy.waitlistSubmit }));
    });

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        '/pivot/landing/waitlist',
        expect.objectContaining({
          email: 'you@email.com',
          tenantKey: 'troy',
        }),
      );
    });
    expect(mockTrack).toHaveBeenCalledWith('justgo_landing_waitlist_submit', {
      tenantKey: 'troy',
      source: 'direct',
      store: 'ios',
    });
    const trackProps = mockTrack.mock.calls.find(
      (call) => call[0] === 'justgo_landing_waitlist_submit',
    )[1];
    expect(trackProps).not.toHaveProperty('email');
    expect(await screen.findByText(justGoLandingCopy.waitlistSuccessTitle)).toBeInTheDocument();
    const panel = screen.getByRole('dialog', { name: justGoLandingCopy.waitlistCta });
    expect(within(panel).getByText(justGoLandingCopy.waitlistSuccessBody)).toBeInTheDocument();
    expect(within(panel).getByText('0 friends joined')).toBeInTheDocument();
    expect(within(panel).queryByText(/position|#\d/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(justGoLandingCopy.waitlistEmailLabel)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: justGoLandingCopy.waitlistShare })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: justGoLandingCopy.waitlistCopyLink }));
    expect(await screen.findByRole('button', { name: justGoLandingCopy.waitlistCopied })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(justGoPublicUrl('/troy?ref=abc12'));
  });

  it('offers Web Share when available', async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    });

    await renderLanding({ path: '/justgo/troy' });
    await revealWaitlistForm();
    fireEvent.change(await screen.findByLabelText(justGoLandingCopy.waitlistEmailLabel), {
      target: { value: 'you@email.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: justGoLandingCopy.waitlistSubmit }));
    });

    expect(await screen.findByText(justGoLandingCopy.waitlistSuccessTitle)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: justGoLandingCopy.waitlistShare }));
    });
    expect(share).toHaveBeenCalledWith({
      title: justGoLandingCopy.productName,
      text: justGoLandingCopy.waitlistShareText,
      url: justGoPublicUrl('/troy?ref=abc12'),
    });
  });

  it('shows friendsJoined from the signup response without a second fetch', async () => {
    mockApi.mockImplementation((url) => {
      if (url === '/pivot/landing/config') {
        return Promise.resolve({ success: true, data: { cities: CITIES } });
      }
      if (url === '/pivot/landing/drop') {
        return Promise.resolve({
          success: true,
          data: {
            tenantKey: 'troy',
            cityDisplayName: 'Troy',
            batchWeek: '2026-W33',
            events: DROP_EVENTS.slice(0, 4),
          },
        });
      }
      if (url === '/pivot/landing/event') {
        return Promise.resolve({ success: true });
      }
      if (url === '/pivot/landing/waitlist') {
        return Promise.resolve({
          success: true,
          data: {
            shareUrl: 'https://justgo.lol/troy?ref=abc12',
            friendsJoined: 3,
            tenantKey: 'troy',
          },
        });
      }
      return Promise.resolve({ success: false });
    });

    await renderLanding({ path: '/justgo/troy' });
    await revealWaitlistForm();
    fireEvent.change(await screen.findByLabelText(justGoLandingCopy.waitlistEmailLabel), {
      target: { value: 'you@email.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: justGoLandingCopy.waitlistSubmit }));
    });

    expect(await screen.findByText('3 friends joined')).toBeInTheDocument();
    const waitlistPosts = mockApi.mock.calls.filter((call) => call[0] === '/pivot/landing/waitlist');
    expect(waitlistPosts).toHaveLength(1);
  });

  it('swipes a waitlist city drop onto a waitlist prompt, not the app store', async () => {
    await renderLanding({ desktop: false, path: '/justgo/troy' });
    expect(await screen.findByRole('heading', { name: 'friday night market' })).toBeInTheDocument();

    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: justGoLandingCopy.deckPass }));
    }

    expect(
      await screen.findByRole('heading', { name: justGoLandingCopy.waitlistCta }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Download on the App Store' })).not.toBeInTheDocument();
    expect(
      within(document.querySelector('.justgo-landing-deck')).getByRole('link', {
        name: justGoLandingCopy.waitlistCta,
      }),
    ).toHaveAttribute('href', '#waitlist');
    const waitlistLinks = screen.getAllByRole('link', { name: justGoLandingCopy.waitlistCta });
    expect(waitlistLinks.length).toBeGreaterThan(0);
    expect(waitlistLinks.every((el) => el.getAttribute('href') === '#waitlist')).toBe(true);
  });
});
