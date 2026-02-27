import React, { createContext, useContext } from 'react';

const DashboardContext = createContext();

export const useDashboard = () => {
    const context = useContext(DashboardContext);
    if (!context) {
        throw new Error('useDashboard must be used within a DashboardProvider');
    }
    return context;
};

/** Returns context or null if outside provider - use for overlay with navigate fallback */
export const useDashboardOptional = () => useContext(DashboardContext);

export const DashboardProvider = ({ children, setOverlayContent }) => {
    const showOverlay = (content) => {
        setOverlayContent(content);
    };

    const hideOverlay = () => {
        setOverlayContent(null);
    };

    return (
        <DashboardContext.Provider value={{ showOverlay, hideOverlay }}>
            {children}
        </DashboardContext.Provider>
    );
};
