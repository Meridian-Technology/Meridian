import { useCallback, useEffect, useState } from 'react';

/**
 * Local-dev demo mode for the creator console.
 *
 * Renders the console against generated fixtures instead of the API so the populated experience can
 * be reviewed without seeding a database or holding a creator grant. Every read is short-circuited
 * before `useFetch`, so demo mode issues no requests and never touches real data.
 *
 * Hard-off in production: `isDemoCapable()` gates the toggle, the fixtures, and every call site, and
 * `process.env.NODE_ENV` is inlined at build time so the branches drop out of a production bundle.
 */

const STORAGE_KEY = 'justGoCreatorDemo';
const CHANGE_EVENT = 'justgo-creator-demo-change';

export function isDemoCapable() {
  return process.env.NODE_ENV !== 'production';
}

export function isDemoActive() {
  if (!isDemoCapable()) return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    // Private mode / disabled storage — demo mode simply stays off.
    return false;
  }
}

export function setDemoActive(active) {
  if (!isDemoCapable()) return;
  try {
    if (active) window.localStorage.setItem(STORAGE_KEY, 'on');
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore; the dispatch below still updates this tab.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { active: !!active } }));
}

/**
 * Subscribes to the toggle so the shell, list, and workspace flip together without a reload.
 * `storage` covers other tabs; the custom event covers this one.
 */
export function useCreatorDemoMode() {
  const [active, setActive] = useState(isDemoActive);

  useEffect(() => {
    if (!isDemoCapable()) return undefined;
    const sync = () => setActive(isDemoActive());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const toggle = useCallback(() => setDemoActive(!isDemoActive()), []);

  return { active, capable: isDemoCapable(), setActive: setDemoActive, toggle };
}
