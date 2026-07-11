import { useCallback, useEffect, useRef, useState } from 'react';
import { isValidIsoWeek } from '../../../utils/pivotIsoWeek';

const DEFAULT_DELAY_MS = 350;

/**
 * Immediate UI week + debounced committed week for fetches / URL sync.
 * Menu picks can pass `{ immediate: true }` to skip the debounce.
 */
export function usePivotBatchWeekState(initialWeek, delayMs = DEFAULT_DELAY_MS) {
  const [batchWeek, setBatchWeekState] = useState(initialWeek);
  const [committedWeek, setCommittedWeek] = useState(initialWeek);
  const batchWeekRef = useRef(batchWeek);
  batchWeekRef.current = batchWeek;

  useEffect(() => {
    if (batchWeek === committedWeek) return undefined;
    const id = setTimeout(() => {
      setCommittedWeek(batchWeek);
    }, delayMs);
    return () => clearTimeout(id);
  }, [batchWeek, committedWeek, delayMs]);

  const setBatchWeek = useCallback((weekOrUpdater, options = {}) => {
    const current = batchWeekRef.current;
    const next =
      typeof weekOrUpdater === 'function' ? weekOrUpdater(current) : weekOrUpdater;
    batchWeekRef.current = next;
    setBatchWeekState(next);
    if (options.immediate) {
      setCommittedWeek(next);
    }
  }, []);

  return {
    batchWeek,
    committedWeek,
    setBatchWeek,
    batchWeekValid: isValidIsoWeek(batchWeek),
    committedWeekValid: isValidIsoWeek(committedWeek),
    weekSettled: batchWeek === committedWeek,
  };
}

export default usePivotBatchWeekState;
