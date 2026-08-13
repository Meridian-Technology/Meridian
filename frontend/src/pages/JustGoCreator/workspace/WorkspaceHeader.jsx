import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { Link } from 'react-router-dom';
import justGoCreatorCopy from '../justGoCreatorCopy';
import { describeIngestStatus } from '../justGoCreatorListings';
import { JUSTGO_CREATOR_ROUTES } from '../justGoCreatorRoutes';
import {
  buildPublicEventUrl,
  formatTimeUntil,
  formatWorkspaceDate,
  formatWorkspaceTime,
} from './workspaceUtils';

/**
 * Workspace masthead — the console's signature surface.
 *
 * Ported from `EventDashboardFocusedHeader` but recomposed as a submission docket rather than a
 * dashboard header, because that is what the object actually is: a listing aimed at one curated
 * drop week, awaiting a verdict the creator does not control. So the week is the document number,
 * the title is the document, and the curation state is stamped rather than badged. The stamp reuses
 * the brand's existing cut-paper grammar (hard ink stroke, slight rotation, cream field) from
 * `PivotScrapbookTitle`, spent once here so everything below it can stay quiet.
 *
 * Retains the ported header's regions (top actions, identity, figures, scroll-driven condensing)
 * and its restrictions: no Publish, no post-mortem export, no announcement sender.
 *
 * @param {object} props
 * @param {object} props.event Serialized creator listing
 * @param {object} [props.stats] `data.stats` from the detail response
 * @param {boolean} props.condensed
 * @param {() => void} props.onRefresh
 * @param {() => void} props.onUpdateListing Jumps to the Details tab
 */
function WorkspaceHeader({ event, stats, condensed, onRefresh, onUpdateListing }) {
  const copy = justGoCreatorCopy.workspace.header;
  const [copied, setCopied] = useState(false);

  const status = describeIngestStatus(event?.ingestStatus);
  const publicUrl = buildPublicEventUrl(event?._id);
  const startDate = formatWorkspaceDate(event?.start_time);
  const startTime = formatWorkspaceTime(event?.start_time);
  const endTime = formatWorkspaceTime(event?.end_time);
  const timeUntil = formatTimeUntil(event?.start_time);

  const when = startTime ? (endTime ? `${startTime} – ${endTime}` : startTime) : null;
  const dateline = [startDate, when, event?.location || copy.locationFallback]
    .filter(Boolean)
    .join(' · ');

  const handleCopyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked by permissions; the Promo QR tab shows the raw link as a fallback.
    }
  };

  return (
    <header
      className={`jg-workspace-header${condensed ? ' jg-workspace-header--condensed' : ''}`}
    >
      <div className="jg-workspace-header__top">
        <Link className="jg-workspace-header__back" to={JUSTGO_CREATOR_ROUTES.home}>
          <Icon icon="mdi:arrow-left" />
          <span>{justGoCreatorCopy.workspace.backToList}</span>
        </Link>
        <div className="jg-workspace-header__actions">
          <button
            type="button"
            className="jg-workspace-header__btn jg-workspace-header__btn--icon"
            onClick={onRefresh}
            title={copy.refresh}
            aria-label={copy.refresh}
          >
            <Icon icon="mdi:refresh" />
          </button>
          <button
            type="button"
            className="jg-workspace-header__btn"
            onClick={handleCopyLink}
            disabled={!publicUrl}
          >
            <Icon icon={copied ? 'mdi:check' : 'mdi:link-variant'} />
            <span>{copied ? copy.copied : copy.copyLink}</span>
          </button>
          {publicUrl ? (
            <a
              className="jg-workspace-header__btn"
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Icon icon="mdi:open-in-new" />
              <span>{copy.preview}</span>
            </a>
          ) : null}
          <button type="button" className="justgo-creator__cta" onClick={onUpdateListing}>
            {copy.updateListing}
          </button>
        </div>
      </div>

      <div className="jg-masthead">
        {event?.image ? (
          <img src={event.image} alt="" className="jg-masthead__thumb" />
        ) : null}

        <div className="jg-masthead__identity">
          <h1 className="jg-masthead__title">
            {event?.name || justGoCreatorCopy.workspace.title}
          </h1>
          <p className="jg-masthead__dateline">{dateline}</p>
          <p className="jg-masthead__week">
            {copy.dropWeekLabel}{' '}
            {event?.batchWeek ? (
              <span className="jg-masthead__week-value">{event.batchWeek}</span>
            ) : (
              <span>{copy.weekNone}</span>
            )}
          </p>
        </div>

        <p className={`jg-stamp jg-stamp--${status.tone}`}>{status.label}</p>
      </div>

      <dl className="jg-tally jg-tally--masthead">
        <div className="jg-tally__item">
          <dd className="jg-tally__value">{stats?.intents?.interested ?? 0}</dd>
          <dt className="jg-tally__label">{copy.interestedLabel}</dt>
        </div>
        <div className="jg-tally__item">
          <dd className="jg-tally__value">{timeUntil || '—'}</dd>
          <dt className="jg-tally__label">{copy.timeUntilLabel}</dt>
        </div>
      </dl>
    </header>
  );
}

export default WorkspaceHeader;
