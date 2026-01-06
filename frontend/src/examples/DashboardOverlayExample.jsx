import React from 'react';
import { Icon } from '@iconify-icon/react';
import { useDashboardOverlay } from '../hooks/useDashboardOverlay';

/**
 * Example component showing how to use the Dashboard overlay functionality
 * This can be used in any component within the Dashboard
 */
function DashboardOverlayExample() {
    const { showOverlay, hideOverlay, showEventViewer } = useDashboardOverlay();

    const handleShowCustomOverlay = () => {
        showOverlay(
            <div style={{ padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <h2>Custom Overlay Content</h2>
                <p>This is an example of how to show custom content in the dashboard overlay.</p>
                <button onClick={hideOverlay} style={{ padding: '1rem 2rem', marginTop: '1rem' }}>
                    Close Overlay
                </button>
            </div>
        );
    };

    const handleShowEventViewer = () => {
        // Example event data
        const exampleEvent = {
            _id: 'example-event-id',
            name: 'Example Event',
            description: 'This is an example event for demonstration purposes.',
            start_time: new Date().toISOString(),
            end_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours later
            location: 'Example Location',
            hostingType: 'User',
            hostingId: {
                name: 'Example User',
                image: null
            }
        };

        showEventViewer(exampleEvent, {
            showBackButton: true,
            showAnalytics: false,
            showEventsByCreator: false
        });
    };

    return (
        <div style={{ padding: '2rem' }}>
            <h2>Dashboard Overlay Examples</h2>
            <p>These buttons demonstrate how to use the dashboard overlay functionality:</p>
            
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button 
                    onClick={handleShowCustomOverlay}
                    style={{ 
                        padding: '1rem 2rem', 
                        backgroundColor: '#4DAA57', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}
                >
                    <Icon icon="mdi:eye" />
                    Show Custom Overlay
                </button>
                
                <button 
                    onClick={handleShowEventViewer}
                    style={{ 
                        padding: '1rem 2rem', 
                        backgroundColor: '#6D8EFA', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}
                >
                    <Icon icon="mingcute:calendar-fill" />
                    Show Event Viewer
                </button>
            </div>
        </div>
    );
}

export default DashboardOverlayExample;
