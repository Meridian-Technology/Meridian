import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animated, useSpring } from 'react-spring';
import apiRequest from '../../utils/postRequest';
import justGoLandingCopy, {
  JUSTGO_IOS_STORE_URL,
  JUSTGO_PLAY_STORE_URL,
} from './justGoLandingCopy';
import {
  cityChipLabel,
  formatLandingWhen,
  landingPosterStack,
  landingSwipeRotate,
  landingSwipeTint,
  pickLandingCity,
  readStoredLandingCity,
  resolveDeckSwipeAxis,
  writeStoredLandingCity,
} from './justGoLandingUtils';

const APP_STORE_BADGE =
  'https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg';
const SWIPE_COMMIT_FRACTION = 0.2;
const SWIPE_VELOCITY = 0.42;
const DECK_SPRING = { tension: 50, friction: 20, clamp: true };
const STRAIGHTEN_SPRING = { tension: 120, friction: 18, clamp: true };
const FLY_SPRING = { tension: 160, friction: 22, clamp: true };

function screenWidth() {
  return typeof window === 'undefined' ? 375 : window.innerWidth;
}

function skipDeckMotion() {
  return process.env.NODE_ENV === 'test';
}

function ClockIcon() {
  return (
    <svg className="justgo-landing-card__pill-icon" viewBox="0 0 13 13" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="5.1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.5 3.6v3.1l2.1 1.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="justgo-landing-card__pill-icon" viewBox="0 0 13 13" aria-hidden="true">
      <path
        d="M6.5 1.6c-1.9 0-3.4 1.5-3.4 3.4 0 2.5 3.4 6.4 3.4 6.4s3.4-3.9 3.4-6.4c0-1.9-1.5-3.4-3.4-3.4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="6.5" cy="5" r="1.15" fill="currentColor" />
    </svg>
  );
}

function EventFace({ event }) {
  const when = formatLandingWhen(event.startTime);
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
        <h3 className="justgo-landing-card__title">{event.name}</h3>
        <div className="justgo-landing-card__meta">
          {when ? (
            <span className="justgo-landing-card__pill justgo-landing-card__pill--when">
              <ClockIcon />
              {when}
            </span>
          ) : null}
          {event.location ? (
            <span className="justgo-landing-card__pill justgo-landing-card__pill--where">
              <PinIcon />
              {event.location}
            </span>
          ) : null}
        </div>
        {event.hostName ? (
          <p className="justgo-landing-card__host">{event.hostName}</p>
        ) : null}
      </div>
    </article>
  );
}

function storeUrlFor(platform) {
  return platform === 'android' ? JUSTGO_PLAY_STORE_URL : JUSTGO_IOS_STORE_URL;
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

function LeavingCard({ card, empty, storeUrl, platform, x: startX, rot: startRot, direction, onDone }) {
  const [{ x, rot }, api] = useSpring(() => ({
    x: startX,
    rot: startRot,
    config: FLY_SPRING,
  }));

  useEffect(() => {
    api.start({
      x: direction * screenWidth() * 1.5,
      rot: direction * 9,
      onRest: onDone,
    });
  }, [api, direction, onDone]);

  const overlay = direction < 0 ? 'pass' : 'save';

  return (
    <animated.div
      className="justgo-landing-deck__card justgo-landing-deck__card--leaving"
      style={{
        x,
        rotate: rot.to((value) => `${value}deg`),
      }}
    >
      <div className={`justgo-landing-deck__overlay justgo-landing-deck__overlay--${overlay}`}>
        <span className="justgo-landing-deck__overlay-chip">
          {overlay === 'pass' ? justGoLandingCopy.deckPass : justGoLandingCopy.deckInterested}
        </span>
        <span className="justgo-landing-deck__overlay-hint">
          {overlay === 'pass' ? justGoLandingCopy.deckPassHint : justGoLandingCopy.deckInterestedHint}
        </span>
      </div>
      {card.kind === 'event' ? (
        <EventFace event={card.event} />
      ) : (
        <DownloadFace storeUrl={storeUrl} platform={platform} empty={empty} />
      )}
    </animated.div>
  );
}

function SwipeTopCard({ card, empty, storeUrl, platform, stackIndex, onSwiped }) {
  const locked = card.kind === 'download';
  const rest = landingPosterStack(1, stackIndex);
  const [{ x, rot, scale }, api] = useSpring(() => ({
    x: 0,
    rot: skipDeckMotion() ? 0 : rest.rotateDeg,
    scale: skipDeckMotion() ? 1 : rest.scale,
    config: DECK_SPRING,
  }));
  const gone = useRef(false);
  const start = useRef(null);
  const axis = useRef(null);
  const pointerId = useRef(null);
  const lastMove = useRef({ t: 0, x: 0 });
  const velocity = useRef(0);
  const pos = useRef({ x: 0, rot: 0 });

  useEffect(() => {
    if (skipDeckMotion()) return undefined;
    api.start({ rot: 0, scale: 1, config: STRAIGHTEN_SPRING });
    return undefined;
  }, [api]);

  const resetGesture = useCallback((node, id) => {
    if (node && id != null && typeof node.releasePointerCapture === 'function') {
      try {
        if (!node.hasPointerCapture || node.hasPointerCapture(id)) {
          node.releasePointerCapture(id);
        }
      } catch {
        // capture already released
      }
    }
    start.current = null;
    axis.current = null;
    pointerId.current = null;
    velocity.current = 0;
  }, []);

  const commit = useCallback(
    (direction) => {
      if (locked || gone.current) return;
      gone.current = true;
      onSwiped({
        direction,
        x: pos.current.x,
        rot: pos.current.rot,
        card,
      });
    },
    [card, locked, onSwiped],
  );

  const onPointerDown = useCallback(
    (event) => {
      if (locked || gone.current) return;
      if (event.button != null && event.button !== 0) return;
      start.current = { x: event.clientX, y: event.clientY };
      axis.current = null;
      pointerId.current = event.pointerId;
      lastMove.current = { t: event.timeStamp, x: event.clientX };
      velocity.current = 0;
    },
    [locked],
  );

  const onPointerMove = useCallback(
    (event) => {
      if (locked || gone.current || !start.current) return;
      if (pointerId.current != null && event.pointerId !== pointerId.current) return;
      const mx = event.clientX - start.current.x;
      const my = event.clientY - start.current.y;
      if (axis.current == null) {
        const next = resolveDeckSwipeAxis(mx, my);
        if (next === 'y') {
          resetGesture(event.currentTarget, event.pointerId);
          return;
        }
        if (next !== 'x') return;
        axis.current = 'x';
        if (typeof event.currentTarget.setPointerCapture === 'function') {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }
      if (axis.current !== 'x') return;
      const dt = event.timeStamp - lastMove.current.t;
      if (dt > 0) velocity.current = (event.clientX - lastMove.current.x) / dt;
      lastMove.current = { t: event.timeStamp, x: event.clientX };
      const nextRot = landingSwipeRotate(mx, screenWidth());
      pos.current = { x: mx, rot: nextRot };
      api.start({ x: mx, rot: nextRot, scale: 1, immediate: true });
    },
    [api, locked, resetGesture],
  );

  const onPointerUp = useCallback(
    (event) => {
      if (pointerId.current != null && event.pointerId !== pointerId.current) return;
      const mx = start.current ? event.clientX - start.current.x : 0;
      const wasSwipe = axis.current === 'x';
      const flick = velocity.current;
      resetGesture(event.currentTarget, event.pointerId);
      if (!wasSwipe || locked || gone.current) return;
      const width = screenWidth();
      const shouldGo =
        Math.abs(mx) > width * SWIPE_COMMIT_FRACTION || Math.abs(flick) > SWIPE_VELOCITY;
      if (shouldGo) {
        const dir = mx > 0 || (mx === 0 && flick > 0) ? 1 : -1;
        commit(dir);
        return;
      }
      api.start({ x: 0, rot: 0, scale: 1 });
      pos.current = { x: 0, rot: 0 };
    },
    [api, commit, locked, resetGesture],
  );

  const onPointerCancel = useCallback(
    (event) => {
      if (pointerId.current != null && event.pointerId !== pointerId.current) return;
      const wasSwipe = axis.current === 'x';
      resetGesture(event.currentTarget, event.pointerId);
      if (wasSwipe && !gone.current) {
        api.start({ x: 0, rot: 0, scale: 1 });
        pos.current = { x: 0, rot: 0 };
      }
    },
    [api, resetGesture],
  );

  const passOpacity = x.to((value) => (value < 0 ? landingSwipeTint(value, screenWidth()) : 0));
  const saveOpacity = x.to((value) => (value > 0 ? landingSwipeTint(value, screenWidth()) : 0));

  return (
    <>
      <animated.div
        className="justgo-landing-deck__card justgo-landing-deck__card--top"
        onPointerDown={locked ? undefined : onPointerDown}
        onPointerMove={locked ? undefined : onPointerMove}
        onPointerUp={locked ? undefined : onPointerUp}
        onPointerCancel={locked ? undefined : onPointerCancel}
        style={{
          x,
          rotate: rot.to((value) => `${value}deg`),
          scale,
        }}
      >
        <animated.div
          className="justgo-landing-deck__overlay justgo-landing-deck__overlay--pass"
          style={{ opacity: passOpacity }}
        >
          <span className="justgo-landing-deck__overlay-chip">{justGoLandingCopy.deckPass}</span>
          <span className="justgo-landing-deck__overlay-hint">{justGoLandingCopy.deckPassHint}</span>
        </animated.div>
        <animated.div
          className="justgo-landing-deck__overlay justgo-landing-deck__overlay--save"
          style={{ opacity: saveOpacity }}
        >
          <span className="justgo-landing-deck__overlay-chip">{justGoLandingCopy.deckInterested}</span>
          <span className="justgo-landing-deck__overlay-hint">
            {justGoLandingCopy.deckInterestedHint}
          </span>
        </animated.div>
        {card.kind === 'event' ? (
          <EventFace event={card.event} />
        ) : (
          <DownloadFace storeUrl={storeUrl} platform={platform} empty={empty} />
        )}
      </animated.div>
      {!locked ? (
        <div className="justgo-landing-deck__actions">
          <button type="button" onClick={() => commit(-1)}>
            {justGoLandingCopy.deckPass}
          </button>
          <button
            type="button"
            className="justgo-landing-deck__actions-save"
            onClick={() => commit(1)}
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
  const [leaving, setLeaving] = useState(null);

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
    setLeaving(null);
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
          {peek.map((card, peekIndex) => {
            const depth = peekIndex + 1;
            const layer = landingPosterStack(depth, index + depth);
            return (
              <div
                key={card.id}
                className="justgo-landing-deck__card justgo-landing-deck__card--peek"
                style={{
                  zIndex: 2 - peekIndex,
                  transform: `rotate(${layer.rotateDeg}deg) scale(${layer.scale})`,
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
              stackIndex={index}
              onSwiped={(snapshot) => {
                if (!skipDeckMotion()) setLeaving(snapshot);
                setIndex((value) => value + 1);
              }}
            />
          ) : null}
          {leaving ? (
            <LeavingCard
              key={`leaving-${leaving.card.id}`}
              card={leaving.card}
              empty={empty && leaving.card.kind === 'download'}
              storeUrl={storeUrl}
              platform={platform}
              x={leaving.x}
              rot={leaving.rot}
              direction={leaving.direction}
              onDone={() => setLeaving(null)}
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
