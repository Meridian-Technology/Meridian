import { useState, useCallback } from 'react';

const useLoadingState = (initialState = {}) => {
    const [loadingStates, setLoadingStates] = useState(initialState);

    const setLoading = useCallback((key, isLoading, message = 'Loading...') => {
        setLoadingStates(prev => ({
            ...prev,
            [key]: { isLoading, message }
        }));
    }, []);

    const setLoadingMessage = useCallback((key, message) => {
        setLoadingStates(prev => ({
            ...prev,
            [key]: { ...prev[key], message }
        }));
    }, []);

    const clearLoading = useCallback((key) => {
        setLoadingStates(prev => {
            const newState = { ...prev };
            delete newState[key];
            return newState;
        });
    }, []);

    const clearAllLoading = useCallback(() => {
        setLoadingStates({});
    }, []);

    const isAnyLoading = useCallback(() => {
        return Object.values(loadingStates).some(state => state.isLoading);
    }, [loadingStates]);

    const getLoadingState = useCallback((key) => {
        return loadingStates[key] || { isLoading: false, message: 'Loading...' };
    }, [loadingStates]);

    return {
        loadingStates,
        setLoading,
        setLoadingMessage,
        clearLoading,
        clearAllLoading,
        isAnyLoading,
        getLoadingState
    };
};

export default useLoadingState;
