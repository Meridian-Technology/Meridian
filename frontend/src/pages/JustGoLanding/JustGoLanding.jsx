import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import apiRequest from '../../utils/postRequest';
import { analytics } from '../../services/analytics/analytics';
import justGoWordmark from '../../assets/pivot/just-go-wordmark.svg';
import justGoBurst from '../../assets/pivot/just-go-burst.svg';
import { JUSTGO_CREATOR_ROUTES } from '../JustGoCreator/justGoCreatorRoutes';
import justGoLandingCopy, {
  JUSTGO_IOS_STORE_URL,
  JUSTGO_LANDING_PATH,
  JUSTGO_PLAY_STORE_URL,
} from './justGoLandingCopy';
import { JUSTGO_LANDING_FLYERS } from './justGoLandingFlyers';
import JustGoLandingDeck from './JustGoLandingDeck';
import {
  cityChipLabel,
  decorateFlyers,
  detectStorePlatform,
  formatIsoWeekToken,
} from './justGoLandingUtils';
import './JustGoLanding.scss';

const APP_STORE_BADGE =
  'https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg';

function useStorePlatform() {
  return useMemo(() => {
    if (typeof navigator === 'undefined') return 'ios';
    return detectStorePlatform(navigator.userAgent || navigator.vendor || '');
  }, []);
}

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(min-width: 900px)').matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(min-width: 900px)');
    const update = () => setDesktop(media.matches);
    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  return desktop;
}

function useHeroCtaVisible() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver !== 'function') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function storeUrlFor(platform) {
  return platform === 'android' ? JUSTGO_PLAY_STORE_URL : JUSTGO_IOS_STORE_URL;
}

function FlyerCard({ flyer }) {
  const isPhoto = flyer.tone === 'photo' && flyer.cover;
  return (
    <article className={`justgo-landing__flyer justgo-landing__flyer--${flyer.tone}`}>
      {isPhoto ? (
        <div className="justgo-landing__flyer-cover">
          <img src={flyer.cover} alt="" draggable={false} />
        </div>
      ) : (
        <h3 className="justgo-landing__flyer-cover justgo-landing__flyer-cover--field">
          <span>{flyer.title}</span>
        </h3>
      )}
      <div className="justgo-landing__flyer-meta">
        <p className="justgo-landing__flyer-tag">{flyer.tag}</p>
        {isPhoto ? <h3>{flyer.title}</h3> : null}
        <p className="justgo-landing__flyer-when">
          {flyer.when}
          {flyer.city ? ` · ${String(flyer.city).toLowerCase()}` : ''}
        </p>
      </div>
    </article>
  );
}

function JustGoLanding() {
  const platform = useStorePlatform();
  const desktop = useIsDesktop();
  const storeUrl = storeUrlFor(platform);
  const { ref: ctaRef, visible: ctaVisible } = useHeroCtaVisible();
  const week = useMemo(() => formatIsoWeekToken(), []);
  const [cities, setCities] = useState([]);
  const [citiesState, setCitiesState] = useState('loading');
  const [qrValue, setQrValue] = useState('');

  useEffect(() => {
    document.title = justGoLandingCopy.documentTitle;
    const theme = document.querySelector('meta[name="theme-color"]');
    const description = document.querySelector('meta[name="description"]');
    const previousTheme = theme?.getAttribute('content');
    const previousDescription = description?.getAttribute('content');
    if (theme) theme.setAttribute('content', '#1E1A16');
    if (description) {
      description.setAttribute('content', justGoLandingCopy.metaDescription);
    }
    analytics.screen('Just Go Landing');
    return () => {
      document.title = 'Meridian';
      if (theme && previousTheme != null) theme.setAttribute('content', previousTheme);
      if (description && previousDescription != null) {
        description.setAttribute('content', previousDescription);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setQrValue(`${window.location.origin}${JUSTGO_LANDING_PATH}`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiRequest('/pivot/cities', null, { method: 'GET' })
      .then((res) => {
        if (cancelled) return;
        const next = Array.isArray(res?.data?.cities) ? res.data.cities : [];
        setCities(next);
        setCitiesState(next.length ? 'ready' : 'empty');
      })
      .catch(() => {
        if (!cancelled) {
          setCities([]);
          setCitiesState('empty');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const flyers = useMemo(() => decorateFlyers(JUSTGO_LANDING_FLYERS, cities), [cities]);
  const cityLabels = useMemo(
    () => cities.map(cityChipLabel).filter(Boolean),
    [cities],
  );

  const showSticky = !ctaVisible;

  return (
    <div className="justgo-landing">
      <a className="justgo-landing__skip" href="#drop">
        {justGoLandingCopy.skip}
      </a>

      <div className="justgo-landing__ticker">
        <p className="justgo-landing__ticker-track" aria-hidden="true">
          {[0, 1, 2].map((pass) => (
            <span className="justgo-landing__ticker-segment" key={pass}>
              {justGoLandingCopy.ticker}
            </span>
          ))}
        </p>
        <span className="justgo-landing__ticker-label">{justGoLandingCopy.ticker}</span>
      </div>

      <header className="justgo-landing__hero">
        <span className="justgo-landing__grain" aria-hidden="true" />
        <nav className="justgo-landing__nav" aria-label="just go">
          <img
            className="justgo-landing__wordmark"
            src={justGoWordmark}
            alt={justGoLandingCopy.wordmarkAlt}
            draggable={false}
          />
          <a className="justgo-landing__nav-cta" href={storeUrl}>
            {justGoLandingCopy.cta}
          </a>
        </nav>

        <p className="justgo-landing__stamp">
          <span>{justGoLandingCopy.stampLabel}</span>
          <strong>{week}</strong>
        </p>

        <div className="justgo-landing__hero-copy">
          <h1 className="justgo-landing__headline">
            <span className="justgo-landing__strip justgo-landing__strip--cream">
              {justGoLandingCopy.headlineLead}
            </span>
            <span className="justgo-landing__strip justgo-landing__strip--pop">
              {justGoLandingCopy.headlinePop}
            </span>
          </h1>
          <p className="justgo-landing__subhead">{justGoLandingCopy.subhead}</p>

          <div className="justgo-landing__cta-row" ref={ctaRef} id="download">
            <a
              className="justgo-landing__cta"
              href={storeUrl}
              aria-label={
                platform === 'android'
                  ? justGoLandingCopy.ctaAriaAndroid
                  : justGoLandingCopy.ctaAriaIos
              }
            >
              {justGoLandingCopy.cta}
            </a>
            {platform === 'android' ? (
              <a
                className="justgo-landing__store"
                href={JUSTGO_PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                get it on google play
              </a>
            ) : (
              <a
                className="justgo-landing__store justgo-landing__store--badge"
                href={JUSTGO_IOS_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={justGoLandingCopy.ctaAriaIos}
              >
                <img src={APP_STORE_BADGE} alt="Download on the App Store" height="40" />
              </a>
            )}
            {desktop && qrValue ? (
              <div className="justgo-landing__qr">
                <QRCodeSVG
                  value={qrValue}
                  size={88}
                  bgColor="#FAF6EF"
                  fgColor="#1A1714"
                  level="M"
                />
                <span>{justGoLandingCopy.storeEyebrow}</span>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {desktop ? (
        <section className="justgo-landing__cities" aria-live="polite">
          <p className="justgo-landing__eyebrow">{justGoLandingCopy.citiesEyebrow}</p>
          {citiesState === 'loading' ? (
            <p className="justgo-landing__muted">{justGoLandingCopy.citiesLoading}</p>
          ) : null}
          {citiesState === 'empty' ? (
            <p className="justgo-landing__muted">{justGoLandingCopy.citiesEmpty}</p>
          ) : null}
          {cityLabels.length ? (
            <ul className="justgo-landing__city-list">
              {cityLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="justgo-landing__drop" id="drop">
        {desktop ? (
          <>
            <div className="justgo-landing__drop-copy">
              <p className="justgo-landing__eyebrow">{justGoLandingCopy.flyersEyebrow}</p>
              <h2>{justGoLandingCopy.flyersTitle}</h2>
              <p>{justGoLandingCopy.flyersBody}</p>
            </div>
            <img
              className="justgo-landing__burst"
              src={justGoBurst}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
            <div className="justgo-landing__flyers">
              {flyers.map((flyer) => (
                <FlyerCard key={flyer.id} flyer={flyer} />
              ))}
            </div>
          </>
        ) : (
          <JustGoLandingDeck
            cities={cities}
            citiesState={citiesState}
            platform={platform}
          />
        )}
      </section>

      <section className="justgo-landing__loop">
        <p className="justgo-landing__eyebrow">{justGoLandingCopy.loopEyebrow}</p>
        <ul>
          {justGoLandingCopy.loop.map((step) => (
            <li key={step.chip}>
              <span>{step.chip}</span>
              <p>{step.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="justgo-landing__footer">
        <img
          className="justgo-landing__footer-mark"
          src={justGoWordmark}
          alt={justGoLandingCopy.wordmarkAlt}
          draggable={false}
        />
        <a className="justgo-landing__cta justgo-landing__cta--footer" href={storeUrl}>
          {justGoLandingCopy.cta}
        </a>
        <p className="justgo-landing__host">
          {justGoLandingCopy.footerHost}{' '}
          <Link to={JUSTGO_CREATOR_ROUTES.login}>{justGoLandingCopy.footerHostLink}</Link>
        </p>
        <p className="justgo-landing__note">
          {justGoLandingCopy.footerNote}{' '}
          <a href={`mailto:${justGoLandingCopy.footerEmail}`}>{justGoLandingCopy.footerEmail}</a>
        </p>
        <p className="justgo-landing__legal">
          <Link to="/privacy-policy">{justGoLandingCopy.footerPrivacy}</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/terms-of-service">{justGoLandingCopy.footerTerms}</Link>
        </p>
      </footer>

      {showSticky ? (
        <div className="justgo-landing__sticky">
          <a href={storeUrl}>{justGoLandingCopy.stickyCta}</a>
        </div>
      ) : null}
    </div>
  );
}

export default JustGoLanding;
