import React from 'react';
import axe from 'axe-core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import JustGoPublicEvent from './JustGoPublicEvent';
import {
  JUSTGO_IOS_STORE_URL,
  JUSTGO_PLAY_STORE_URL,
} from '../JustGoLanding/justGoLandingCopy';

const mockTrackView = jest.fn();
const mockTrackAppOpen = jest.fn();
const mockTrackStoreClick = jest.fn();
jest.mock('./justGoPublicEventAnalytics', () => ({
  trackPublicEventView: (...args) => mockTrackView(...args),
  trackPublicEventAppOpenAttempt: (...args) => mockTrackAppOpen(...args),
  trackPublicEventStoreClick: (...args) => mockTrackStoreClick(...args),
}));

const EVENT = {
  id: '64f1234567890abcdef12345',
  title: 'Movie Night Under the Stars',
  description: 'Bring a blanket.',
  image: { url: 'https://images.example.test/event.jpg' },
  startsAt: '2026-09-05T02:00:00.000Z',
  endsAt: '2026-09-05T04:30:00.000Z',
  timezone: 'America/Los_Angeles',
  venue: { text: 'Civic Center Lawn' },
  organizer: { name: 'Night Owl Cinema', imageUrl: null, profileUrl: null },
  lifecycleStatus: 'upcoming',
  registrationCapability: 'in_app',
  cityId: 'oakland',
  canonicalUrl: 'https://justgo.lol/events/64f1234567890abcdef12345',
};

function response(body, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

function renderPage(initialEntry = '/events/64f1234567890abcdef12345') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes><Route path="/events/:eventId" element={<JustGoPublicEvent />} /></Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  jest.restoreAllMocks();
  mockTrackView.mockReset();
  mockTrackAppOpen.mockReset();
  mockTrackStoreClick.mockReset();
  document.querySelectorAll('meta[data-justgo-event-unavailable]').forEach((node) => node.remove());
});

it('emits one attributed view and the requested acquisition click events', async () => {
  jest.spyOn(global, 'fetch')
    .mockImplementationOnce(() => response({ contractVersion: '1', data: EVENT }))
    .mockImplementationOnce(() => response({ language: { entries: {}, tokens: {} } }));
  renderPage('/events/64f1234567890abcdef12345?src=share');

  const appLink = await screen.findByRole('link', { name: 'open just go to register for this event' });
  await waitFor(() => expect(mockTrackView).toHaveBeenCalledTimes(1));
  expect(mockTrackView).toHaveBeenCalledWith(expect.objectContaining({
    eventId: EVENT.id, search: '?src=share',
  }));

  fireEvent.click(appLink);
  expect(mockTrackAppOpen).toHaveBeenCalledTimes(1);
  expect(mockTrackStoreClick).not.toHaveBeenCalled();
});

it('renders the privacy-safe event contract responsively', async () => {
  jest.spyOn(global, 'fetch')
    .mockImplementationOnce(() => response({ contractVersion: '1', data: EVENT }))
    .mockImplementationOnce(() => response({ language: { entries: {}, tokens: {} } }));
  renderPage();
  expect(screen.getByText('loading event')).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: EVENT.title })).toBeInTheDocument();
  expect(screen.getByText('Civic Center Lawn')).toBeInTheDocument();
  expect(screen.getByText('Night Owl Cinema')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'open just go to register for this event' })).toHaveAttribute('href', EVENT.canonicalUrl);
  expect(screen.queryByRole('group', { name: 'download options' })).not.toBeInTheDocument();
});

it.each([
  'MISSING',
  'PRIVATE',
  'UNPUBLISHED',
  'REMOVED',
  'COLLISION',
  'INACCESSIBLE',
])('uses the same disclosure-free unavailable presentation for %s', async (internalCause) => {
  jest.spyOn(global, 'fetch')
    .mockImplementationOnce(() => response({ error: { code: 'EVENT_UNAVAILABLE', internalCause } }, 404))
    .mockImplementationOnce(() => response({ language: {
      entries: {
        'landing.web.event.unavailableTitle': 'Nothing to see here',
        'landing.web.event.unavailableBody': 'Find another night in {brand.name}.',
        'landing.web.event.appStore': 'Get the App',
        'landing.web.event.downloadPrompt': 'More plans live in {brand.name}.',
      },
      tokens: { 'brand.name': 'Just Tonight' },
    } }));
  renderPage();
  expect(await screen.findByRole('heading', { name: 'Nothing to see here' })).toBeInTheDocument();
  expect(screen.getByText('Find another night in Just Tonight.')).toBeInTheDocument();
  expect(screen.getByText('More plans live in Just Tonight.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Get the App' })).toHaveAttribute('href', JUSTGO_IOS_STORE_URL);
  expect(screen.queryByText(internalCause)).not.toBeInTheDocument();
  expect(screen.queryByText(EVENT.title)).not.toBeInTheDocument();
  await waitFor(() => expect(document.querySelector('meta[name="robots"][data-justgo-event-unavailable]')).toHaveAttribute('content', 'noindex, nofollow'));
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('updates visible, status, helper, and accessible copy from dynamic language', async () => {
  const configuredEvent = { ...EVENT, lifecycleStatus: 'ongoing', registrationCapability: 'none' };
  const entries = {
    'landing.web.event.skipToEvent': 'Jump to the listing',
    'landing.web.event.ongoing': 'LIVE Right Now',
    'landing.web.event.openAppCta': 'Launch {brand.name}',
    'landing.web.event.openAppA11y': 'Launch this listing in {brand.name}',
    'landing.web.event.downloadPrompt': 'Discover more with {brand.name}',
    'landing.web.event.dateSeparator': 'UNTIL',
    'landing.web.event.timezoneLabel': 'Local zone:',
    'landing.web.event.venueLabel': 'LOCATION',
    'landing.web.event.organizerLabel': 'PRESENTED BY',
    'landing.web.event.imageAlt': 'Featured artwork',
    'landing.web.event.appStore': 'Download for iPhone',
    'landing.web.event.googlePlay': 'Download for Android',
    'landing.web.event.storeChoicesLabel': 'Choose your store',
  };
  jest.spyOn(global, 'fetch')
    .mockImplementationOnce(() => response({ contractVersion: '1', data: configuredEvent }))
    .mockImplementationOnce(() => response({
      language: { entries, tokens: { 'brand.name': 'Just Tonight', 'brand.cta': 'Go' } },
    }));
  renderPage();
  expect(await screen.findByText('LIVE Right Now')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Jump to the listing' })).toHaveAttribute('href', '#event');
  expect(screen.getByText('LOCATION')).toBeInTheDocument();
  expect(screen.getByText('PRESENTED BY')).toBeInTheDocument();
  expect(screen.getByText(/UNTIL/)).toBeInTheDocument();
  expect(screen.getByText(/Local zone:/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Launch this listing in Just Tonight' })).toHaveTextContent('Launch Just Tonight');
  expect(screen.queryByRole('group', { name: 'Choose your store' })).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: `${EVENT.title} — Featured artwork` })).toBeInTheDocument();
  expect(screen.getAllByRole('img', { name: 'Just Tonight' })).toHaveLength(1);
});

it('keeps approved fallbacks when the language request fails', async () => {
  jest.spyOn(global, 'fetch')
    .mockImplementationOnce(() => response({ contractVersion: '1', data: EVENT }))
    .mockImplementationOnce(() => Promise.reject(new Error('copy offline')));
  renderPage();
  expect(await screen.findByRole('heading', { name: EVENT.title })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'open just go to register for this event' })).toHaveTextContent('get the app to register');
});

it('shows only Google Play as the Android fallback when the event is unavailable', async () => {
  const userAgent = jest.spyOn(window.navigator, 'userAgent', 'get')
    .mockReturnValue('Mozilla/5.0 (Linux; Android 15; Pixel 9)');
  jest.spyOn(global, 'fetch')
    .mockImplementationOnce(() => response({ error: { code: 'EVENT_UNAVAILABLE' } }, 404))
    .mockImplementationOnce(() => response({ language: { entries: {}, tokens: {} } }));
  renderPage();
  await screen.findByRole('heading', { name: 'this event isn’t available' });
  expect(screen.getByRole('link', { name: 'google play' })).toHaveAttribute('href', JUSTGO_PLAY_STORE_URL);
  expect(screen.queryByRole('link', { name: 'app store' })).not.toBeInTheDocument();
  userAgent.mockRestore();
});

it('replaces an image that fails after loading with the accessible branded fallback', async () => {
  jest.spyOn(global, 'fetch')
    .mockImplementationOnce(() => response({ contractVersion: '1', data: EVENT }))
    .mockImplementationOnce(() => response({ language: { entries: {
      'landing.web.event.missingImageAlt': 'Poster could not load',
    }, tokens: { 'brand.name': 'Just Tonight' } } }));
  renderPage();
  const poster = await screen.findByRole('img', { name: `${EVENT.title} — event image` });
  fireEvent.error(poster);
  expect(screen.getByRole('img', { name: 'Poster could not load' })).toHaveTextContent('Just Tonight');
});

it('keeps retry and download actions usable during a transient failure, then recovers', async () => {
  jest.spyOn(global, 'fetch')
    .mockImplementationOnce(() => response({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503))
    .mockImplementationOnce(() => response({ language: { entries: {}, tokens: {} } }))
    .mockImplementationOnce(() => response({ contractVersion: '1', data: EVENT }))
    .mockImplementationOnce(() => response({ language: { entries: {}, tokens: {} } }));
  renderPage();
  const retry = await screen.findByRole('button', { name: 'try again' });
  expect(screen.getByRole('link', { name: 'app store' })).toHaveAttribute('href', JUSTGO_IOS_STORE_URL);
  fireEvent.click(retry);
  expect(screen.getByRole('status')).toHaveTextContent('loading event');
  expect(await screen.findByRole('heading', { name: EVENT.title })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'try again' })).not.toBeInTheDocument();
});

it('renders unusually long content without dropping semantic structure or controls', async () => {
  const longEvent = {
    ...EVENT,
    title: `A ${'verylongword'.repeat(30)} title`,
    description: 'Long description '.repeat(250),
    venue: { text: 'VenueWithoutBreaks'.repeat(35) },
    organizer: { ...EVENT.organizer, name: 'OrganizerWithoutBreaks'.repeat(20) },
  };
  jest.spyOn(global, 'fetch')
    .mockImplementationOnce(() => response({ contractVersion: '1', data: longEvent }))
    .mockImplementationOnce(() => response({ language: { entries: {
      'landing.web.event.registerCta': 'Open the application and complete registration '.repeat(8),
    }, tokens: {} } }));
  const { container } = renderPage();
  expect(await screen.findByRole('heading', { level: 1, name: longEvent.title })).toBeInTheDocument();
  expect(container.querySelector('main article')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'open just go to register for this event' })).toBeInTheDocument();
});

it('has no automated accessibility violations in the ready state', async () => {
  jest.spyOn(global, 'fetch')
    .mockImplementationOnce(() => response({ contractVersion: '1', data: EVENT }))
    .mockImplementationOnce(() => response({ language: { entries: {}, tokens: {} } }));
  const { container } = renderPage();
  await screen.findByRole('heading', { name: EVENT.title });
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(result.violations).toEqual([]);
});

it('covers the shared ended-event journey with hostile content and configured copy', async () => {
  const endedEvent = {
    ...EVENT,
    title: 'Closing Night <script>alert("title")</script>',
    description: 'Thanks for coming. </p><img src=x onerror=alert(1)>',
    lifecycleStatus: 'ended',
    registrationCapability: 'none',
  };
  jest.spyOn(global, 'fetch')
    .mockImplementationOnce(() => response({ contractVersion: '1', data: endedEvent }))
    .mockImplementationOnce(() => response({ language: { entries: {
      'landing.web.event.ended': 'That’s a wrap',
      'landing.web.event.openAppCta': 'See it in {brand.name}',
      'landing.web.event.openAppA11y': 'Open the ended event in {brand.name}',
      'landing.web.event.downloadPrompt': 'More plans in {brand.name}',
    }, tokens: { 'brand.name': 'Just Tonight' } } }));

  renderPage(`/events/${EVENT.id}?src=share&next=%3Cscript%3E`);
  expect(await screen.findByRole('heading', { name: endedEvent.title })).toBeInTheDocument();
  expect(screen.getByText('That’s a wrap')).toBeInTheDocument();
  expect(screen.getByText(endedEvent.description)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open the ended event in Just Tonight' }))
    .toHaveTextContent('See it in Just Tonight');
  await waitFor(() => expect(mockTrackView).toHaveBeenCalledWith(expect.objectContaining({
    eventId: EVENT.id,
    search: '?src=share&next=%3Cscript%3E',
  })));
});
