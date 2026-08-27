const fs = require('fs');
const path = require('path');
const {
  JUSTGO_TITLE,
  JUSTGO_DESCRIPTION,
  wantsJustGoHtmlMeta,
  justGoCanonicalPath,
  applyJustGoIndexHtml,
  isPublicEventRequest,
  renderPublicEventIndexHtml,
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
    expect(html).toContain('name="twitter:image" content="https://justgo.lol/justgo/og.jpg"');
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
    expect(html).not.toContain('database unavailable');
  });
});
