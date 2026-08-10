import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import justGoCreatorCopy from './justGoCreatorCopy';
import JustGoCreatorListingForm from './JustGoCreatorListingForm';
import JustGoCreatorSubmitConfirm from './JustGoCreatorSubmitConfirm';
import { JUSTGO_CREATOR_ROUTES } from './justGoCreatorRoutes';

/** Create a listing. On success the page becomes the flare-register confirmation. */
function JustGoCreatorNew() {
  const copy = justGoCreatorCopy.newListing;
  const { user } = useAuth();
  const [created, setCreated] = useState(null);

  if (created) {
    return (
      <JustGoCreatorSubmitConfirm
        batchWeek={created.batchWeek}
        eventId={created.event?._id}
        notice={created.coverUploaded === false ? justGoCreatorCopy.form.coverUploadFailed : null}
        onCreateAnother={() => setCreated(null)}
      />
    );
  }

  return (
    <section>
      <h1 className="justgo-creator__page-title">{copy.title}</h1>
      <p className="justgo-creator__page-subtitle">{copy.subtitle}</p>

      <JustGoCreatorListingForm
        mode="create"
        defaultHostName={user?.name || ''}
        onCreated={setCreated}
      />

      <p className="justgo-creator__back">
        <Link className="justgo-creator__text-link" to={JUSTGO_CREATOR_ROUTES.home}>
          {copy.backToList}
        </Link>
      </p>
    </section>
  );
}

export default JustGoCreatorNew;
