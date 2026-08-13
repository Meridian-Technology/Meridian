import React from 'react';
import { Icon } from '@iconify-icon/react';
import justGoCreatorCopy from '../justGoCreatorCopy';
import { resolvePhaseRail } from './workspaceUtils';

/**
 * Phase rail — Drafting → Planning → Run of Show → Post Mortem.
 *
 * The original dashboard derives a phase but never shows it; a creator has less context than an org
 * admin about where a listing sits, so we render it. Read-only: the phase follows curation state and
 * the clock, so nothing here is a control.
 */
function WorkspacePhaseRail({ phase }) {
  const steps = resolvePhaseRail(phase);

  return (
    <ol className="jg-phase-rail" aria-label={justGoCreatorCopy.workspace.railLabel}>
      {steps.map((step) => (
        <li
          key={step.id}
          className={`jg-phase-rail__step jg-phase-rail__step--${step.state}`}
          aria-current={step.state === 'current' ? 'step' : undefined}
        >
          <span className="jg-phase-rail__marker" aria-hidden="true">
            {step.state === 'complete' ? <Icon icon="mdi:check" /> : null}
          </span>
          <span className="jg-phase-rail__label">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

export default WorkspacePhaseRail;
