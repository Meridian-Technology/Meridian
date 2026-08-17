import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animated, useSpring } from 'react-spring';
import { useDrag } from 'react-use-gesture';
import apiRequest from '../../utils/postRequest';
import justGoLandingCopy, {
  JUSTGO_IOS_STORE_URL,
  JUSTGO_PLAY_STORE_URL,
} from './justGoLandingCopy';
import {
  cityChipLabel,
  formatLandingTag,
  formatLandingWhen,
  pickLandingCity,
  readStoredLandingCity,
  writeStoredLandingCity,
} from './justGoLandingUtils';

const APP_STORE_BADGE =
  'https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg';
const PEEK_LAYERS = [
  { scale: 0.94, y: 18, rotate: -2.4 },
  { scale: 0.97, y: 9, rotate: 2.1 },
];
const SWIPE_COMMIT_FRACTION = 0.2;
const SWIPE_VELOCITY = 0.4;

function storeUrlFor(platform) {
  return platform === 'android' ? JUSTGO_PLAY_STORE_URL : JUSTGO_IOS_STORE_URL;
}

function EventFace({ event }) {
  const when = formatLandingWhen(event.startTime);
  const tag = formatLandingTag(event.tag);
  return (
    <article className="justgo-landing-card" aria-label={event.name}>
      <div
        className={`justgo-landing-card__hero${
          event.coverImageUrl ? ' justgo-landing-card__hero--image' : ''
        }`}
        style={
          event.coverImageUrl
            ? { backgroundImage: `url(${event.coverImageUrl})` }
            : undefined
        }
      />
      <div className="justgo-landing-card__body">
        {tag ? <span className="justgo-landing-card__tag">{tag}</span> : null}
        <h3 className="justgo-landing-card__title">{event.name}</h3>
        {event.hostName ? (
          <p className="justgo-landing-card__host">{event.hostName}</p>
        ) : null}
        <div className="justgo-landing-card__meta">
          {when ? (
            <span className="justgo-landing-card__pill justgo-landing-card__pill--when">
              {when}
            </span>
          ) : null}
          {event.location ? (
            <span className="justgo-landing-card__pill justgo-landing-card__pill--where">
              {event.location}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function DownloadFace({ storeUrl, platform, empty }) {
  return (
    <article
      className="justgo-landing-card justgo-landing-card--download"
      aria-label={justGoLandingCopy.deckDownloadTitle}
    >
      <div className="justgo-landing-card__hero justgo-landing-card__hero--download" />
      <div className="justgo-landing-card__body">
        <span className="justgo-landing-card__tag">just go</span>
        <h3 className="justgo-landing-card__title">
          {empty ? justGoLandingCopy.deckEmpty : justGoLandingCopy.deckDownloadTitle}
        </h3>
        <p className="justgo-landing-card__host">{justGoLandingCopy.deckDownloadBody}</p>
        <a
          className="justgo-landing__cta justgo-landing__cta--deck"
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
          <a className="justgo-landing-card__store" href={JUSTGO_PLAY_STORE_URL}>
            get it on google play
          </a>
        ) : (
          <a
            className="justgo-landing-card__store justgo-landing-card__store--badge"
            href={JUSTGO_IOS_STORE_URL}
            aria-label={justGoLandingCopy.ctaAriaIos}
          >
            <img src={APP_STORE_BADGE} alt="Download on the App Store" height="32" />
          </a>
        )}
      </div>
    </article>
  );
}

function SwipeTopCard({ card, empty, storeUrl, platform, onSwiped }) {
  const locked = card.kind === 'download';
  const [{ x, rot }, api] = useSpring(() => ({
    x: 0,
    rot: 0,
    config: { tension: 280, friction: 28 },
  }));
  const gone = useRef(false);

  const commit = useCallback(
    (direction, immediate = false) => {
      if (locked || gone.current) return;
      gone.current = true;
      if (immediate) {
        onSwiped(direction > 0 ? 'interested' : 'pass');
        return;
      }
      const width = typeof window === 'undefined' ? 400 : window.innerWidth;
      api.start({
        x: direction * width * 1.35,
        rot: direction * 16,
        onRest: () => onSwiped(direction > 0 ? 'interested' : 'pass'),
      });
    },
    [api, locked, onSwiped],
  );

  const bind = useDrag(
    ({ down, movement: [mx], velocity, direction: [xDir] }) => {
      if (locked) {
        api.start({ x: down ? mx * 0.12 : 0, rot: 0 });
        return;
      }
      if (gone.current) return;
      const width = typeof window === 'undefined' ? 375 : window.innerWidth;
      const shouldGo =
        !down && (Math.abs(mx) > width * SWIPE_COMMIT_FRACTION || velocity > SWIPE_VELOCITY);
      if (shouldGo) {
        const dir = mx > 0 || (mx === 0 && xDir > 0) ? 1 : -1;
        commit(dir);
        return;
      }
      api.start({
        x: down ? mx : 0,
        rot: down ? mx / 18 : 0,
        immediate: down,
      });
    },
    { axis: 'x', filterTaps: true },
  );

  const passOpacity = x.to((value) => (value < 0 ? Math.min(1, Math.abs(value) / 72) : 0));
  const saveOpacity = x.to((value) => (value > 0 ? Math.min(1, value / 72) : 0));

  return (
    <>
      <animated.div
        className="justgo-landing-deck__card justgo-landing-deck__card--top"
        {...bind()}
        style={{
          x,
          rotate: rot.to((value) => `${value}deg`),
          touchAction: 'none',
        }}
      >
        <animated.span
          className="justgo-landing-deck__stamp justgo-landing-deck__stamp--pass"
          style={{ opacity: passOpacity }}
        >
          {justGoLandingCopy.deckPass}
        </animated.span>
        <animated.span
          className="justgo-landing-deck__stamp justgo-landing-deck__stamp--save"
          style={{ opacity: saveOpacity }}
        >
          {justGoLandingCopy.deckInterested}
        </animated.span>
        {card.kind === 'event' ? (
          <EventFace event={card.event} />
        ) : (
          <DownloadFace storeUrl={storeUrl} platform={platform} empty={empty} />
        )}
      </animated.div>
      {!locked ? (
        <div className="justgo-landing-deck__actions">
          <button type="button" onClick={() => commit(-1, true)}>
            {justGoLandingCopy.deckPass}
          </button>
          <button
            type="button"
            className="justgo-landing-deck__actions-save"
            onClick={() => commit(1, true)}
          >
            {justGoLandingCopy.deckInterested}
          </button>
        </div>
      ) : null}
    </>
  );
}

export default function JustGoLandingDeck({ cities, citiesState, platform }) {
  const storeUrl = storeUrlFor(platform);
  const [tenantKey, setTenantKey] = useState('');
  const [events, setEvents] = useState([]);
  const [dropState, setDropState] = useState('idle');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const picked = pickLandingCity(cities, readStoredLandingCity());
    setTenantKey(picked?.tenantKey || '');
  }, [cities]);

  useEffect(() => {
    if (!tenantKey) return undefined;
    writeStoredLandingCity(tenantKey);
    let cancelled = false;
    setDropState('loading');
    setIndex(0);
    setEvents([]);
    apiRequest('/pivot/landing/drop', null, {
      method: 'GET',
      params: { tenantKey },
    })
      .then((res) => {
        if (cancelled) return;
        const next = Array.isArray(res?.data?.events) ? res.data.events.slice(0, 4) : [];
        setEvents(next);
        setDropState(next.length ? 'ready' : 'empty');
      })
      .catch(() => {
        if (!cancelled) {
          setEvents([]);
          setDropState('empty');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tenantKey]);

  const cards = useMemo(() => {
    const next = events.map((event) => ({
      kind: 'event',
      id: event.id,
      event,
    }));
    next.push({ kind: 'download', id: 'download' });
    return next;
  }, [events]);

  const current = cards[Math.min(index, cards.length - 1)];
  const peek = cards.slice(index + 1, index + 3);
  const empty = dropState === 'empty' || events.length === 0;
  const waiting =
    citiesState === 'loading' ||
    (Boolean(tenantKey) && (dropState === 'idle' || dropState === 'loading'));

  return (
    <div className="justgo-landing-deck">
      <div className="justgo-landing__drop-copy">
        <p className="justgo-landing__eyebrow">{justGoLandingCopy.deckEyebrow}</p>
        <h2>{justGoLandingCopy.deckTitle}</h2>
        <p>{justGoLandingCopy.deckBody}</p>
      </div>

      {citiesState === 'loading' ? (
        <p className="justgo-landing__muted">{justGoLandingCopy.citiesLoading}</p>
      ) : null}
      {citiesState === 'empty' ? (
        <p className="justgo-landing__muted">{justGoLandingCopy.citiesEmpty}</p>
      ) : null}

      {cities.length ? (
        <div
          className="justgo-landing-deck__cities"
          role="listbox"
          aria-label={justGoLandingCopy.cityPickerLabel}
        >
          {cities.map((city) => {
            const label = cityChipLabel(city);
            if (!label) return null;
            const selected = city.tenantKey === tenantKey;
            return (
              <button
                key={city.tenantKey}
                type="button"
                role="option"
                aria-selected={selected}
                className={
                  selected
                    ? 'justgo-landing-deck__city justgo-landing-deck__city--on'
                    : 'justgo-landing-deck__city'
                }
                onClick={() => setTenantKey(city.tenantKey)}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {waiting ? (
        <p className="justgo-landing__muted">{justGoLandingCopy.deckLoading}</p>
      ) : (
        <div className="justgo-landing-deck__stage">
          {peek
            .slice()
            .reverse()
            .map((card, peekIndex) => {
              const layer = PEEK_LAYERS[Math.min(peekIndex, PEEK_LAYERS.length - 1)];
              return (
                <div
                  key={card.id}
                  className="justgo-landing-deck__card justgo-landing-deck__card--peek"
                  style={{
                    transform: `translateY(${layer.y}px) rotate(${layer.rotate}deg) scale(${layer.scale})`,
                  }}
                  aria-hidden="true"
                >
                  {card.kind === 'event' ? (
                    <EventFace event={card.event} />
                  ) : (
                    <DownloadFace storeUrl={storeUrl} platform={platform} empty={empty} />
                  )}
                </div>
              );
            })}
          {current ? (
            <SwipeTopCard
              key={`${tenantKey}-${current.id}-${index}`}
              card={current}
              empty={empty && current.kind === 'download'}
              storeUrl={storeUrl}
              platform={platform}
              onSwiped={() => setIndex((value) => value + 1)}
            />
          ) : null}
        </div>
      )}

      {current?.kind === 'event' ? (
        <p className="justgo-landing-deck__hint">{justGoLandingCopy.deckHint}</p>
      ) : null}
    </div>
  );
}
