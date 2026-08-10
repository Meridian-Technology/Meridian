import React from 'react';
import { useCreatorDemoMode } from './justGoCreatorDemoMode';
import './justGoCreatorDemo.scss';

/**
 * Local-dev demo mode indicator, mounted in the shell's header bar. Renders nothing in production.
 *
 * It is both the state readout and the switch, because the console is otherwise indistinguishable
 * from one showing real listings and a fake audience number mistaken for a real one is worse than no
 * preview at all. Off it stays quiet so it doesn't read as product chrome; on it goes yellow.
 *
 * Strings are inline rather than in the copy bank, which is reserved for creator-facing product copy.
 */
function JustGoCreatorDemoIndicator() {
  const { active, capable, toggle } = useCreatorDemoMode();

  if (!capable) return null;

  return (
    <button
      type="button"
      className={`jg-demo-chip${active ? ' jg-demo-chip--active' : ''}`}
      onClick={toggle}
      aria-pressed={active}
      title={
        active
          ? 'Showing generated sample listings. No requests are being made. Click to exit.'
          : 'Preview the console against generated sample listings (local dev only).'
      }
    >
      <span className="jg-demo-chip__dot" aria-hidden="true" />
      {active ? 'Demo data' : 'Demo'}
    </button>
  );
}

export default JustGoCreatorDemoIndicator;
