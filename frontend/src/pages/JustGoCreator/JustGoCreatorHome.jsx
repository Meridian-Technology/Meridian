import React from 'react';
import { Link } from 'react-router-dom';
import justGoCreatorCopy from './justGoCreatorCopy';
import { JUSTGO_CREATOR_ROUTES } from './justGoCreatorRoutes';

/** Empty creator home / list shell (list UI lands in Task 4.1). */
function JustGoCreatorHome() {
  const copy = justGoCreatorCopy.home;

  return (
    <section>
      <p className="justgo-creator__badge">{copy.comingSoonBadge}</p>
      <p className="justgo-creator__page-eyebrow">{justGoCreatorCopy.productShortName}</p>
      <h1 className="justgo-creator__page-title">{copy.title}</h1>
      <p className="justgo-creator__page-subtitle">{copy.subtitle}</p>

      <div className="justgo-creator__panel">
        <h2 className="justgo-creator__panel-title">{copy.emptyTitle}</h2>
        <p className="justgo-creator__panel-body">{copy.emptyBody}</p>
        <Link className="justgo-creator__cta" to={JUSTGO_CREATOR_ROUTES.newListing}>
          {copy.emptyCta}
        </Link>
      </div>
    </section>
  );
}

export default JustGoCreatorHome;
