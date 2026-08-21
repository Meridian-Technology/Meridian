import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import apiRequest from '../../utils/postRequest';
import { analytics } from '../../services/analytics/analytics';
import Popup from '../../components/Popup/Popup';
import appStoreBadge from '../../assets/pivot/download-on-the-app-store.svg';
import {
  JUSTGO_HERO_DESKTOP_WEBP,
  JUSTGO_HERO_MOBILE_WEBP,
  JUSTGO_WORDMARK_1298,
  JUSTGO_WORDMARK_SIZES,
  JUSTGO_WORDMARK_SRCSET,
} from './justGoHeroAssets';
import { JUSTGO_CREATOR_ROUTES } from '../JustGoCreator/justGoCreatorRoutes';
import justGoLandingCopy, {
  JUSTGO_IOS_STORE_URL,
  JustGoLandingCopyContext,
  justGoPublicLandingUrl,
  resolveJustGoLandingCopy,
  useJustGoLandingCopy,
} from './justGoLandingCopy';
import { JUSTGO_LANDING_FLYERS } from './justGoLandingFlyers';
import JustGoLandingDeck from './JustGoLandingDeck';
import {
  cityChipLabel,
  decorateFlyers,
  findLandingCity,
  formatLandingDropSpoken,
  isWaitlistLandingMode,
  landingTenantKeyFromParam,
  padDropUnit,
  pickLandingCity,
  readStoredLandingCity,
  resolveLandingCountdownDropAt,
  scopeLandingCities,
  splitLandingDropCountdown,
  writeStoredLandingCity,
  justGoLegalPath,
} from './justGoLandingUtils';
import { useJustGoLandingMotion } from './justGoLandingMotion';
import { isJustGoHost } from '../../config/tenantRedirect';
import { applyJustGoDocumentMeta } from './justGoDocumentMeta';
import { recordLandingView, scanLandingQr } from './justGoLandingTracking';
import JustGoLandingCityPicker from './JustGoLandingCityPicker';
import JustGoLandingStoreLink from './JustGoLandingStoreLink';
import JustGoLandingWaitlist from './JustGoLandingWaitlist';
import './JustGoLanding.scss';

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

function useJustGoDropCountdown(nextDropAtIso) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') return undefined;
    const tick = () => setNowMs(Date.now());
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => {
    const dropAt = resolveLandingCountdownDropAt(nextDropAtIso, new Date(nowMs));
    const remaining = dropAt ? dropAt.getTime() - nowMs : 0;
    const parts = splitLandingDropCountdown(remaining);
    return {
      ...parts,
      spoken: formatLandingDropSpoken(parts),
    };
  }, [nowMs, nextDropAtIso]);
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
          <img src={flyer.cover} alt="" draggable={false} loading="lazy" decoding="async" />
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

function JustGoWaitlistDialog({ copy, children, handleClose }) {
  return (
    <div
      id="waitlist"
      role="dialog"
      aria-modal="true"
      aria-label={copy.waitlistCta}
    >
      {React.isValidElement(children)
        ? React.cloneElement(children, {
            onClose: handleClose || children.props.onClose,
          })
        : children}
    </div>
  );
}

function JustGoLanding() {
  const { tenantKey: tenantKeyParam } = useParams();
  const [searchParams] = useSearchParams();
  const lockedTenantKey = landingTenantKeyFromParam(tenantKeyParam);
  const desktop = useIsDesktop();
  const storeUrl = JUSTGO_IOS_STORE_URL;
  const { ref: ctaRef, visible: ctaVisible } = useHeroCtaVisible();
  const flyersRef = useRef(null);
  const [cities, setCities] = useState([]);
  const [citiesState, setCitiesState] = useState('loading');
  const [selectedTenantKey, setSelectedTenantKey] = useState('');
  const [copy, setCopy] = useState(justGoLandingCopy);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const { slap } = useJustGoLandingMotion({ desktop, flyersRef });
  const srcQuery = searchParams.get('src');
  const qrQuery = searchParams.get('qr');
  const refQuery = searchParams.get('ref');

  useEffect(() => {
    const search = new URLSearchParams();
    if (srcQuery) search.set('src', srcQuery);
    if (qrQuery) search.set('qr', qrQuery);
    if (refQuery) search.set('ref', refQuery);
    recordLandingView({
      tenantKey: lockedTenantKey,
      search,
    });
    if (qrQuery) {
      void scanLandingQr({ name: qrQuery, search });
    }
  }, [lockedTenantKey, srcQuery, qrQuery, refQuery]);

  useEffect(() => {
    analytics.screen('Just Go Landing');
  }, []);

  useEffect(() => {
    const theme = document.querySelector('meta[name="theme-color"]');
    const description = document.querySelector('meta[name="description"]');
    const previousTheme = theme?.getAttribute('content');
    const previousDescription = description?.getAttribute('content');
    applyJustGoDocumentMeta({
      title: copy.documentTitle,
      description: copy.metaDescription,
    });
    return () => {
      if (isJustGoHost()) return;
      document.title = 'Meridian';
      if (theme && previousTheme != null) theme.setAttribute('content', previousTheme);
      if (description && previousDescription != null) {
        description.setAttribute('content', previousDescription);
      }
    };
  }, [copy.documentTitle, copy.metaDescription]);

  useEffect(() => {
    const href = justGoPublicLandingUrl(lockedTenantKey);
    let link = document.querySelector('link[rel="canonical"][data-justgo-canonical]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      link.setAttribute('data-justgo-canonical', '1');
      document.head.appendChild(link);
    }
    link.setAttribute('href', href);
    return () => {
      link.remove();
    };
  }, [lockedTenantKey]);

  useEffect(() => {
    const aliasHost = !isJustGoHost();
    let robots = document.querySelector('meta[name="robots"][data-justgo-robots]');
    if (!aliasHost) {
      robots?.remove();
      return undefined;
    }
    if (!robots) {
      robots = document.createElement('meta');
      robots.setAttribute('name', 'robots');
      robots.setAttribute('data-justgo-robots', '1');
      document.head.appendChild(robots);
    }
    robots.setAttribute('content', 'noindex, nofollow');
    return () => {
      robots.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const options = lockedTenantKey
      ? { method: 'GET', params: { tenantKey: lockedTenantKey } }
      : { method: 'GET' };
    apiRequest('/pivot/landing/config', null, options)
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
  }, [lockedTenantKey]);

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

  const scopedCities = useMemo(
    () => scopeLandingCities(cities, lockedTenantKey),
    [cities, lockedTenantKey],
  );

  useEffect(() => {
    if (lockedTenantKey) {
      setSelectedTenantKey(lockedTenantKey);
      return;
    }
    const picked = pickLandingCity(scopedCities, readStoredLandingCity());
    setSelectedTenantKey(picked?.tenantKey || '');
  }, [scopedCities, lockedTenantKey]);

  useEffect(() => {
    if (selectedTenantKey && !lockedTenantKey) {
      writeStoredLandingCity(selectedTenantKey);
    }
  }, [selectedTenantKey, lockedTenantKey]);

  const activeCity = useMemo(
    () => findLandingCity(scopedCities, lockedTenantKey || selectedTenantKey),
    [scopedCities, lockedTenantKey, selectedTenantKey],
  );
  const countdown = useJustGoDropCountdown(activeCity?.nextDropAt);
  const waitlistMode = isWaitlistLandingMode(activeCity);
  const ctaReady = Boolean(activeCity);

  function openWaitlist(event) {
    event?.preventDefault?.();
    setWaitlistOpen(true);
  }

  function closeWaitlist() {
    setWaitlistOpen(false);
    if (typeof window === 'undefined') return;
    if (window.location.hash.replace(/^#/, '') === 'waitlist') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  }

  useEffect(() => {
    const syncHash = () => {
      if (window.location.hash.replace(/^#/, '') === 'waitlist') {
        setWaitlistOpen(true);
      }
    };
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  useEffect(() => {
    if (!waitlistMode) setWaitlistOpen(false);
  }, [waitlistMode]);

  useEffect(() => {
    if (!waitlistOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') closeWaitlist();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [waitlistOpen]);

  const scopedCitiesState =
    lockedTenantKey && citiesState === 'ready' && scopedCities.length === 0
      ? 'empty'
      : citiesState;
  const flyers = useMemo(
    () => decorateFlyers(JUSTGO_LANDING_FLYERS, scopedCities),
    [scopedCities],
  );
  const cityLabels = useMemo(
    () => scopedCities.map(cityChipLabel).filter(Boolean),
    [scopedCities],
  );
  const proofLine = cityLabels.length
    ? `${copy.proofPrefix} ${cityLabels.join(' · ')}`
    : scopedCitiesState === 'empty'
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
        <picture className="justgo-landing__hero-photo" aria-hidden="true">
          <source
            media="(max-width: 899px)"
            srcSet={JUSTGO_HERO_MOBILE_WEBP}
            type="image/webp"
          />
          <source srcSet={JUSTGO_HERO_DESKTOP_WEBP} type="image/webp" />
          <img
            src={JUSTGO_HERO_DESKTOP_WEBP}
            alt=""
            width={1024}
            height={1024}
            decoding="async"
            fetchpriority="high"
            draggable={false}
          />
        </picture>
        <span className="justgo-landing__hero-wash" aria-hidden="true" />
        <span className="justgo-landing__grain" aria-hidden="true" />
        <nav className="justgo-landing__nav" aria-label="just go">
          <div className="justgo-landing__nav-links">
            <a href="#drop">{copy.navDrop}</a>
            <a href="#story">{copy.navStory}</a>
          </div>
          <DropCountdown countdown={countdown} />
          {ctaReady && !waitlistMode ? (
            <JustGoLandingStoreLink
              className="justgo-landing__nav-cta"
              href={storeUrl}
              tenantKey={lockedTenantKey || selectedTenantKey}
              store="ios"
            >
              {copy.cta}
            </JustGoLandingStoreLink>
          ) : null}
        </nav>

        <div className="justgo-landing__hero-stage" ref={ctaRef} id="download">
          <img
            className="justgo-landing__wordmark"
            src={JUSTGO_WORDMARK_1298}
            srcSet={JUSTGO_WORDMARK_SRCSET}
            sizes={JUSTGO_WORDMARK_SIZES}
            alt={copy.wordmarkAlt}
            width={1298}
            height={782}
            decoding="async"
            fetchpriority="high"
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
          {ctaReady && waitlistMode ? (
            <>
              {desktop && !lockedTenantKey && !waitlistOpen ? (
                <JustGoLandingCityPicker
                  cities={scopedCities}
                  selectedTenantKey={selectedTenantKey}
                  onChange={setSelectedTenantKey}
                  className="justgo-landing-deck__cities justgo-landing__hero-cities"
                />
              ) : null}
              <div className="justgo-landing__waitlist-gate">
                <a
                  className="justgo-landing__cta"
                  href="#waitlist"
                  onClick={openWaitlist}
                >
                  {copy.waitlistCta}
                </a>
              </div>
            </>
          ) : ctaReady ? (
            <>
              {desktop && !lockedTenantKey ? (
                <JustGoLandingCityPicker
                  cities={scopedCities}
                  selectedTenantKey={selectedTenantKey}
                  onChange={setSelectedTenantKey}
                  className="justgo-landing-deck__cities justgo-landing__hero-cities"
                />
              ) : null}
              <JustGoLandingStoreLink
                className="justgo-landing__app-store"
                href={JUSTGO_IOS_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={copy.ctaAriaIos}
                tenantKey={lockedTenantKey || selectedTenantKey}
                store="ios"
              >
                <img
                  src={appStoreBadge}
                  alt="Download on the App Store"
                  height="52"
                  width="156"
                />
              </JustGoLandingStoreLink>
            </>
          ) : null}
        </div>
      </header>

      <p className="justgo-landing__proof" aria-live="polite">
        {scopedCitiesState === 'loading' ? copy.citiesLoading : proofLine}
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
            cities={scopedCities}
            citiesState={scopedCitiesState}
            cityLocked={Boolean(lockedTenantKey)}
            lockedTenantKey={lockedTenantKey}
            selectedTenantKey={selectedTenantKey}
            onCityChange={setSelectedTenantKey}
            onWaitlistOpen={openWaitlist}
          />
        )}
      </section>

      <section className="justgo-landing__story" id="story">
        <h2>
          <span className="justgo-landing__strip justgo-landing__strip--cream">
            {copy.storyTitle}
          </span>
        </h2>
        {copy.story.map((graf, index) => (
          <p key={`story-graf-${index}`}>{graf}</p>
        ))}
      </section>

      <footer className="justgo-landing__footer" id="contact">
        <img
          className="justgo-landing__footer-mark"
          src={JUSTGO_WORDMARK_1298}
          srcSet={JUSTGO_WORDMARK_SRCSET}
          sizes="6rem"
          alt={copy.wordmarkAlt}
          width={1298}
          height={782}
          decoding="async"
          draggable={false}
        />
        <p className="justgo-landing__footer-stamp">{copy.footerStamp}</p>
        <p className="justgo-landing__contact-lead">
          <span className="justgo-landing__strip justgo-landing__strip--pop">
            {copy.contactLead}
          </span>
        </p>
        {ctaReady && waitlistMode ? (
          <a
            className="justgo-landing__cta justgo-landing__cta--footer"
            href="#waitlist"
            onClick={openWaitlist}
          >
            {copy.waitlistCta}
          </a>
        ) : ctaReady ? (
          <JustGoLandingStoreLink
            className="justgo-landing__cta justgo-landing__cta--footer"
            href={storeUrl}
            tenantKey={lockedTenantKey || selectedTenantKey}
            store="ios"
          >
            {copy.cta}
          </JustGoLandingStoreLink>
        ) : null}
        {!waitlistMode ? (
          <p className="justgo-landing__host">
            {copy.footerHost}{' '}
            <Link to={JUSTGO_CREATOR_ROUTES.login}>{copy.footerHostLink}</Link>
          </p>
        ) : null}
        <p className="justgo-landing__note">
          {copy.footerNote}{' '}
          <a href={`mailto:${copy.footerEmail}`}>{copy.footerEmail}</a>
        </p>
        <p className="justgo-landing__legal">
          <Link to={justGoLegalPath('privacy', isJustGoHost())}>{copy.footerPrivacy}</Link>
          <span aria-hidden="true"> · </span>
          <Link to={justGoLegalPath('terms', isJustGoHost())}>{copy.footerTerms}</Link>
        </p>
      </footer>

      {showSticky && ctaReady && !waitlistMode ? (
        <div className="justgo-landing__sticky">
          <JustGoLandingStoreLink
            href={storeUrl}
            tenantKey={lockedTenantKey || selectedTenantKey}
            store="ios"
          >
            {copy.stickyCta}
          </JustGoLandingStoreLink>
        </div>
      ) : null}

      <Popup
        isOpen={Boolean(waitlistOpen && ctaReady && waitlistMode)}
        onClose={closeWaitlist}
        defaultStyling={false}
        hideCloseButton
        customClassName="justgo-landing__waitlist-dialog"
      >
        <JustGoWaitlistDialog copy={copy}>
          <JustGoLandingWaitlist
            cities={scopedCities}
            selectedTenantKey={selectedTenantKey}
            cityLocked={Boolean(lockedTenantKey)}
            onCityChange={setSelectedTenantKey}
            onClose={closeWaitlist}
          />
        </JustGoWaitlistDialog>
      </Popup>
    </div>
    </JustGoLandingCopyContext.Provider>
  );
}

export default JustGoLanding;
