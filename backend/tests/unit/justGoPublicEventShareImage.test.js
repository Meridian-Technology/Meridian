const sharp = require('sharp');
const {
  SHARE_WIDTH,
  SHARE_HEIGHT,
  FIELD_LIMITS,
  PHOTO_WIDTH,
  PHOTO_HEIGHT,
  PHOTO_LEFT,
  PHOTO_TOP,
  TITLE_CHARS_PER_LINE_SPLIT,
  TITLE_MAX_LINES_SPLIT,
  escapeSvgText,
  formatPublicEventDate,
  validatePublicEventShareInput,
  wrapTitleLines,
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

  it('wraps long titles to two lines with truncation', () => {
    const lines = wrapTitleLines(
      'An absolutely enormous movie night under the stars with blankets snacks and friends everywhere',
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/…$/);
  });

  it('builds overlay SVG with escaped event text only', () => {
    const svg = buildShareOverlaySvg({
      titleLines: ['Movie Night <Finale>'],
      dateLine: 'Friday, September 4',
      timeLine: '7:00 PM to 9:30 PM PDT',
      venueLine: 'Civic Center <Lawn>',
      organizerLine: 'Night & Owl',
    }).toString('utf8');

    expect(svg).toContain('Movie Night &lt;Finale&gt;');
    expect(svg).toContain('Civic Center &lt;Lawn&gt;');
    expect(svg).toContain('Night &amp; Owl');
    expect(svg).not.toContain('<Finale>');
    expect(svg).not.toContain('<script>');
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

  it('wraps split-layout titles to three shorter lines', () => {
    const lines = wrapTitleLines(
      'Blinkko Launch Party: A first look at the social wearable that brings AI into real-world connection.',
      { maxLines: TITLE_MAX_LINES_SPLIT, charsPerLine: TITLE_CHARS_PER_LINE_SPLIT },
    );
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length).toBeLessThanOrEqual(TITLE_MAX_LINES_SPLIT);
    expect(lines.every((line) => line.length <= TITLE_CHARS_PER_LINE_SPLIT)).toBe(true);
  });

  it('composites a provided photo into the branded split card', async () => {
    const photoBuffer = await sharp({
      create: {
        width: 800,
        height: 800,
        channels: 3,
        background: { r: 40, g: 120, b: 200 },
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

    const { data } = await sharp(result.buffer)
      .extract({
        left: PHOTO_LEFT + Math.floor(PHOTO_WIDTH / 2) - 2,
        top: PHOTO_TOP + Math.floor(PHOTO_HEIGHT / 2) - 2,
        width: 4,
        height: 4,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const sample = data.slice(0, 3);
    expect(sample[2]).toBeGreaterThan(sample[0]);
  });

  it('falls back to the full branded card when photo fetch fails', async () => {
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
