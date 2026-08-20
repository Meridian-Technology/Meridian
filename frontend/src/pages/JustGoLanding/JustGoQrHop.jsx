import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import justGoWordmark from '../../assets/pivot/just-go-wordmark.svg';
import { isJustGoHost } from '../../config/tenantRedirect';
import { useJustGoLandingCopy } from './justGoLandingCopy';
import { buildLandingQrHopTo, scanLandingQr } from './justGoLandingTracking';
import './JustGoLanding.scss';

/**
 * justgo.lol/qr/:name — look up the global code, count the scan, hop to the city landing.
 */
function JustGoQrHop() {
  const { name } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const copy = useJustGoLandingCopy();
  const justGoHost = isJustGoHost();
  const [failed, setFailed] = useState(false);
  const homeTo = justGoHost ? '/' : '/justgo';

  useEffect(() => {
    let cancelled = false;

    async function hop() {
      const result = await scanLandingQr({ name, search: location.search });
      if (cancelled) return;
      if (result.error) {
        setFailed(true);
        return;
      }
      navigate(
        buildLandingQrHopTo({
          tenantKey: result.data.tenantKey,
          name: result.data.name || name,
          search: location.search,
          justGoHost,
        }),
        { replace: true },
      );
    }

    hop();
    return () => {
      cancelled = true;
    };
  }, [name, location.search, navigate, justGoHost]);

  return (
    <main
      className="justgo-landing justgo-qr-hop"
      data-testid="justgo-qr-hop"
      aria-busy={!failed}
    >
      <Link to={homeTo} className="justgo-qr-hop__mark">
        <img src={justGoWordmark} alt={copy.wordmarkAlt} draggable={false} />
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
