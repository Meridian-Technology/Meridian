import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import apiRequest from '../../utils/postRequest';
import { analytics } from '../../services/analytics/analytics';
import justGoWordmark from '../../assets/pivot/just-go-wordmark.svg';
import dandelions from '../../assets/pivot/pivot-hero-dandelions.jpg';
import meadow from '../../assets/pivot/pivot-hero-meadow.jpg';
import { JUSTGO_CREATOR_ROUTES } from '../JustGoCreator/justGoCreatorRoutes';
import justGoLandingCopy, {
  JUSTGO_IOS_STORE_URL,
  JUSTGO_PLAY_STORE_URL,
  JustGoLandingCopyContext,
  resolveJustGoLandingCopy,
  useJustGoLandingCopy,
} from './justGoLandingCopy';
import { JUSTGO_LANDING_FLYERS } from './justGoLandingFlyers';
import JustGoLandingDeck from './JustGoLandingDeck';
import {
  cityChipLabel,
  decorateFlyers,
  detectStorePlatform,
  formatLandingDropSpoken,
  padDropUnit,
  resolveNextLandingDropAt,
  splitLandingDropCountdown,
} from './justGoLandingUtils';
import { useJustGoLandingMotion } from './justGoLandingMotion';
import './JustGoLanding.scss';

const APP_STORE_BADGE =
  'https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg';

const STORY_PRINTS = [
  { src: dandelions, alt: '' },
  { src: meadow, alt: '' },
];

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

function useJustGoDropCountdown() {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') return undefined;
    const tick = () => setNowMs(Date.now());
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => {
    const dropAt = resolveNextLandingDropAt(new Date(nowMs));
    const remaining = dropAt ? dropAt.getTime() - nowMs : 0;
    const parts = splitLandingDropCountdown(remaining);
    return {
      ...parts,
      spoken: formatLandingDropSpoken(parts),
    };
  }, [nowMs]);
}

function DropCountdown({ countdown }) {
  const copy = useJustGoLandingCopy();
  const units = [
    { key: 'days', label: copy.countdownUnitDays },
    { key: 'hours', label: copy.countdownUnitHours },
    { key: 'minutes', label: copy.countdownUnitMinutes },
    { key: 'seconds', label: copy.countdownUnitSeconds },
  ];
  const tone = countdown.imminent ? 'imminent' : countdown.soon ? 'soon' : 'week';
  return (
    <a
      className={`justgo-landing__countdown justgo-landing__countdown--${tone}${
        countdown.live ? ' justgo-landing__countdown--live' : ''
      }`}
      href="#drop"
      aria-label={countdown.spoken}
    >
      <span className="justgo-landing__countdown-kicker">
        {countdown.live ? (
          copy.countdownLive
        ) : (
          <>
            <span>{copy.countdownKicker}</span>
            <span className="justgo-landing__countdown-in">{copy.countdownKickerIn}</span>
          </>
        )}
      </span>
      {countdown.live ? null : (
        <span className="justgo-landing__countdown-units" aria-hidden="true">
          {units.map((unit) => (
            <span key={unit.key} className="justgo-landing__countdown-cell">
              <span
                key={countdown[unit.key]}
                className={`justgo-landing__countdown-value justgo-landing__countdown-value--${unit.key}`}
              >
                {padDropUnit(countdown[unit.key])}
              </span>
              <span className="justgo-landing__countdown-unit">{unit.label}</span>
            </span>
          ))}
        </span>
      )}
    </a>
  );
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
  const photoRef = useRef(null);
  const flyersRef = useRef(null);
  const [cities, setCities] = useState([]);
  const [citiesState, setCitiesState] = useState('loading');
  const [copy, setCopy] = useState(justGoLandingCopy);
  const { slap } = useJustGoLandingMotion({ desktop, photoRef, flyersRef });
  const countdown = useJustGoDropCountdown();

  useEffect(() => {
    analytics.screen('Just Go Landing');
    const theme = document.querySelector('meta[name="theme-color"]');
    const description = document.querySelector('meta[name="description"]');
    const previousTheme = theme?.getAttribute('content');
    const previousDescription = description?.getAttribute('content');
    if (theme) theme.setAttribute('content', '#1E1A16');
    return () => {
      document.title = 'Meridian';
      if (theme && previousTheme != null) theme.setAttribute('content', previousTheme);
      if (description && previousDescription != null) {
        description.setAttribute('content', previousDescription);
      }
    };
  }, []);

  useEffect(() => {
    document.title = copy.documentTitle;
    const description = document.querySelector('meta[name="description"]');
    if (description) {
      description.setAttribute('content', copy.metaDescription);
    }
  }, [copy.documentTitle, copy.metaDescription]);

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

  useEffect(() => {
    let cancelled = false;
    apiRequest('/pivot/landing/copy', null, { method: 'GET' })
      .then((res) => {
        if (cancelled) return;
        if (res?.success && res.data && typeof res.data === 'object') {
          setCopy(resolveJustGoLandingCopy(res.data));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const flyers = useMemo(() => decorateFlyers(JUSTGO_LANDING_FLYERS, cities), [cities]);
  const cityLabels = useMemo(
    () => cities.map(cityChipLabel).filter(Boolean),
    [cities],
  );
  const proofLine = cityLabels.length
    ? `${copy.proofPrefix} ${cityLabels.join(' · ')}`
    : citiesState === 'empty'
      ? copy.citiesEmpty
      : copy.proofFallback;

  const showSticky = !ctaVisible;

  return (
    <JustGoLandingCopyContext.Provider value={copy}>
    <div className={`justgo-landing${slap ? ' justgo-landing--slap' : ''}`}>
      <a className="justgo-landing__skip" href="#drop">
        {copy.skip}
      </a>

      <header className="justgo-landing__hero">
        <div className="justgo-landing__hero-photo" ref={photoRef} aria-hidden="true" />
        <span className="justgo-landing__hero-wash" aria-hidden="true" />
        <span className="justgo-landing__grain" aria-hidden="true" />
        <nav className="justgo-landing__nav" aria-label="just go">
          <div className="justgo-landing__nav-links">
            <a href="#drop">{copy.navDrop}</a>
            <a href="#story">{copy.navStory}</a>
          </div>
          <DropCountdown countdown={countdown} />
          <a className="justgo-landing__nav-cta" href={storeUrl}>
            {copy.cta}
          </a>
        </nav>

        <div className="justgo-landing__hero-stage" ref={ctaRef} id="download">
          <img
            className="justgo-landing__wordmark"
            src={justGoWordmark}
            alt={copy.wordmarkAlt}
            draggable={false}
          />
          <h1 className="justgo-landing__headline">
            <span className="justgo-landing__strip justgo-landing__strip--cream">
              {copy.headlineLead}
            </span>
            <span className="justgo-landing__strip justgo-landing__strip--pop">
              {copy.headlinePop}
            </span>
          </h1>
          {platform === 'android' ? (
            <a
              className="justgo-landing__store"
              href={JUSTGO_PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={copy.ctaAriaAndroid}
            >
              get it on google play
            </a>
          ) : (
            <a
              className="justgo-landing__store justgo-landing__store--badge"
              href={JUSTGO_IOS_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={copy.ctaAriaIos}
            >
              <img src={APP_STORE_BADGE} alt="Download on the App Store" height="52" />
            </a>
          )}
        </div>
      </header>

      <p className="justgo-landing__proof" aria-live="polite">
        {citiesState === 'loading' ? copy.citiesLoading : proofLine}
      </p>

      <section className="justgo-landing__drop" id="drop">
        {desktop ? (
          <>
            <div className="justgo-landing__drop-copy">
              <p className="justgo-landing__eyebrow">{copy.flyersEyebrow}</p>
              <h2>{copy.flyersTitle}</h2>
              <p>{copy.flyersBody}</p>
            </div>
            <div className="justgo-landing__flyers" ref={flyersRef}>
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

      <section className="justgo-landing__story" id="story">
        <p className="justgo-landing__eyebrow">{copy.storyEyebrow}</p>
        <h2>
          <span className="justgo-landing__strip justgo-landing__strip--cream">
            {copy.storyTitle}
          </span>
        </h2>
        {copy.story.map((graf) => (
          <p key={graf}>{graf}</p>
        ))}
        <div className="justgo-landing__story-prints" aria-hidden="true">
          {STORY_PRINTS.map((print) => (
            <img key={print.src} src={print.src} alt="" draggable={false} />
          ))}
        </div>
      </section>

      <footer className="justgo-landing__footer" id="contact">
        <img
          className="justgo-landing__footer-mark"
          src={justGoWordmark}
          alt={copy.wordmarkAlt}
          draggable={false}
        />
        <p className="justgo-landing__footer-stamp">{copy.footerStamp}</p>
        <p className="justgo-landing__contact-lead">
          <span className="justgo-landing__strip justgo-landing__strip--pop">
            {copy.contactLead}
          </span>
        </p>
        <a className="justgo-landing__cta justgo-landing__cta--footer" href={storeUrl}>
          {copy.cta}
        </a>
        <p className="justgo-landing__host">
          {copy.footerHost}{' '}
          <Link to={JUSTGO_CREATOR_ROUTES.login}>{copy.footerHostLink}</Link>
        </p>
        <p className="justgo-landing__note">
          {copy.footerNote}{' '}
          <a href={`mailto:${copy.footerEmail}`}>{copy.footerEmail}</a>
        </p>
        <p className="justgo-landing__legal">
          <Link to="/privacy-policy">{copy.footerPrivacy}</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/terms-of-service">{copy.footerTerms}</Link>
        </p>
      </footer>

      {showSticky ? (
        <div className="justgo-landing__sticky">
          <a href={storeUrl}>{copy.stickyCta}</a>
        </div>
      ) : null}
    </div>
    </JustGoLandingCopyContext.Provider>
  );
}

export default JustGoLanding;
