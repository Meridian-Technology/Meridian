function formatWhen(snapshot) {
  if (snapshot.whenLabel) return snapshot.whenLabel;
  if (!snapshot.startTime || Number.isNaN(new Date(snapshot.startTime).getTime())) return '';
  const timeZone = snapshot.timezone || snapshot.timeZone || snapshot.city?.timezone || snapshot.city?.timeZone || 'UTC';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(snapshot.startTime));
  } catch (_) {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(snapshot.startTime));
  }
}

module.exports = { formatWhen };
