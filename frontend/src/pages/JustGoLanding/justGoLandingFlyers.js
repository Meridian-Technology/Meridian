import { formatLandingTag, formatLandingWhen } from './justGoLandingUtils';

const LIVE_FLYER_TONES = Object.freeze(['photo', 'pop', 'accent', 'ticker']);

/** Turn the public, privacy-projected drop cards into the desktop billboard. */
export function landingFlyersFromEvents(events, cityDisplayName = '') {
  if (!Array.isArray(events)) return [];
  return events.map((event, index) => ({
    id: event.id || `drop-event-${index}`,
    title: event.name || '',
    when: formatLandingWhen(event.startTime),
    tag: formatLandingTag(event.tag) || event.hostName || '',
    host: event.hostName || '',
    tone: event.coverImageUrl ? 'photo' : LIVE_FLYER_TONES[index % LIVE_FLYER_TONES.length],
    cover: event.coverImageUrl || null,
    city: cityDisplayName || null,
  }));
}
