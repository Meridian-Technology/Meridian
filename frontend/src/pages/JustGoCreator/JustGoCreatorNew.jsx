import React from 'react';
import { Link } from 'react-router-dom';
import justGoCreatorCopy from './justGoCreatorCopy';
import { JUSTGO_CREATOR_ROUTES } from './justGoCreatorRoutes';

/** Create-listing route stub (form lands in Task 4.2). */
function JustGoCreatorNew() {
  const copy = justGoCreatorCopy.newListing;

  return (
    <section>
      <p className="justgo-creator__page-eyebrow">{justGoCreatorCopy.productShortName}</p>
      <h1 className="justgo-creator__page-title">{copy.title}</h1>
      <p className="justgo-creator__page-subtitle">{copy.subtitle}</p>
      <Link className="justgo-creator__text-link" to={JUSTGO_CREATOR_ROUTES.home}>
        {copy.backToList}
      </Link>
    </section>
  );
}

export default JustGoCreatorNew;
