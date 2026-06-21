import { useCallback, useEffect, useRef } from 'react';
import { analytics } from '../services/analytics/analytics';

export function useDemoSessionTracking({ isAuthenticated, credentialId }) {
    const sessionStartedAtRef = useRef(null);
    const phasesVisitedRef = useRef(new Set());

    useEffect(() => {
        if (!isAuthenticated) {
            sessionStartedAtRef.current = null;
            phasesVisitedRef.current = new Set();
            return undefined;
        }

        sessionStartedAtRef.current = Date.now();
        phasesVisitedRef.current = new Set();

        const handleUnload = () => {
            if (!sessionStartedAtRef.current) return;
            analytics.track('demo_session_end', {
                reason: 'unload',
                durationMs: Date.now() - sessionStartedAtRef.current,
                phasesVisited: Array.from(phasesVisitedRef.current),
                credentialId: credentialId || undefined,
            });
        };

        window.addEventListener('beforeunload', handleUnload);
        return () => window.removeEventListener('beforeunload', handleUnload);
    }, [credentialId, isAuthenticated]);

    const recordPhaseView = useCallback((phase) => {
        if (!phase) return;
        phasesVisitedRef.current.add(phase);
    }, []);

    const endSession = useCallback((reason = 'logout') => {
        if (!sessionStartedAtRef.current) return;
        analytics.track('demo_session_end', {
            reason,
            durationMs: Date.now() - sessionStartedAtRef.current,
            phasesVisited: Array.from(phasesVisitedRef.current),
            credentialId: credentialId || undefined,
        });
        sessionStartedAtRef.current = null;
        phasesVisitedRef.current = new Set();
    }, [credentialId]);

    return { recordPhaseView, endSession };
}
