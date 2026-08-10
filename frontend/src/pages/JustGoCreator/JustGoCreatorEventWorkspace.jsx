import React from 'react';
import { Link, useParams } from 'react-router-dom';
import justGoCreatorCopy from './justGoCreatorCopy';
import { JUSTGO_CREATOR_ROUTES } from './justGoCreatorRoutes';

/** Focused dashboard route stub (port lands in Task 4.3). */
function JustGoCreatorEventWorkspace() {
  const { eventId } = useParams();
  const copy = justGoCreatorCopy.workspace;

  return (
    <section>
      <p className="justgo-creator__page-eyebrow">{justGoCreatorCopy.productShortName}</p>
      <h1 className="justgo-creator__page-title">{copy.title}</h1>
      <p className="justgo-creator__page-subtitle">
        {copy.subtitle}
        {eventId ? ` (${eventId})` : ''}
      </p>
      <Link className="justgo-creator__text-link" to={JUSTGO_CREATOR_ROUTES.home}>
        {copy.backToList}
      </Link>
    </section>
  );
}

export default JustGoCreatorEventWorkspace;
