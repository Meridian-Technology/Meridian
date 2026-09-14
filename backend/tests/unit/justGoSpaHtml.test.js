const fs = require('fs');
const path = require('path');
const {
  JUSTGO_TITLE,
  JUSTGO_DESCRIPTION,
  JUSTGO_OG_IMAGE_ALT,
  wantsJustGoHtmlMeta,
  justGoCanonicalPath,
  applyJustGoIndexHtml,
  isPublicEventRequest,
  renderPublicEventIndexHtml,
  applyUnavailablePublicEventIndexHtml,
  buildPublicEventShareFallbackBlock,
} = require('../../utilities/justGoSpaHtml');

const INDEX_HTML = fs.readFileSync(
  path.join(__dirname, '../../../frontend/public/index.html'),
  'utf8',
);

function req({ host = 'justgo.lol', originalUrl = '/' } = {}) {
  return {
    headers: { host },
    originalUrl,
    path: originalUrl.split('?')[0],
    get: (header) => (header === 'host' ? host : undefined),
  };
}

describe('justGoSpaHtml', () => {
  it('rewrites justgo.lol and campus /justgo aliases, not campus home', () => {
    expect(wantsJustGoHtmlMeta(req({ host: 'justgo.lol', originalUrl: '/' }))).toBe(true);
    expect(wantsJustGoHtmlMeta(req({ host: 'justgo.lol', originalUrl: '/qr/sf-1' }))).toBe(true);
    expect(wantsJustGoHtmlMeta(req({ host: 'www.justgo.lol', originalUrl: '/troy' }))).toBe(true);
    expect(wantsJustGoHtmlMeta(req({ host: 'meridian.study', originalUrl: '/justgo' }))).toBe(true);
    expect(wantsJustGoHtmlMeta(req({ host: 'meridian.study', originalUrl: '/justgo/qr/sf-1' }))).toBe(
      true,
    );
    expect(wantsJustGoHtmlMeta(req({ host: 'meridian.study', originalUrl: '/' }))).toBe(false);
    expect(wantsJustGoHtmlMeta(req({ host: 'rpi.meridian.study', originalUrl: '/qr/sf-1' }))).toBe(
      false,
    );
  });

  it('strips the campus /justgo alias for canonical paths', () => {
    expect(justGoCanonicalPath(req({ originalUrl: '/justgo' }))).toBe('/');
    expect(justGoCanonicalPath(req({ originalUrl: '/justgo/' }))).toBe('/');
    expect(justGoCanonicalPath(req({ originalUrl: '/justgo/troy?ref=1' }))).toBe('/troy');
    expect(justGoCanonicalPath(req({ originalUrl: '/qr/sf-1' }))).toBe('/qr/sf-1');
  });

  it('replaces Meridian title, description, and share tags on the landing HTML', () => {
    const html = applyJustGoIndexHtml(INDEX_HTML, req({ originalUrl: '/' }));

    expect(html).toContain(`<title>${JUSTGO_TITLE}</title>`);
    expect(html).not.toMatch(/<title>Meridian<\/title>/);
    expect(html).toContain(`content="${JUSTGO_DESCRIPTION}"`);
    expect(html).toContain('property="og:site_name" content="just go"');
    expect(html).toContain('property="og:url" content="https://justgo.lol"');
    expect(html).toContain('property="og:image" content="https://justgo.lol/justgo/og.jpg"');
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="630"');
    expect(html).toContain(`property="og:image:alt" content="${JUSTGO_OG_IMAGE_ALT}"`);
    expect(html).toContain('name="twitter:image" content="https://justgo.lol/justgo/og.jpg"');
    expect(html).toContain(`name="twitter:image:alt" content="${JUSTGO_OG_IMAGE_ALT}"`);
    expect(html).toContain('name="theme-color" content="#1E1A16"');
    expect(html).toContain('href="https://justgo.lol/justgo-icon.svg"');
    expect(html).not.toMatch(/All of campus in one place/);
    expect(html).not.toMatch(/Study Compass/);
    expect(html).not.toMatch(/study-compass\.com/);
    expect(html).not.toMatch(/meridian\.study\/icon\.svg/);
  });

  it('uses the QR path as the canonical URL', () => {
    const html = applyJustGoIndexHtml(
      INDEX_HTML,
      req({ originalUrl: '/qr/sf-1?utm=ig' }),
    );
    expect(html).toContain('property="og:url" content="https://justgo.lol/qr/sf-1"');
    expect(html).toContain(`<title>${JUSTGO_TITLE}</title>`);
  });

  it('leaves campus HTML unchanged when not applied', () => {
    expect(INDEX_HTML).toContain('<title>Meridian</title>');
    expect(INDEX_HTML).toContain('All of campus in one place | Meridian');
  });

  it('recognizes event detail paths without treating the events hub as detail', () => {
    expect(isPublicEventRequest(req({ originalUrl: '/events/64f1234567890abcdef12345' }))).toBe(true);
    expect(isPublicEventRequest(req({ originalUrl: '/events/not-an-id' }))).toBe(true);
    expect(isPublicEventRequest(req({ originalUrl: '/events' }))).toBe(false);
  });

  it('renders canonical social and structured event metadata in raw HTML', async () => {
    const event = {
      id: '64f1234567890abcdef12345',
      title: 'Movie Night <Finale>',
      description: 'Bring friends & blankets. </script><script>alert(1)</script>',
      image: { url: 'https://images.example.test/event.jpg?a=1&b=2' },
      startsAt: '2026-09-05T02:00:00.000Z',
      endsAt: '2026-09-05T04:30:00.000Z',
      timezone: 'America/Los_Angeles',
      venue: { text: 'Civic Center <Lawn>' },
      organizer: { name: 'Night & Owl', imageUrl: null, profileUrl: null },
      lifecycleStatus: 'upcoming',
      registrationCapability: 'external',
      cityId: 'oakland',
      canonicalUrl: 'https://justgo.lol/events/64f1234567890abcdef12345',
      socialPreview: {
        title: 'Movie Night <Finale>',
        description: 'Bring friends & blankets. </script><script>alert(1)</script>',
        imageUrl: 'https://images.example.test/event.jpg?a=1&b=2',
      },
    };
    const html = await renderPublicEventIndexHtml(
      INDEX_HTML,
      req({ originalUrl: `/events/${event.id}?share=1` }),
      {
        loadPublicEvent: jest.fn().mockResolvedValue({ available: true, body: { data: event } }),
        getPublicEventLanguage: jest.fn().mockResolvedValue({
          language: { tokens: { 'brand.name': 'Just & Go' }, entries: {} },
        }),
      },
    );

    expect(html).toContain('<title>Movie Night &lt;Finale> | Just &amp; Go</title>');
    expect(html).toContain('rel="canonical" href="https://justgo.lol/events/64f1234567890abcdef12345"');
    expect(html).toContain('name="robots" content="index, follow"');
    expect(html).toContain('property="og:type" content="event"');
    expect(html).toContain('property="og:url" content="https://justgo.lol/events/64f1234567890abcdef12345"');
    expect(html).toContain('property="og:image" content="https://images.example.test/event.jpg?a=1&amp;b=2"');
    expect(html).toContain('property="og:image:alt" content="Movie Night &lt;Finale>"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('name="twitter:title" content="Movie Night &lt;Finale> | Just &amp; Go"');
    expect(html).not.toContain('</script><script>alert(1)</script>');

    const jsonMatch = html.match(/<script type="application\/ld\+json" data-justgo-event>(.*?)<\/script>/);
    expect(jsonMatch).not.toBeNull();
    const structured = JSON.parse(jsonMatch[1]);
    expect(structured).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: event.title,
      startDate: event.startsAt,
      endDate: event.endsAt,
      url: event.canonicalUrl,
      location: { '@type': 'Place', name: event.venue.text },
      organizer: { '@type': 'Organization', name: event.organizer.name },
    });
    expect(html).toContain('id="justgo-share-fallback"');
    expect(html).toContain('<h1>Movie Night &lt;Finale&gt;</h1>');
    expect(html).toContain('where: Civic Center &lt;Lawn&gt;');
    expect(html).toContain('hosted by: Night &amp; Owl');
    expect(html).toContain(
      '<a href="https://justgo.lol/events/64f1234567890abcdef12345">https://justgo.lol/events/64f1234567890abcdef12345</a>',
    );
    const fallback = html.match(/<div id="justgo-share-fallback">[\s\S]*?<\/div>/)[0];
    expect(fallback).not.toContain('<script');
  });

  it('uses the generated opengraph card when the event has no photo', async () => {
    const event = {
      id: '64f1234567890abcdef12345',
      title: 'Open mic night',
      description: 'Bring your best five minutes.',
      image: null,
      startsAt: '2026-09-05T02:00:00.000Z',
      endsAt: '2026-09-05T04:30:00.000Z',
      timezone: 'America/Los_Angeles',
      venue: { text: 'Back Room' },
      organizer: { name: 'Local Hosts', imageUrl: null, profileUrl: null },
      lifecycleStatus: 'upcoming',
      registrationCapability: 'none',
      cityId: 'oakland',
      canonicalUrl: 'https://justgo.lol/events/64f1234567890abcdef12345',
      socialPreview: {
        title: 'Open mic night',
        description: 'Bring your best five minutes.',
        imageUrl: null,
      },
    };
    const html = await renderPublicEventIndexHtml(
      INDEX_HTML,
      req({ originalUrl: `/events/${event.id}` }),
      {
        loadPublicEvent: jest.fn().mockResolvedValue({ available: true, body: { data: event } }),
        getPublicEventLanguage: jest.fn().mockResolvedValue({ language: null }),
      },
    );

    expect(html).toContain(
      'property="og:image" content="https://justgo.lol/api/public/events/64f1234567890abcdef12345/opengraph.png"',
    );
    expect(html).toContain(
      'name="twitter:image" content="https://justgo.lol/api/public/events/64f1234567890abcdef12345/opengraph.png"',
    );
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="630"');
    expect(html).toContain('property="og:image:alt" content="Open mic night"');
    expect(html).toContain('name="twitter:image:alt" content="Open mic night"');
    expect(html).not.toMatch(
      /property="og:image" content="https:\/\/justgo\.lol\/justgo\/og\.jpg"/,
    );
    expect(html).toContain('id="justgo-share-fallback"');
    expect(html).toContain('<h1>Open mic night</h1>');
    expect(html).toContain('where: Back Room');
    expect(html).toContain('hosted by: Local Hosts');
  });

  it.each([
    ['malformed', '/events/not-an-id', null],
    ['missing', '/events/64f1234567890abcdef12345', { available: false }],
    ['failed', '/events/64f1234567890abcdef12345', new Error('database unavailable')],
  ])('returns the same generic noindex raw HTML for %s events', async (_case, originalUrl, outcome) => {
    const loadPublicEvent = outcome instanceof Error
      ? jest.fn().mockRejectedValue(outcome)
      : jest.fn().mockResolvedValue(outcome);
    const html = await renderPublicEventIndexHtml(INDEX_HTML, req({ originalUrl }), {
      loadPublicEvent,
    });
    expect(html).toContain('<title>this event isn’t available</title>');
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).not.toContain('data-justgo-event>');
    expect(html).not.toContain('id="justgo-share-fallback"');
    expect(html).not.toContain('database unavailable');
  });

  it('keeps ended-event and hostile configured metadata crawler-safe', async () => {
    const event = {
      id: '64f1234567890abcdef12345',
      title: 'Past </title><script>bad()</script>',
      description: 'Finished & archived',
      image: null,
      startsAt: '2026-08-01T18:00:00.000Z',
      endsAt: '2026-08-01T20:00:00.000Z',
      timezone: 'America/New_York',
      venue: { text: 'The Hall' },
      organizer: { name: 'Hosts', imageUrl: null, profileUrl: null },
      lifecycleStatus: 'ended',
      registrationCapability: 'none',
      cityId: 'nyc',
      canonicalUrl: 'https://justgo.lol/events/64f1234567890abcdef12345',
    };
    const html = await renderPublicEventIndexHtml(
      INDEX_HTML,
      req({ originalUrl: `/events/${event.id}?src=share&ignored=<script>` }),
      {
        loadPublicEvent: jest.fn().mockResolvedValue({ available: true, body: { data: event } }),
        getPublicEventLanguage: jest.fn().mockResolvedValue({
          language: { tokens: { 'brand.name': 'Just <Tonight>' }, entries: {} },
        }),
      },
    );

    expect(html).toContain('rel="canonical" href="https://justgo.lol/events/64f1234567890abcdef12345"');
    expect(html).not.toContain('?src=share');
    expect(html).not.toContain('</title><script>bad()</script>');
    const json = JSON.parse(html.match(/data-justgo-event>(.*?)<\/script>/)[1]);
    expect(json.eventStatus).toBe('https://schema.org/EventCompleted');
    expect(json.name).toBe(event.title);
  });

  it('interpolates and escapes configured unavailable metadata without leaking the cause', async () => {
    const html = applyUnavailablePublicEventIndexHtml(
      INDEX_HTML,
      req({ originalUrl: '/events/64f1234567890abcdef12345?src=share' }),
      { entries: {
        'landing.web.event.unavailableTitle': 'Gone <quietly>',
        'landing.web.event.unavailableBody': 'Find another plan in {brand.name}.',
      }, tokens: { 'brand.name': 'Just & Tonight' } },
    );
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toContain('<title>Gone &lt;quietly></title>');
    expect(html).toContain('Find another plan in Just &amp; Tonight.');
    expect(html).not.toContain('{brand.name}');
    expect(html).not.toContain('id="justgo-share-fallback"');
  });

  it('builds a crawler-visible share fallback block with escaped plain text', () => {
    const event = {
      title: 'Jazz & Blues <Night>',
      startsAt: '2026-09-05T02:00:00.000Z',
      endsAt: '2026-09-05T04:30:00.000Z',
      timezone: 'America/Los_Angeles',
      venue: { text: 'The <Basement>' },
      organizer: { name: 'City & Sound' },
      canonicalUrl: 'https://justgo.lol/events/64f1234567890abcdef12345',
    };
    const block = buildPublicEventShareFallbackBlock(event, {
      entries: {
        'landing.web.event.venueLabel': 'venue',
        'landing.web.event.organizerLabel': 'by',
        'landing.web.event.dateSeparator': 'until',
      },
      tokens: {},
    });
    expect(block).toContain('id="justgo-share-fallback"');
    expect(block).toContain('<h1>Jazz &amp; Blues &lt;Night&gt;</h1>');
    expect(block).toContain('venue: The &lt;Basement&gt;');
    expect(block).toContain('by: City &amp; Sound');
    expect(block).toContain(' until ');
    expect(block).not.toContain('<script');
  });
});
