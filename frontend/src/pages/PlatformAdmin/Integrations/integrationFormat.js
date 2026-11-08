export function formatWhen(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

/** The API's message for a failed authenticatedRequest (MFA errors included). */
export function requestError(res, reqError) {
  return res?.message || reqError || 'Request failed';
}
