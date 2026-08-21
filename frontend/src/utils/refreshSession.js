import axios from 'axios';

const FORCE_LOGOUT_CODES = new Set([
  'REFRESH_TOKEN_EXPIRED',
  'INVALID_REFRESH_TOKEN',
  'REFRESH_FAILED',
]);

let inFlight = null;

/**
 * Refresh the access-token cookie. Concurrent 401s share one POST /refresh-token
 * so a poll and a mutation (curation publish) cannot race two refreshes.
 */
export function refreshSession() {
  if (!inFlight) {
    inFlight = axios
      .post('/refresh-token', {}, { withCredentials: true })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function isForceLogoutRefreshError(error) {
  return FORCE_LOGOUT_CODES.has(error?.response?.data?.code);
}

export function resetRefreshSessionForTests() {
  inFlight = null;
}
