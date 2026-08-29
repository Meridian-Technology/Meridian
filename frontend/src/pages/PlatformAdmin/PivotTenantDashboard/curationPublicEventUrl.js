import { justGoPublicUrl } from '../../JustGoLanding/justGoLandingCopy';

/** Build the shareable Just Go event page URL shown to tenant curators. */
export function curationPublicEventUrl(event, options) {
  const eventId = String(event?._id || event?.id || '').trim();
  if (!eventId) return null;
  return justGoPublicUrl(`/events/${encodeURIComponent(eventId)}`, options);
}

export default curationPublicEventUrl;
