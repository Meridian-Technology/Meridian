import { useCallback, useLayoutEffect, useRef, useState } from 'react';

const DOCK_PX = 64;
const HYSTERESIS_PX = 96;
const SNAP_IDLE_MS = 0;
const SNAP_MS = 500;
const FLICK_DELTA = 14;
const MIN_TRAVEL_PX = 200;
const TRAVEL_SCALE = 2;
const CARD_RADIUS_PX = 22;
const SNAP_EASE = (t) => 1 - (1 - t) ** 3;

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

function getPage(node) {
  return node?.closest?.('.pivot-tenant-page') || null;
}

function getDockTop(page) {
  const header = page?.querySelector?.('.pivot-tenant-page__header');
  if (header) return header.getBoundingClientRect().bottom;
  return page.getBoundingClientRect().top;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpRect(from, to, t) {
  return {
    top: lerp(from.top, to.top, t),
    left: lerp(from.left, to.left, t),
    width: lerp(from.width, to.width, t),
    height: lerp(from.height, to.height, t),
  };
}

function wheelDeltaY(event) {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * (window.innerHeight || 800);
  return event.deltaY;
}

function syncPageFlags(page, { immersive = false, expanded = false } = {}) {
  if (!page) return;
  page.classList.toggle('is-catalog-immersive', immersive);
  page.classList.toggle('is-catalog-expanded', expanded);
}

function atScrollerTop(scroller) {
  return !scroller || scroller.scrollTop <= 0;
}

function applyHeader(page, progress) {
  const header = page?.querySelector?.('.pivot-tenant-page__header');
  if (!header) return;
  const y = -header.offsetHeight * progress;
  header.style.transform = y ? `translate3d(0, ${y}px, 0)` : '';
  header.style.opacity = progress <= 0 ? '' : String(Math.max(0, 1 - progress));
}

function clearHeader(page) {
  const header = page?.querySelector?.('.pivot-tenant-page__header');
  if (!header) return;
  header.style.transform = '';
  header.style.opacity = '';
}

function applyBox(frame, rect, progress) {
  const radius = lerp(CARD_RADIUS_PX, 0, progress);
  frame.style.position = 'fixed';
  frame.style.top = `${rect.top}px`;
  frame.style.left = `${rect.left}px`;
  frame.style.width = `${rect.width}px`;
  frame.style.height = `${rect.height}px`;
  frame.style.right = 'auto';
  frame.style.bottom = 'auto';
  frame.style.margin = '0';
  frame.style.zIndex = '120';
  frame.style.overflow = 'hidden';
  frame.style.boxSizing = 'border-box';
  frame.style.borderRadius = `${radius}px`;
  frame.style.transform = '';
  frame.style.setProperty('--curation-progress', String(progress));
  applyHeader(getPage(frame), progress);
}

function clearBox(frame) {
  frame.style.position = '';
  frame.style.top = '';
  frame.style.left = '';
  frame.style.width = '';
  frame.style.height = '';
  frame.style.right = '';
  frame.style.bottom = '';
  frame.style.margin = '';
  frame.style.zIndex = '';
  frame.style.transform = '';
  frame.style.transformOrigin = '';
  frame.style.clipPath = '';
  frame.style.overflow = '';
  frame.style.boxSizing = '';
  frame.style.borderRadius = '';
  frame.style.removeProperty('--curation-progress');
  clearHeader(getPage(frame));
}

/**
 * Catalog expansion is 1:1 with wheel while the card is docked.
 * Releasing mid-gesture snaps to the nearer of collapsed or full-panel.
 */
export function useCurationImmersiveScroll({ enabled = true, scrollerRef }) {
  const frameRef = useRef(null);
  const slotRef = useRef(null);
  const progressRef = useRef(0);
  const fromRectRef = useRef(null);
  const toRectRef = useRef(null);
  const travelRef = useRef(MIN_TRAVEL_PX);
  const lastDeltaRef = useRef(0);
  const snapTimerRef = useRef(null);
  const snapFrameRef = useRef(0);
  const snappingRef = useRef(false);
  const immersiveRef = useRef(false);
  const expandedRef = useRef(false);
  const savedScrollRef = useRef(0);
  const pendingReleaseRef = useRef(null);
  const [immersive, setImmersive] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [slotHeight, setSlotHeight] = useState(0);

  const cancelSnap = useCallback(() => {
    if (snapTimerRef.current) {
      window.clearTimeout(snapTimerRef.current);
      snapTimerRef.current = null;
    }
    if (snapFrameRef.current) {
      window.cancelAnimationFrame(snapFrameRef.current);
      snapFrameRef.current = 0;
    }
    snappingRef.current = false;
  }, []);

  const paint = useCallback((progress) => {
    const frame = frameRef.current;
    const from = fromRectRef.current;
    const to = toRectRef.current;
    if (!frame || !from || !to) return;
    applyBox(frame, lerpRect(from, to, progress), progress);
  }, []);

  const releaseToPage = useCallback(() => {
    cancelSnap();
    progressRef.current = 0;
    expandedRef.current = false;
    immersiveRef.current = false;
    pendingReleaseRef.current = { scrollTop: savedScrollRef.current };
    setExpanded(false);
    setImmersive(false);
  }, [cancelSnap]);

  const lockOpen = useCallback(() => {
    const frame = frameRef.current;
    const to = toRectRef.current;
    progressRef.current = 1;
    snappingRef.current = false;
    if (frame && to) applyBox(frame, to, 1);
    syncPageFlags(getPage(frame), { immersive: true, expanded: true });
    if (!expandedRef.current) {
      expandedRef.current = true;
      setExpanded(true);
    }
  }, []);

  const beginMorph = useCallback(() => {
    const frame = frameRef.current;
    const page = getPage(frame);
    if (!frame || !page) return false;
    const from = frame.getBoundingClientRect();
    const to = page.getBoundingClientRect();
    fromRectRef.current = from;
    toRectRef.current = to;
    travelRef.current = Math.max(to.height - from.height, MIN_TRAVEL_PX) * TRAVEL_SCALE;
    savedScrollRef.current = page.scrollTop;
    setSlotHeight(frame.offsetHeight);
    syncPageFlags(page, { immersive: true, expanded: false });
    page.scrollTop = savedScrollRef.current;
    immersiveRef.current = true;
    expandedRef.current = false;
    cancelSnap();
    applyBox(frame, from, 0);
    setImmersive(true);
    setExpanded(false);
    return true;
  }, [cancelSnap]);

  const snapTo = useCallback(
    (target) => {
      cancelSnap();
      const start = progressRef.current;
      const end = target ? 1 : 0;
      if (Math.abs(end - start) < 0.001) {
        if (end === 1) lockOpen();
        else releaseToPage();
        return;
      }

      if (prefersReducedMotion()) {
        progressRef.current = end;
        if (end === 1) lockOpen();
        else releaseToPage();
        return;
      }

      snappingRef.current = true;
      if (expandedRef.current && end < 1) {
        expandedRef.current = false;
        setExpanded(false);
      }
      const started = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - started) / SNAP_MS);
        const next = lerp(start, end, SNAP_EASE(t));
        progressRef.current = next;
        paint(next);
        if (t < 1) {
          snapFrameRef.current = window.requestAnimationFrame(step);
          return;
        }
        snapFrameRef.current = 0;
        snappingRef.current = false;
        if (end === 1) lockOpen();
        else releaseToPage();
      };
      snapFrameRef.current = window.requestAnimationFrame(step);
    },
    [cancelSnap, lockOpen, paint, releaseToPage],
  );

  const scheduleSnap = useCallback(() => {
    if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
    snapTimerRef.current = window.setTimeout(() => {
      snapTimerRef.current = null;
      const progress = progressRef.current;
      if (progress <= 0 || progress >= 1) return;
      const flick = lastDeltaRef.current;
      let target;
      if (flick > FLICK_DELTA) target = 1;
      else if (flick < -FLICK_DELTA) target = 0;
      else target = progress >= 0.5 ? 1 : 0;
      snapTo(target);
    }, SNAP_IDLE_MS);
  }, [snapTo]);

  const applyDelta = useCallback(
    (deltaY) => {
      const travel = travelRef.current || MIN_TRAVEL_PX;
      const next = Math.min(1, Math.max(0, progressRef.current + deltaY / travel));
      progressRef.current = next;
      lastDeltaRef.current = deltaY;
      if (next <= 0) {
        releaseToPage();
        return;
      }
      if (next >= 1) {
        lockOpen();
        return;
      }
      if (expandedRef.current) {
        expandedRef.current = false;
        setExpanded(false);
        syncPageFlags(getPage(frameRef.current), { immersive: true, expanded: false });
      }
      paint(next);
      scheduleSnap();
    },
    [lockOpen, paint, releaseToPage, scheduleSnap],
  );

  const collapse = useCallback(() => {
    if (!immersiveRef.current) return;
    snapTo(0);
  }, [snapTo]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const page = getPage(frame);

    if (immersive) {
      if (page) page.scrollTop = savedScrollRef.current;
      return;
    }

    const pending = pendingReleaseRef.current;
    if (!pending) return;
    pendingReleaseRef.current = null;
    if (frame) clearBox(frame);
    if (page) {
      syncPageFlags(page, { immersive: false, expanded: false });
      page.scrollTop = Math.max(0, pending.scrollTop - HYSTERESIS_PX);
    }
  }, [immersive]);

  useLayoutEffect(() => {
    if (enabled) return;
    const frame = frameRef.current;
    const page = getPage(frame);
    cancelSnap();
    progressRef.current = 0;
    immersiveRef.current = false;
    expandedRef.current = false;
    pendingReleaseRef.current = null;
    if (frame) clearBox(frame);
    syncPageFlags(page, { immersive: false, expanded: false });
    setImmersive(false);
    setExpanded(false);
  }, [cancelSnap, enabled]);

  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const frame = frameRef.current;
    const page = getPage(frame);
    if (!page) return undefined;

    const onWheel = (event) => {
      if (snappingRef.current) {
        event.preventDefault();
        cancelSnap();
      }

      const scroller = scrollerRef?.current;
      const progress = progressRef.current;
      const deltaY = wheelDeltaY(event);

      if (progress <= 0) {
        if (deltaY <= 0) return;
        const frameRect = frame.getBoundingClientRect();
        if (frameRect.top - getDockTop(page) > DOCK_PX) return;
        event.preventDefault();
        if (!beginMorph()) return;
        applyDelta(deltaY);
        return;
      }

      const inspect = frame.querySelector('.pivot-curation-sheet__inspect');
      if (inspect?.contains(event.target)) return;

      if (progress >= 1) {
        if (deltaY > 0 || !atScrollerTop(scroller)) return;
        event.preventDefault();
        applyDelta(deltaY);
        return;
      }

      event.preventDefault();
      applyDelta(deltaY);
    };

    const onResize = () => {
      const nextPage = getPage(frame);
      if (!nextPage || progressRef.current <= 0) return;
      toRectRef.current = nextPage.getBoundingClientRect();
      if (slotRef.current && progressRef.current < 1) {
        fromRectRef.current = slotRef.current.getBoundingClientRect();
      }
      travelRef.current = Math.max(
        (toRectRef.current?.height || 0) - (fromRectRef.current?.height || 0),
        MIN_TRAVEL_PX,
      ) * TRAVEL_SCALE;
      paint(progressRef.current);
    };

    page.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('resize', onResize);
    return () => {
      page.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('resize', onResize);
      cancelSnap();
      syncPageFlags(page, { immersive: false, expanded: false });
    };
  }, [applyDelta, beginMorph, cancelSnap, enabled, paint, scrollerRef]);

  return { frameRef, slotRef, slotHeight, immersive, expanded, collapse };
}

export default useCurationImmersiveScroll;
