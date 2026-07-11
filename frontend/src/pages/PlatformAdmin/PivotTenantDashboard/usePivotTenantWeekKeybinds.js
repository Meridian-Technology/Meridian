import { useCallback, useEffect, useRef, useState } from 'react';
import { isTypingTarget } from '../PivotLab/PivotManualImportModal';

const ARROW_KEY_NAV_DEBOUNCE_MS = 140;

/**
 * Shared keyboard nav for Pivot tenant ops pages (Overview / Journeys / Curation).
 * ← / → step batch week; R refreshes. Skips when typing in inputs.
 *
 * @returns {{ keyboardNavActive: 'left'|'right'|null }}
 */
export function usePivotTenantWeekKeybinds({
  enabled = true,
  onStepWeek,
  onRefresh,
  canStepBack = true,
  canStepForward = true,
} = {}) {
  const [keyboardNavActive, setKeyboardNavActive] = useState(null);
  const debounceRef = useRef(0);
  const flashTimeoutRef = useRef(null);

  const flash = useCallback((direction) => {
    setKeyboardNavActive(direction);
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }
    flashTimeoutRef.current = setTimeout(() => {
      setKeyboardNavActive(null);
    }, 120);
  }, []);

  useEffect(
    () => () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === 'ArrowLeft') {
        if (!canStepBack || !onStepWeek) return;
        event.preventDefault();
        const now = Date.now();
        if (now - debounceRef.current < ARROW_KEY_NAV_DEBOUNCE_MS) return;
        debounceRef.current = now;
        flash('left');
        onStepWeek(-1);
        return;
      }

      if (event.key === 'ArrowRight') {
        if (!canStepForward || !onStepWeek) return;
        event.preventDefault();
        const now = Date.now();
        if (now - debounceRef.current < ARROW_KEY_NAV_DEBOUNCE_MS) return;
        debounceRef.current = now;
        flash('right');
        onStepWeek(1);
        return;
      }

      const key = String(event.key || '').toLowerCase();
      if (key === 'r' && onRefresh) {
        event.preventDefault();
        onRefresh();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onStepWeek, onRefresh, canStepBack, canStepForward, flash]);

  return { keyboardNavActive };
}

export default usePivotTenantWeekKeybinds;
