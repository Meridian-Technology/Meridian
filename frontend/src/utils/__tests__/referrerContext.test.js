import {
  clearReferrerOverride,
  getReferrerPath,
  setReferrerOverride,
  updateReferrerOnNavigation,
} from '../referrerContext';

describe('referrerContext', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('stores last path and empty referrer on first navigation', () => {
    updateReferrerOnNavigation('/events');
    expect(getReferrerPath()).toBeNull();
  });

  test('uses previous path as referrer on next navigation', () => {
    updateReferrerOnNavigation('/events');
    updateReferrerOnNavigation('/event/123');
    expect(getReferrerPath()).toBe('/events');
  });

  test('applies and clears override for next navigation', () => {
    updateReferrerOnNavigation('/events-dashboard');
    setReferrerOverride('/org/ChessClub');
    updateReferrerOnNavigation('/event/456');
    expect(getReferrerPath()).toBe('/org/ChessClub');

    clearReferrerOverride();
    updateReferrerOnNavigation('/event/789');
    expect(getReferrerPath()).toBe('/event/456');
  });
});
