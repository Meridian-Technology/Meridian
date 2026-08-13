import React from 'react';
import { Link } from 'react-router-dom';
import PivotScrapbookTitle from '../../components/PivotBranding/PivotScrapbookTitle';
import justGoCreatorCopy from './justGoCreatorCopy';
import { JUSTGO_CREATOR_ROUTES, justGoCreatorEventPath } from './justGoCreatorRoutes';
import './JustGoCreatorSubmitConfirm.scss';

/**
 * Post-submit confirmation — flare register.
 *
 * Two jobs, both expectation-setting: name the drop week the listing is now competing for, and be
 * explicit that nothing appears in the app until ops publish. Phase 1 gives host listings no
 * special consumer treatment, so we say so here rather than let creators infer otherwise.
 *
 * @param {object} props
 * @param {string} [props.batchWeek] Target drop week from the create response
 * @param {string} [props.eventId] Created listing id, for the workspace deep link
 * @param {string} [props.notice] Optional warning (e.g. cover upload failed)
 * @param {() => void} [props.onCreateAnother]
 */
function JustGoCreatorSubmitConfirm({ batchWeek, eventId, notice, onCreateAnother }) {
  const copy = justGoCreatorCopy.submitConfirm;

  return (
    <section className="jg-confirm">
      <p className="jg-confirm__eyebrow">{copy.eyebrow}</p>
      <PivotScrapbookTitle title={copy.title} as="h1" />

      {batchWeek ? (
        <p className="jg-confirm__week">
          <span className="jg-confirm__week-label">{copy.weekLabel}</span>
          <span className="jg-confirm__week-value">{batchWeek}</span>
        </p>
      ) : null}

      <p className="jg-confirm__body">{copy.body(batchWeek)}</p>
      <p className="jg-confirm__parity">{copy.parity}</p>

      {notice ? (
        <p className="jg-confirm__notice" role="status">
          {notice}
        </p>
      ) : null}

      <div className="jg-confirm__actions">
        {eventId ? (
          <Link className="justgo-creator__cta" to={justGoCreatorEventPath(eventId)}>
            {copy.openListing}
          </Link>
        ) : null}
        {onCreateAnother ? (
          <button type="button" className="jg-confirm__link" onClick={onCreateAnother}>
            {copy.createAnother}
          </button>
        ) : null}
        <Link className="jg-confirm__link" to={JUSTGO_CREATOR_ROUTES.home}>
          {copy.backToList}
        </Link>
      </div>
    </section>
  );
}

export default JustGoCreatorSubmitConfirm;
