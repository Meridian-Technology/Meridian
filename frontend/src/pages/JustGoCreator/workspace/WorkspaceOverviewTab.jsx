import React from 'react';
import justGoCreatorCopy from '../justGoCreatorCopy';
import { totalViewCount } from './insightsUtils';
import {
  formatWorkspaceDate,
  formatWorkspaceTime,
  prettifyTagSlug,
} from './workspaceUtils';

/** Curation-state explainer — the flare overlay on an otherwise calm tab. */
function IngestExplainer({ event }) {
  const copy = justGoCreatorCopy.workspace.explainer;
  const ingestStatus = event?.ingestStatus || 'draft';

  const byStatus = {
    draft: { title: copy.draftTitle, body: copy.draftBody },
    staged: { title: copy.stagedTitle, body: copy.stagedBody },
    published: { title: copy.publishedTitle, body: copy.publishedBody },
  };
  const state = byStatus[ingestStatus] || byStatus.draft;

  return (
    <aside className={`jg-explainer jg-explainer--${ingestStatus}`}>
      <p className="jg-explainer__title">{state.title}</p>
      <p className="jg-explainer__body">{state.body}</p>
      <p className="jg-explainer__week">
        {event?.batchWeek ? copy.dropWeek(event.batchWeek) : copy.dropWeekUnknown}
      </p>
      <p className="jg-explainer__parity">{copy.parity}</p>
    </aside>
  );
}

function Tally({ label, value }) {
  return (
    <div className="jg-tally__item">
      <dd className="jg-tally__value">{value ?? 0}</dd>
      <dt className="jg-tally__label">{label}</dt>
    </div>
  );
}

function SummaryRow({ label, children }) {
  return (
    <div className="jg-summary__row">
      <span className="jg-summary__label">{label}</span>
      <div className="jg-summary__value">{children}</div>
    </div>
  );
}

/**
 * Overview tab — hero numbers plus a read-only summary of what the creator submitted.
 *
 * Numbers come straight from the detail response's `stats` and are the same aggregates ops see, so
 * nothing here can drift from the ops dashboard. No native commerce metrics are implied.
 */
function WorkspaceOverviewTab({ event, stats }) {
  const copy = justGoCreatorCopy.workspace.overview;
  const intents = stats?.intents;
  const analytics = stats?.analytics;

  const startDate = formatWorkspaceDate(event?.start_time);
  const startTime = formatWorkspaceTime(event?.start_time);
  const endTime = formatWorkspaceTime(event?.end_time);
  const tags = Array.isArray(event?.tags) ? event.tags : [];

  return (
    <div className="jg-workspace-tab">
      <IngestExplainer event={event} />

      <section className="jg-workspace-tab__section">
        <h2 className="jg-workspace-tab__title">{copy.numbersTitle}</h2>
        <dl className="jg-tally">
          <Tally label={copy.interested} value={intents?.interested} />
          <Tally label={copy.gotTicket} value={intents?.registered} />
          <Tally label={copy.linkTaps} value={intents?.externalOpens} />
          <Tally label={copy.views} value={totalViewCount(analytics)} />
        </dl>
      </section>

      <section className="jg-workspace-tab__section">
        <h2 className="jg-workspace-tab__title">{copy.summaryTitle}</h2>
        <div className="jg-summary">
          <p className="jg-summary__description">
            {event?.description || copy.noDescription}
          </p>
          <SummaryRow label={copy.whenLabel}>
            {startDate ? (
              <span>
                {startDate}
                {startTime ? ` · ${startTime}` : ''}
                {endTime ? ` – ${endTime}` : ''}
              </span>
            ) : (
              <span>—</span>
            )}
          </SummaryRow>
          <SummaryRow label={copy.whereLabel}>
            <span>{event?.location || '—'}</span>
          </SummaryRow>
          <SummaryRow label={copy.hostLabel}>
            <span>{event?.host?.name || event?.organizerName || '—'}</span>
          </SummaryRow>
          <SummaryRow label={copy.tagsLabel}>
            {tags.length ? (
              <span className="jg-summary__tags">
                {tags.map((slug) => (
                  <span key={slug} className="jg-summary__tag">
                    {prettifyTagSlug(slug)}
                  </span>
                ))}
              </span>
            ) : (
              <span>{copy.noTags}</span>
            )}
          </SummaryRow>
          <SummaryRow label={copy.linkLabel}>
            {event?.externalLink ? (
              <a href={event.externalLink} target="_blank" rel="noreferrer">
                {event.externalLink}
              </a>
            ) : (
              <span>{copy.noLink}</span>
            )}
          </SummaryRow>
        </div>
      </section>
    </div>
  );
}

export default WorkspaceOverviewTab;
