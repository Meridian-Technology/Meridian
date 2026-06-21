import React from 'react';
import { Icon } from '@iconify-icon/react';
import { DEMO_PHASES } from '../../utils/demoTenant';
import './demo.scss';

function DemoPhaseRail({ activePhase, onPhaseChange, onPhaseHover, disabled = false }) {
    return (
        <div className="demo-events__phase-rail" role="tablist" aria-label="Event lifecycle phases">
            {DEMO_PHASES.map((phase, index) => {
                const isActive = phase.id === activePhase;
                return (
                    <React.Fragment key={phase.id}>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            className={`demo-events__phase-btn${isActive ? ' is-active' : ''}`}
                            onClick={() => onPhaseChange(phase.id)}
                            onMouseEnter={() => onPhaseHover?.(phase.id)}
                            onFocus={() => onPhaseHover?.(phase.id)}
                            disabled={disabled}
                        >
                            <span className="demo-events__phase-dot" aria-hidden="true" />
                            {phase.label}
                        </button>
                        {index < DEMO_PHASES.length - 1 ? (
                            <span className="demo-events__phase-connector" aria-hidden="true" />
                        ) : null}
                    </React.Fragment>
                );
            })}
        </div>
    );
}

export default DemoPhaseRail;
