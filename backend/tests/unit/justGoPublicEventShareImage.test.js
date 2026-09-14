const sharp = require('sharp');
const {
  SHARE_WIDTH,
  SHARE_HEIGHT,
  FIELD_LIMITS,
  escapeSvgText,
  formatPublicEventDate,
  validatePublicEventShareInput,
  wrapTitleLines,
  buildShareOverlaySvg,
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
});
