import React from 'react';
import PivotScrapbookTitle from '../../components/PivotBranding/PivotScrapbookTitle';
import justGoCreatorCopy from './justGoCreatorCopy';
import './JustGoCreatorGate.scss';

/**
 * Invite-only gate — shown when `requirePivotCreator` rejects the session (403).
 *
 * Flare register: scrapbook strips, burst sticker, consumer voice. This is a Just Go flow, not a
 * ported Meridian screen, so it gets the full brand treatment.
 *
 * @param {object} props
 * @param {string} [props.code] Stable backend code (`CREATOR_FORBIDDEN`, `NOT_PIVOT_TENANT`, …)
 * @param {string} [props.city] City label for context
 * @param {string} [props.signedInAs] Email / name of the current session
 */
function JustGoCreatorGate({ code, city, signedInAs }) {
  const copy = justGoCreatorCopy.gate;
  const wrongTenant = code === 'NOT_PIVOT_TENANT' || code === 'CREATOR_TENANT_REQUIRED';

  let body = copy.forbiddenBody;
  if (wrongTenant) {
    body = copy.wrongTenantBody;
  } else if (city) {
    body = copy.forbiddenBodyWithCity(city);
  }

  return (
    <section className="justgo-gate">
      <p className="justgo-gate__eyebrow">{copy.eyebrow}</p>
      <PivotScrapbookTitle title={copy.title} splitWords={false} />
      <p className="justgo-gate__body">{body}</p>
      {signedInAs ? (
        <p className="justgo-gate__session">
          <span className="justgo-gate__session-label">{copy.signedInAs}</span>
          <span className="justgo-gate__session-value">{signedInAs}</span>
        </p>
      ) : null}
    </section>
  );
}

export default JustGoCreatorGate;
