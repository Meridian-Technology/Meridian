import { useCallback, useRef } from 'react';
import axios from 'axios';
import { DEMO_PHASES } from '../utils/demoTenant';

export function useDemoPhasePrefetch({ enabled = true } = {}) {
    const prefetchedPhasesRef = useRef(new Set());

    const prefetchPhase = useCallback((phase) => {
        if (!enabled || !phase) return;
        if (prefetchedPhasesRef.current.has(phase)) return;
        prefetchedPhasesRef.current.add(phase);
        axios
            .get(`/events-demo/workspace?phase=${encodeURIComponent(phase)}`, { withCredentials: true })
            .catch(() => {
                prefetchedPhasesRef.current.delete(phase);
            });
    }, [enabled]);

    const prefetchAdjacentPhases = useCallback((activePhase) => {
        const index = DEMO_PHASES.findIndex((phase) => phase.id === activePhase);
        if (index < 0) return;
        if (index > 0) prefetchPhase(DEMO_PHASES[index - 1].id);
        if (index < DEMO_PHASES.length - 1) prefetchPhase(DEMO_PHASES[index + 1].id);
    }, [prefetchPhase]);

    return { prefetchPhase, prefetchAdjacentPhases };
}
