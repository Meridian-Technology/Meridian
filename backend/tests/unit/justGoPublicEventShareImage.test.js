const sharp = require('sharp');
const {
  SHARE_WIDTH,
  SHARE_HEIGHT,
  FIELD_LIMITS,
  escapeSvgText,
  formatPublicEventDate,
  formatShareWhenChip,
  validatePublicEventShareInput,
  shareHeadlineLines,
  shortPlaceLabel,
  buildShareOverlaySvg,
  isSafePublicImageUrl,
  resolvePublicEventPhotoUrl,
  renderJustGoPublicEventShareImage,
} = require('../../services/justGoPublicEventShareImageService');

function sampleEvent(overrides = {}) {
  return {
    title: 'Movie night under the stars',
    startsAt: '2026-09-05T02:00:00.000Z',
    endsAt: '2026-09-05T04:30:00.000Z',
    timezone: 'America/Los_Angeles',
    venue: { text: 'Civic Center Lawn' },
    organizer: { name: 'Night Owl Cinema' },
    ...overrides,
  };
}

describe('justGoPublicEventShareImageService', () => {
  it('formats event date/time in the event timezone like the frontend helper', () => {
    const result = formatPublicEventDate(sampleEvent(), 'en-US');
    expect(result.date).toContain('September 4');
    expect(result.startTime).toMatch(/7:00 PM/);
    expect(result.endTime).toMatch(/9:30 PM/);
  });

  it('builds a compact when chip without the time range', () => {
    expect(formatShareWhenChip(sampleEvent(), 'en-US')).toMatch(/sep/);
    expect(formatShareWhenChip(sampleEvent(), 'en-US')).not.toMatch(/7:00/);
  });

  it('escapes SVG text and rejects oversize strings', () => {
    expect(escapeSvgText('Movie <Finale> & "Friends"')).toBe(
      'Movie &lt;Finale&gt; &amp; &quot;Friends&quot;',
    );

    const tooLongTitle = 'x'.repeat(FIELD_LIMITS.title + 1);
    expect(validatePublicEventShareInput(sampleEvent({ title: tooLongTitle }))).toEqual({
      error: `title exceeds ${FIELD_LIMITS.title} characters.`,
      status: 400,
    });

    const tooLongVenue = 'v'.repeat(FIELD_LIMITS['venue.text'] + 1);
    expect(validatePublicEventShareInput(sampleEvent({ venue: { text: tooLongVenue } }))).toEqual({
      error: `venue.text exceeds ${FIELD_LIMITS['venue.text']} characters.`,
      status: 400,
    });
  });

  it('uses the short headline before a colon and wraps it large', () => {
    expect(shareHeadlineLines(
      'Blinkko Launch Party: A first look at the social wearable that brings AI into real-world connection.',
    )).toEqual(['blinkko launch', 'party']);
  });

  it('wraps leftover long headlines to two lines without duplicating words', () => {
    const lines = shareHeadlineLines(
      'An absolutely enormous movie night under the stars with blankets snacks and friends everywhere',
    );
    expect(lines).toHaveLength(2);
    expect(lines.join(' ')).not.toMatch(/an absolutely enormous an absolutely/);
    expect(lines[1]).toMatch(/…$/);
  });

  it('shortens street addresses to a city or named place', () => {
    expect(shortPlaceLabel('221 11th St, San Francisco, CA 94103, USA')).toBe('san francisco');
    expect(shortPlaceLabel('Civic Center Lawn')).toBe('civic center lawn');
  });

  it('builds overlay SVG with escaped scrapbook text and no host dump', () => {
    const svg = buildShareOverlaySvg({
      titleLines: ['movie <finale>'],
      whenChip: 'fri · sep 4',
      placeChip: 'civic center <lawn>',
    }).toString('utf8');

    expect(svg).not.toContain('<finale>');
    expect(svg).not.toContain('<lawn>');
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('hosted by');
    expect(svg).not.toContain('Night Owl');
  });

  it('renders a 1200×630 PNG without embedding raw HTML', async () => {
    const event = sampleEvent({
      title: 'Movie Night <Finale>',
      venue: { text: 'Civic Center <Lawn>' },
      organizer: { name: 'Night & Owl Cinema' },
    });

    const result = await renderJustGoPublicEventShareImage(event);
    expect(result.error).toBeUndefined();
    expect(Buffer.isBuffer(result.buffer)).toBe(true);

    const meta = await sharp(result.buffer).metadata();
    expect(meta.width).toBe(SHARE_WIDTH);
    expect(meta.height).toBe(SHARE_HEIGHT);
    expect(meta.format).toBe('png');

    const svgProbe = result.buffer.toString('latin1');
    expect(svgProbe).not.toContain('<Finale>');
    expect(svgProbe).not.toContain('<Lawn>');
  });

  it('rejects invalid date/time payloads', async () => {
    expect(await renderJustGoPublicEventShareImage(sampleEvent({ startsAt: 'not-a-date' }))).toEqual({
      error: 'startsAt must be a valid date-time.',
      status: 400,
    });
    expect(await renderJustGoPublicEventShareImage(sampleEvent({ timezone: '' }))).toEqual({
      error: 'timezone is required.',
      status: 400,
    });
  });

  it('rejects unsafe photo URLs and reads the event photo field', () => {
    expect(isSafePublicImageUrl('http://images.example.test/event.jpg')).toBe(false);
    expect(isSafePublicImageUrl('https://localhost/event.jpg')).toBe(false);
    expect(isSafePublicImageUrl('https://127.0.0.1/event.jpg')).toBe(false);
    expect(isSafePublicImageUrl('https://10.0.0.8/event.jpg')).toBe(false);
    expect(isSafePublicImageUrl('https://images.lumacdn.com/event.jpg')).toBe(true);
    expect(resolvePublicEventPhotoUrl(sampleEvent({
      socialPreview: { imageUrl: 'https://images.example.test/event.jpg' },
    }))).toBe('https://images.example.test/event.jpg');
  });

  it('composites a provided photo as a gleam poster card over the nature hero', async () => {
    const photoBuffer = await sharp({
      create: {
        width: 800,
        height: 1066,
        channels: 3,
        background: { r: 220, g: 16, b: 170 },
      },
    }).jpeg().toBuffer();

    const fetchPhoto = jest.fn();
    const result = await renderJustGoPublicEventShareImage(
      sampleEvent({
        image: { url: 'https://images.example.test/event.jpg' },
        socialPreview: { imageUrl: 'https://images.example.test/event.jpg' },
      }),
      { photoBuffer, fetchPhoto },
    );

    expect(fetchPhoto).not.toHaveBeenCalled();
    expect(result.error).toBeUndefined();
    const meta = await sharp(result.buffer).metadata();
    expect(meta.width).toBe(SHARE_WIDTH);
    expect(meta.height).toBe(SHARE_HEIGHT);
    expect(meta.format).toBe('png');

    const posterSample = await sharp(result.buffer)
      .extract({
        left: SHARE_WIDTH - 160,
        top: Math.floor(SHARE_HEIGHT / 2) - 4,
        width: 8,
        height: 8,
      })
      .raw()
      .toBuffer();
    const posterPixel = posterSample.slice(0, 3);
    expect(posterPixel[0]).toBeGreaterThan(140);
    expect(posterPixel[1]).toBeLessThan(90);

    const backdropSample = await sharp(result.buffer)
      .extract({
        left: 520,
        top: 36,
        width: 8,
        height: 8,
      })
      .raw()
      .toBuffer();
    const backdropPixel = backdropSample.slice(0, 3);
    expect(backdropPixel[0]).toBeLessThan(170);
  });

  it('falls back to the immersive flyer when photo fetch fails', async () => {
    const fetchPhoto = jest.fn().mockResolvedValue(null);
    const result = await renderJustGoPublicEventShareImage(
      sampleEvent({
        socialPreview: { imageUrl: 'https://images.example.test/missing.jpg' },
      }),
      { fetchPhoto },
    );
    expect(fetchPhoto).toHaveBeenCalledWith('https://images.example.test/missing.jpg');
    expect(result.error).toBeUndefined();
    const meta = await sharp(result.buffer).metadata();
    expect(meta.width).toBe(SHARE_WIDTH);
    expect(meta.height).toBe(SHARE_HEIGHT);
  });
});
