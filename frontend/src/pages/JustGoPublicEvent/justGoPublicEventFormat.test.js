import { formatPublicEventDate } from './justGoPublicEventFormat';
import { resolvePublicEventCopy } from './justGoPublicEventCopy';

describe('Just Go public event formatting', () => {
  it('formats the event in its city timezone', () => {
    const result = formatPublicEventDate({
      startsAt: '2026-09-05T02:00:00.000Z',
      endsAt: '2026-09-05T04:30:00.000Z',
      timezone: 'America/Los_Angeles',
    }, 'en-US');
    expect(result.date).toContain('September 4');
    expect(result.startTime).toMatch(/7:00 PM/);
    expect(result.endTime).toMatch(/9:30 PM/);
  });

  it('resolves approved language values and brand tokens', () => {
    const copy = resolvePublicEventCopy({
      entries: { 'landing.web.event.openAppCta': 'launch {brand.name}' },
      tokens: { 'brand.name': 'just tonight' },
    });
    expect(copy.openAppCta).toBe('launch just tonight');
    expect(copy.venueLabel).toBe('where');
  });
});
