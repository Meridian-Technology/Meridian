import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { isJustGoHost } from '../../config/tenantRedirect';
import { JUSTGO_WORDMARK_1298, JUSTGO_WORDMARK_SRCSET } from './justGoHeroAssets';
import { applyJustGoDocumentMeta } from './justGoDocumentMeta';
import { useJustGoLandingCopy } from './justGoLandingCopy';
import {
  buildLandingQrHopTo,
  guessLandingQrHopTo,
  scanLandingQr,
} from './justGoLandingTracking';
import './JustGoLanding.scss';

/**
 * justgo.lol/qr/:name — open the city landing first when the name encodes
 * the city (`sf-1`), then count the scan in the background.
 */
function JustGoQrHop() {
  const { name } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const copy = useJustGoLandingCopy();
  const justGoHost = isJustGoHost();
  const [failed, setFailed] = useState(false);
  const homeTo = justGoHost ? '/' : '/justgo';
  const optimisticTo = guessLandingQrHopTo({
    name,
    search: location.search,
    justGoHost,
  });

  useEffect(() => {
    applyJustGoDocumentMeta();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hop() {
      const result = await scanLandingQr({ name, search: location.search });
      if (cancelled) return;
      if (result.error) {
        if (!optimisticTo) setFailed(true);
        return;
      }
      const next = buildLandingQrHopTo({
        tenantKey: result.data.tenantKey,
        name: result.data.name || name,
        search: location.search,
        justGoHost,
      });
      if (next !== optimisticTo) {
        navigate(next, { replace: true });
      }
    }

    hop();
    return () => {
      cancelled = true;
    };
  }, [name, location.search, navigate, justGoHost, optimisticTo]);

  if (optimisticTo && !failed) {
    return <Navigate to={optimisticTo} replace />;
  }

  return (
    <main
      className="justgo-landing justgo-qr-hop"
      data-testid="justgo-qr-hop"
      aria-busy={!failed}
    >
      <Link to={homeTo} className="justgo-qr-hop__mark">
        <img
          src={JUSTGO_WORDMARK_1298}
          srcSet={JUSTGO_WORDMARK_SRCSET}
          sizes="7rem"
          alt={copy.wordmarkAlt}
          width={1298}
          height={782}
          decoding="async"
          draggable={false}
        />
      </Link>
      {failed ? (
        <>
          <h1>{copy.qrMissingTitle}</h1>
          <p>{copy.qrMissingBody}</p>
          {name ? <p className="justgo-qr-hop__name">{name}</p> : null}
          <Link className="justgo-landing__cta" to={homeTo}>
            {copy.qrBack}
          </Link>
        </>
      ) : null}
    </main>
  );
}

export default JustGoQrHop;
