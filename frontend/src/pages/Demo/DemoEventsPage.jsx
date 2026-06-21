import React, { useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useDemoSession } from '../../hooks/useDemoSession';
import { useDemoSessionTracking } from '../../hooks/useDemoSessionTracking';
import DemoEventLogin from './DemoEventLogin';
import DemoEventSandbox from './DemoEventSandbox';
import DemoNavigationGuard from './DemoNavigationGuard';
import './demo.scss';

function DemoEventsPage() {
    const session = useDemoSession();
    const { recordPhaseView, endSession } = useDemoSessionTracking({
        isAuthenticated: session.isAuthenticated,
        credentialId: session.credential?.id,
    });

    useEffect(() => {
        document.title = 'Meridian Event Demo';
    }, []);

    const handleLogout = async () => {
        endSession('logout');
        await session.logout();
    };

    if (session.loading) {
        return (
            <div className="demo-events demo-events--state">
                <Icon icon="mdi:loading" className="demo-events__spin" />
                <span>Loading demo…</span>
            </div>
        );
    }

    if (!session.isAuthenticated) {
        return (
            <DemoEventLogin
                onLogin={session.login}
                error={session.error}
                onClearError={() => session.setError(null)}
            />
        );
    }

    return (
        <DemoNavigationGuard>
            <DemoEventSandbox
                session={session}
                onLogout={handleLogout}
                onPhaseView={recordPhaseView}
            />
        </DemoNavigationGuard>
    );
}

export default DemoEventsPage;
