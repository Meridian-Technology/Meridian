import React, { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { analytics } from '../../services/analytics/analytics';
import { useDemoPhasePrefetch } from '../../hooks/useDemoPhasePrefetch';
import { DEMO_PHASES } from '../../utils/demoTenant';
import EventDashboardFocused from '../ClubDash/EventsManagement/components/EventDashboard/EventDashboardFocused';
import DemoPhaseRail from './DemoPhaseRail';
import './demo.scss';

function DemoEventSandbox({ session, onLogout, onPhaseView }) {
    const [searchParams, setSearchParams] = useSearchParams();
    const phase = searchParams.get('phase') || 'planning';
    const { manifest, credential } = session;
    const { prefetchPhase, prefetchAdjacentPhases } = useDemoPhasePrefetch({ enabled: Boolean(manifest?.eventId) });

    const validPhase = useMemo(
        () => (DEMO_PHASES.some((item) => item.id === phase) ? phase : 'planning'),
        [phase]
    );

    const workspaceUrl = manifest?.orgId && manifest?.eventId
        ? `/events-demo/workspace?phase=${encodeURIComponent(validPhase)}`
        : null;

    const eventStub = useMemo(() => (
        manifest?.eventId ? { _id: manifest.eventId } : null
    ), [manifest?.eventId]);

    const eventName = manifest?.eventName || 'Spring Community Night';

    const handlePhaseChange = useCallback((nextPhase) => {
        setSearchParams({ phase: nextPhase }, { replace: false });
        onPhaseView?.(nextPhase);
        analytics.track('demo_phase_view', {
            phase: nextPhase,
            credentialId: credential?.id,
        });
    }, [credential?.id, onPhaseView, setSearchParams]);

    const handlePhaseHover = useCallback((hoverPhase) => {
        prefetchPhase(hoverPhase);
    }, [prefetchPhase]);

    useEffect(() => {
        onPhaseView?.(validPhase);
        analytics.track('demo_phase_view', {
            phase: validPhase,
            credentialId: credential?.id,
        });
    }, [credential?.id, onPhaseView, validPhase]);

    useEffect(() => {
        prefetchAdjacentPhases(validPhase);
    }, [prefetchAdjacentPhases, validPhase]);

    if (!manifest?.orgId || !manifest?.eventId) {
        return (
            <div className="demo-events demo-events--state">
                <Icon icon="mdi:alert-circle-outline" />
                <p>Demo data is not ready yet. Ask an admin to run the demo seed.</p>
            </div>
        );
    }

    return (
        <div className="demo-events demo-events--sandbox">
            <header className="demo-events__topbar">
                <div className="demo-events__topbar-left">
                    <span className="demo-events__badge">Meridian Demo</span>
                    <span className="demo-events__event-name">{eventName}</span>
                </div>
                <button type="button" className="demo-events__logout" onClick={onLogout}>
                    Log out
                </button>
            </header>

            <DemoPhaseRail
                activePhase={validPhase}
                onPhaseChange={handlePhaseChange}
                onPhaseHover={handlePhaseHover}
            />

            <div className="demo-events__workspace" key={validPhase}>
                <EventDashboardFocused
                    event={eventStub}
                    orgId={manifest.orgId}
                    demoMode
                    readOnly
                    hideCloseButton
                    workflowPhaseOverride={validPhase}
                    dashboardFetchUrl={workspaceUrl}
                    demoCredentialId={credential?.id}
                    className="demo-events__dashboard"
                />
            </div>

            <footer className="demo-events__sandbox-footer">
                Demo mode — changes are not saved · <a href="https://meridian.study" target="_blank" rel="noreferrer">meridian.study</a>
            </footer>
        </div>
    );
}

export default DemoEventSandbox;
