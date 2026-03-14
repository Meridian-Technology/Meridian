import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const SimulatedTimeContext = createContext(null);

const DEV = process.env.NODE_ENV === 'development';

function parseSimulatedTime(param) {
    if (!param || param === 'now' || param === 'clear') return null;
    const d = new Date(param);
    return isNaN(d.getTime()) ? null : d;
}

export function SimulatedTimeProvider({ children }) {
    const [searchParams, setSearchParams] = useSearchParams();
    const param = searchParams.get('simulate_time');
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!DEV || parseSimulatedTime(param)) return;
        const id = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(id);
    }, [param, DEV]);

    const now = useMemo(() => {
        if (!DEV) return new Date();
        const parsed = parseSimulatedTime(param);
        return parsed || new Date();
    }, [param, tick, DEV]);

    const setSimulatedTime = useCallback(
        (value) => {
            if (!DEV) return;
            if (value === null || value === 'now' || value === 'clear') {
                setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.delete('simulate_time');
                    return next;
                }, { replace: true });
            } else {
                const iso = value instanceof Date ? value.toISOString() : String(value);
                setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.set('simulate_time', iso);
                    return next;
                }, { replace: true });
            }
        },
        [setSearchParams, DEV]
    );

    const value = useMemo(
        () => ({
            now,
            setSimulatedTime,
            isSimulated: DEV && param !== null && param !== '',
        }),
        [now, setSimulatedTime, param]
    );

    return (
        <SimulatedTimeContext.Provider value={value}>
            {children}
        </SimulatedTimeContext.Provider>
    );
}

export function useSimulatedTime() {
    const ctx = useContext(SimulatedTimeContext);
    if (!ctx) {
        return {
            now: new Date(),
            setSimulatedTime: () => {},
            isSimulated: false,
        };
    }
    return ctx;
}
