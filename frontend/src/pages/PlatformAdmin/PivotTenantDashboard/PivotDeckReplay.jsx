import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../../../components/PivotBranding/pivotBrandFonts.scss';
import './PivotDeckReplay.scss';
import {
  pivotDeckReplayPhoneVars,
  resolvePivotDeckReplayLayout,
} from './pivotDeckReplayLayout';

const SWIPE_MS = 280;
const DETAIL_OPEN_MS = 340;
const DETAIL_CLOSE_MS = 300;
const MIN_DETAIL_HOLD_MS = 700;
const MAX_DETAIL_HOLD_MS = 8_000;
const SPEEDS = [1, 4, 16];

function skipMotion() {
  return process.env.NODE_ENV === 'test';
}

function formatDeckClock(date) {
  const hours24 = date.getHours();
  const minutes = date.getMinutes();
  const period = hours24 >= 12 ? 'pm' : 'am';
  const hours12 = hours24 % 12 || 12;
  if (minutes === 0) return `${hours12}${period}`;
  return `${hours12}:${String(minutes).padStart(2, '0')}${period}`;
}

export function formatDeckWhen(startTime, endTime) {
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return '';
  const day = start.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
  const startClock = formatDeckClock(start);
  if (!endTime) return `${day} · ${startClock}`;
  const end = new Date(endTime);
  if (Number.isNaN(end.getTime())) return `${day} · ${startClock}`;
  return `${day} · ${startClock} – ${formatDeckClock(end)}`;
}

function formatDwell(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds)}s`;
}

function toEpoch(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function resolveDetailReplayTiming(card) {
  if (!card?.openedDetail) return null;
  const focusedAt = toEpoch(card.focusedAt);
  const actedAt = toEpoch(card.actedAt);
  const openedAt = toEpoch(card.openedDetailAt);
  const dwellMs = Number(card.dwellMs) || 0;
  let beforeOpen;
  let hold;
  if (focusedAt != null && actedAt != null && openedAt != null && openedAt >= focusedAt && openedAt <= actedAt) {
    beforeOpen = openedAt - focusedAt;
    hold = Math.min(
      MAX_DETAIL_HOLD_MS,
      Math.max(MIN_DETAIL_HOLD_MS, actedAt - openedAt - DETAIL_CLOSE_MS),
    );
  } else {
    beforeOpen = Math.round(dwellMs * 0.35);
    hold = Math.min(
      MAX_DETAIL_HOLD_MS,
      Math.max(MIN_DETAIL_HOLD_MS, Math.round(dwellMs * 0.45)),
    );
  }
  return {
    beforeOpen: Math.max(0, beforeOpen),
    openMs: DETAIL_OPEN_MS,
    hold,
    closeMs: DETAIL_CLOSE_MS,
  };
}

function ClockIcon() {
  return (
    <svg className="pivot-deck-replay-card__pill-icon" viewBox="0 0 13 13" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="5.1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M6.5 3.6v3.1l2.1 1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="pivot-deck-replay-card__pill-icon" viewBox="0 0 13 13" aria-hidden="true">
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

export function ReplayEventCard({ event }) {
  const when = formatDeckWhen(event?.startTime, event?.endTime);
  const hasHero = Boolean(event?.coverImageUrl);
  return (
    <article className="pivot-deck-replay-card" aria-label={event?.name || 'Event'}>
      <div
        className={`pivot-deck-replay-card__hero${
          hasHero ? ' pivot-deck-replay-card__hero--image' : ''
        }`}
        style={
          hasHero ? { backgroundImage: `url(${event.coverImageUrl})` } : undefined
        }
      />
      <div className="pivot-deck-replay-card__body">
        <h3 className="pivot-deck-replay-card__title">{event?.name || 'Untitled event'}</h3>
        <div className="pivot-deck-replay-card__meta">
          {when ? (
            <span className="pivot-deck-replay-card__pill pivot-deck-replay-card__pill--when">
              <ClockIcon />
              {when}
            </span>
          ) : null}
          {event?.location ? (
            <span className="pivot-deck-replay-card__pill pivot-deck-replay-card__pill--where">
              <PinIcon />
              {event.location}
            </span>
          ) : null}
        </div>
        {event?.description ? (
          <>
            <div className="pivot-deck-replay-card__rule" />
            <p className="pivot-deck-replay-card__description">{event.description}</p>
          </>
        ) : null}
      </div>
    </article>
  );
}

export function ReplayEventDetail({ event, open }) {
  const when = formatDeckWhen(event?.startTime, event?.endTime);
  const hasHero = Boolean(event?.coverImageUrl);
  return (
    <div
      className={`pivot-deck-replay__detail${open ? ' is-open' : ''}`}
      aria-hidden={!open}
    >
      <article className="pivot-deck-replay__detail-sheet" aria-label={`${event?.name || 'Event'} details`}>
        <div
          className={`pivot-deck-replay__detail-hero${
            hasHero ? ' pivot-deck-replay__detail-hero--image' : ''
          }`}
          style={
            hasHero ? { backgroundImage: `url(${event.coverImageUrl})` } : undefined
          }
        />
        <div className="pivot-deck-replay__detail-body">
          <h3 className="pivot-deck-replay__detail-title">{event?.name || 'Untitled event'}</h3>
          {event?.hostName ? (
            <p className="pivot-deck-replay__detail-host">{event.hostName}</p>
          ) : null}
          <div className="pivot-deck-replay-card__meta">
            {when ? (
              <span className="pivot-deck-replay-card__pill pivot-deck-replay-card__pill--when">
                <ClockIcon />
                {when}
              </span>
            ) : null}
            {event?.location ? (
              <span className="pivot-deck-replay-card__pill pivot-deck-replay-card__pill--where">
                <PinIcon />
                {event.location}
              </span>
            ) : null}
          </div>
          {event?.description ? (
            <p className="pivot-deck-replay__detail-copy">{event.description}</p>
          ) : null}
        </div>
      </article>
    </div>
  );
}

function stackTransform(depth, cardIndex) {
  if (depth <= 0) return { rotate: 0, scale: 1 };
  const tilts = [3.4, 4.1, 2.8, 3.6];
  const scales = [0.986, 0.974, 0.962];
  const direction = cardIndex % 2 === 0 ? 1 : -1;
  return {
    rotate: tilts[(depth - 1) % tilts.length] * direction,
    scale: scales[Math.min(depth - 1, scales.length - 1)],
  };
}

/**
 * Timed replay of a user's deck session. Wait dwellMs on each card, then fly
 * pass (left) / interested (right).
 */
function PivotDeckReplay({ data, loading, error }) {
  const sessions = data?.sessions || [];
  const [revealed, setRevealed] = useState(false);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [phase, setPhase] = useState('idle');
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [detailRaised, setDetailRaised] = useState(false);
  const timersRef = useRef([]);

  const session = sessions[sessionIndex] || null;
  const cards = session?.cards || [];
  const current = cards[cardIndex] || null;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
  }, []);

  const wait = useCallback((ms, fn) => {
    const id = setTimeout(fn, skipMotion() ? 0 : Math.max(0, ms));
    timersRef.current.push(id);
  }, []);

  const resetPlayhead = useCallback(() => {
    clearTimers();
    setCardIndex(0);
    setPhase('idle');
    setCompleted(false);
    setPlaying(false);
    setDetailRaised(false);
  }, [clearTimers]);

  useEffect(() => {
    setRevealed(false);
    resetPlayhead();
  }, [data?.user?.userId, data?.batchWeek, resetPlayhead]);

  useEffect(() => {
    resetPlayhead();
  }, [sessionIndex, resetPlayhead]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (phase === 'detail-open' || phase === 'detail') {
      const frame = requestAnimationFrame(() => setDetailRaised(true));
      return () => cancelAnimationFrame(frame);
    }
    setDetailRaised(false);
    return undefined;
  }, [phase]);

  useEffect(() => {
    if (!playing || !current || completed) return undefined;
    const detail = resolveDetailReplayTiming(current);
    const scaled = (ms) => (skipMotion() ? 0 : ms / speed);

    if (phase === 'idle') {
      const next = detail ? 'detail-open' : 'swipe';
      wait(scaled(detail ? detail.beforeOpen : current.dwellMs), () => setPhase(next));
      return () => clearTimers();
    }

    if (phase === 'detail-open') {
      wait(scaled(DETAIL_OPEN_MS), () => setPhase('detail'));
      return () => clearTimers();
    }

    if (phase === 'detail') {
      wait(scaled(detail?.hold ?? MIN_DETAIL_HOLD_MS), () => setPhase('detail-close'));
      return () => clearTimers();
    }

    if (phase === 'detail-close') {
      wait(scaled(DETAIL_CLOSE_MS), () => setPhase('swipe'));
      return () => clearTimers();
    }

    if (phase === 'swipe') {
      const swipeWait = skipMotion() ? 0 : SWIPE_MS / Math.min(speed, 4);
      wait(swipeWait, () => {
        if (cardIndex >= cards.length - 1) {
          setPlaying(false);
          setCompleted(true);
          setPhase('idle');
          return;
        }
        setCardIndex((index) => index + 1);
        setPhase('idle');
      });
      return () => clearTimers();
    }

    return undefined;
  }, [
    playing,
    phase,
    current,
    completed,
    cardIndex,
    cards.length,
    speed,
    wait,
    clearTimers,
  ]);

  const play = useCallback(() => {
    if (!cards.length) return;
    if (completed) {
      setCardIndex(0);
      setCompleted(false);
      setPhase('idle');
    }
    setRevealed(true);
    setPlaying(true);
  }, [cards.length, completed]);

  const pause = useCallback(() => {
    clearTimers();
    setPlaying(false);
    setPhase('idle');
    setDetailRaised(false);
  }, [clearTimers]);

  const skip = useCallback(() => {
    clearTimers();
    setPhase('idle');
    setDetailRaised(false);
    if (cardIndex >= cards.length - 1) {
      setPlaying(false);
      setCompleted(true);
      return;
    }
    setCardIndex((index) => index + 1);
  }, [cardIndex, cards.length, clearTimers]);

  const progress = cards.length
    ? completed
      ? 1
      : Math.min(1, (cardIndex + (phase === 'swipe' ? 1 : 0)) / cards.length)
    : 0;

  const remaining = useMemo(
    () => (completed ? [] : cards.slice(cardIndex, cardIndex + 4)),
    [cards, cardIndex, completed],
  );
  const layout = useMemo(() => resolvePivotDeckReplayLayout(), []);
  const phoneVars = useMemo(() => pivotDeckReplayPhoneVars(layout), [layout]);

  const cardCount = sessions.reduce((sum, item) => sum + (item.cards?.length || 0), 0);

  if (loading) {
    return <p className="pivot-tenant-journeys__muted">Loading deck replay…</p>;
  }

  if (error) {
    return (
      <p className="pivot-lab__error" role="alert">
        {typeof error === 'string' ? error : 'Unable to load deck replay.'}
      </p>
    );
  }

  if (!sessions.length) {
    return (
      <p className="pivot-lab__empty">
        No deck swipe rows for this week. Replay needs pass/interested on the deck
        surface (dwell when present).
      </p>
    );
  }

  const overlaySide = phase === 'swipe' ? current?.action : null;

  if (!revealed) {
    return (
      <div className="pivot-deck-replay pivot-deck-replay--collapsed">
        <button type="button" className="linear-btn linear-btn--primary" onClick={play}>
          Replay
        </button>
        <p className="pivot-deck-replay__status">
          {cardCount} card{cardCount === 1 ? '' : 's'}
          {sessions.length > 1 ? ` · ${sessions.length} sessions` : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="pivot-deck-replay">
      <div className="pivot-deck-replay__toolbar">
        <p className="pivot-deck-replay__status">
          Session {sessionIndex + 1}/{sessions.length}
          {completed
            ? ' · done'
            : current
              ? ` · ${cardIndex + 1}/${cards.length} · ${formatDwell(current.dwellMs)} dwell`
              : ''}
          {current?.openedDetail && !completed ? ' · opened detail' : ''}
        </p>
        <div className="pivot-deck-replay__controls">
          {sessions.length > 1 ? (
            <label className="pivot-deck-replay__session">
              Session
              <select
                aria-label="Replay session"
                value={sessionIndex}
                onChange={(event) => {
                  pause();
                  setSessionIndex(Number(event.target.value));
                }}
              >
                {sessions.map((item, index) => (
                  <option key={item.startedAt || index} value={index}>
                    {index + 1} · {item.cards.length} cards
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            className="linear-btn linear-btn--ghost"
            onClick={() =>
              setSpeed((value) => SPEEDS[(SPEEDS.indexOf(value) + 1) % SPEEDS.length])
            }
          >
            {speed}×
          </button>
          {playing ? (
            <button type="button" className="linear-btn linear-btn--secondary" onClick={pause}>
              Pause
            </button>
          ) : (
            <button type="button" className="linear-btn linear-btn--primary" onClick={play}>
              Replay
            </button>
          )}
          <button
            type="button"
            className="linear-btn linear-btn--ghost"
            onClick={skip}
            disabled={!cards.length || completed}
          >
            Next
          </button>
        </div>
      </div>

      <div className="pivot-deck-replay__phone-fit" style={phoneVars}>
        <div className="pivot-deck-replay__phone" aria-label="Deck replay">
          <div
            className="pivot-deck-replay__progress"
            role="progressbar"
            aria-label="Deck replay progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <div
              className="pivot-deck-replay__progress-fill"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="pivot-deck-replay__stack-host">
            <div className="pivot-deck-replay__viewport">
              <div className="pivot-deck-replay__stack">
                {remaining.length === 0 ? (
                  <p className="pivot-deck-replay__caught-up">caught up</p>
                ) : (
                  remaining
                    .map((card, depth) => {
                      const transform = stackTransform(depth, cardIndex + depth);
                      const leaving = depth === 0 && overlaySide;
                      const flyX =
                        overlaySide === 'pass'
                          ? '-160%'
                          : overlaySide === 'interested'
                            ? '160%'
                            : '0';
                      const flyRotate =
                        overlaySide === 'pass'
                          ? '-18deg'
                          : overlaySide === 'interested'
                            ? '18deg'
                            : `${transform.rotate}deg`;
                      return (
                        <div
                          key={`${card.eventId}-${card.actedAt}`}
                          className={`pivot-deck-replay__sheet${leaving ? ' is-leaving' : ''}`}
                          style={{
                            zIndex: 10 - depth,
                            transform: leaving
                              ? `translateX(${flyX}) rotate(${flyRotate})`
                              : `rotate(${transform.rotate}deg) scale(${transform.scale})`,
                          }}
                        >
                          <ReplayEventCard event={card.event} />
                          {leaving ? (
                            <div
                              className={`pivot-deck-replay__overlay pivot-deck-replay__overlay--${overlaySide}`}
                              aria-hidden="true"
                            >
                              <span className="pivot-deck-replay__overlay-chip">
                                {overlaySide === 'pass' ? 'skip' : 'interested'}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                    .reverse()
                )}
              </div>
            </div>
            {current
              && (phase === 'detail-open' || phase === 'detail' || phase === 'detail-close') ? (
              <ReplayEventDetail event={current.event} open={detailRaised} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PivotDeckReplay;
