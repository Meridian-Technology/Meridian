import { useContext, useEffect, useRef } from 'react';
import { UNSAFE_NavigationContext } from 'react-router-dom';

/** BrowserRouter does not expose useBlocker; guard its navigation adapter and POP events. */
export default function useStudioNavigationGuard(dirty) {
  const context = useContext(UNSAFE_NavigationContext);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useEffect(() => {
    const allow = () => !dirtyRef.current || window.confirm('Leave this issue and discard unsaved changes?');
    const navigator = context?.navigator;
    const push = navigator?.push; const replace = navigator?.replace;
    if (navigator) {
      navigator.push = (...args) => { if (allow()) push.apply(navigator, args); };
      navigator.replace = (...args) => { if (allow()) replace.apply(navigator, args); };
    }
    let index = window.history.state?.idx; let restoring = false;
    const pop = event => {
      const next = event.state?.idx;
      if (restoring) { restoring = false; index = next; return; }
      if (!allow() && Number.isInteger(index) && Number.isInteger(next) && index !== next) {
        event.stopImmediatePropagation(); restoring = true; window.history.go(index - next);
      } else index = next;
    };
    window.addEventListener('popstate', pop, true);
    return () => {
      if (navigator) { navigator.push = push; navigator.replace = replace; }
      window.removeEventListener('popstate', pop, true);
    };
  }, [context?.navigator]);
}
