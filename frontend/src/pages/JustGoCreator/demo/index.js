/**
 * Entry point for local-dev demo mode. Import demo functionality from here, never from the sibling
 * modules directly.
 *
 * The fixtures and the indicator are pulled in through a `require` inside a branch that webpack
 * folds to `false` in a production build, so neither the sample listing copy nor the demo chrome
 * reaches a production bundle — guarding only the behaviour would still ship the payload.
 */

export const DEMO_CAPABLE = process.env.NODE_ENV !== 'production';

let fixtures = null;
let demoIndicator = null;

if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line global-require
  fixtures = require('./justGoCreatorDemoData');
  // eslint-disable-next-line global-require
  demoIndicator = require('./JustGoCreatorDemoIndicator').default;
}

/** Header-bar demo indicator and toggle, or `null` in production. */
export const DemoIndicator = demoIndicator;

export const DEMO_PRIMARY_EVENT_ID = fixtures?.DEMO_PRIMARY_EVENT_ID ?? null;

export function isDemoEventId(eventId) {
  return fixtures ? fixtures.isDemoEventId(eventId) : false;
}

export function buildDemoListingsResponse(now) {
  return fixtures ? fixtures.buildDemoListingsResponse(now) : null;
}

export function buildDemoListingResponse(eventId, now) {
  return fixtures ? fixtures.buildDemoListingResponse(eventId, now) : null;
}

export { useCreatorDemoMode } from './justGoCreatorDemoMode';
