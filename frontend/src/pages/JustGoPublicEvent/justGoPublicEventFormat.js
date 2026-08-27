export function formatPublicEventDate(event, locale) {
  if (!event?.startsAt || !event?.endsAt || !event?.timezone) return null;
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const date = new Intl.DateTimeFormat(locale, {
    timeZone: event.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: start.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  }).format(start);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: event.timezone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const startTime = time.format(start);
  const endTime = time.format(end);
  return { date, startTime, endTime };
}
