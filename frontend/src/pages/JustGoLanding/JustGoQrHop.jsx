import React from 'react';
import { Link, useParams } from 'react-router-dom';
import justGoWordmark from '../../assets/pivot/just-go-wordmark.svg';
import justGoLandingCopy from './justGoLandingCopy';
import './JustGoLanding.scss';

/**
 * justgo.lol/qr/:name — Phase 5 will look up the global code and redirect.
 * Registered now so /qr/:name is not eaten as a city slug.
 */
function JustGoQrHop() {
  const { name } = useParams();
  const copy = justGoLandingCopy;

  return (
    <main className="justgo-landing justgo-qr-hop" data-testid="justgo-qr-hop">
      <Link to="/" className="justgo-qr-hop__mark">
        <img src={justGoWordmark} alt={copy.wordmarkAlt} draggable={false} />
      </Link>
      <h1>{copy.qrMissingTitle}</h1>
      <p>{copy.qrMissingBody}</p>
      {name ? <p className="justgo-qr-hop__name">{name}</p> : null}
      <Link className="justgo-landing__cta" to="/">
        {copy.qrBack}
      </Link>
    </main>
  );
}

export default JustGoQrHop;
