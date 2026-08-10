import React from 'react';
import justGoCreatorCopy from '../justGoCreatorCopy';

/**
 * Interests tab — aggregate counts only.
 *
 * Phase 1 deliberately has no per-person list: the consumer side records intent, not identity we
 * are willing to hand a host. Numbers are the same `PivotEventIntent` aggregates ops read.
 */
function WorkspaceInterestsTab({ event, stats }) {
  const copy = justGoCreatorCopy.workspace.interests;
  const intents = stats?.intents;

  const counts = [
    { id: 'interested', label: copy.interested, value: intents?.interested ?? 0 },
    { id: 'registered', label: copy.gotTicket, value: intents?.registered ?? 0 },
    { id: 'passed', label: copy.passed, value: intents?.passed ?? 0 },
    { id: 'opens', label: copy.linkTaps, value: intents?.externalOpens ?? 0 },
    { id: 'openUsers', label: copy.linkTapUsers, value: intents?.externalOpenUsers ?? 0 },
  ];

  const hasAnySignal = counts.some((entry) => entry.value > 0);
  const isPublished = event?.ingestStatus === 'published';

  return (
    <div className="jg-workspace-tab">
      <section className="jg-workspace-tab__section">
        <h2 className="jg-workspace-tab__title">{copy.title}</h2>
        <p className="jg-workspace-tab__subtitle">{copy.subtitle}</p>

        {hasAnySignal ? (
          <dl className="jg-tally">
            {counts.map((entry) => (
              <div key={entry.id} className="jg-tally__item">
                <dd className="jg-tally__value">{entry.value}</dd>
                <dt className="jg-tally__label">{entry.label}</dt>
              </div>
            ))}
          </dl>
        ) : (
          <div className="justgo-creator__panel">
            <p className="justgo-creator__panel-title">{copy.emptyTitle}</p>
            <p className="justgo-creator__panel-body">
              {isPublished ? copy.emptyBody : justGoCreatorCopy.workspace.explainer.draftBody}
            </p>
          </div>
        )}

        <p className="jg-workspace-tab__note">{copy.perPersonNote}</p>
      </section>
    </div>
  );
}

export default WorkspaceInterestsTab;
