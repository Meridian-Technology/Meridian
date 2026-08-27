import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import justGoWordmark from '../../assets/pivot/just-go-wordmark-dark.svg';
import { JUSTGO_IOS_STORE_URL } from '../JustGoLanding/justGoLandingCopy';
import { resolvePublicEventCopy } from './justGoPublicEventCopy';
import { formatPublicEventDate } from './justGoPublicEventFormat';
import './JustGoPublicEvent.scss';

function ClockIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 5.5v4.8l3.2 1.8"/></svg>;
}

function PinIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 18s5-5.8 5-10a5 5 0 1 0-10 0c0 4.2 5 10 5 10Z"/><circle cx="10" cy="8" r="1.6"/></svg>;
}

function Loading({ copy }) {
  return <div className="justgo-event__state" role="status" aria-live="polite"><span className="justgo-event__loader" aria-hidden="true" />{copy.loading}</div>;
}

function EventPoster({ event, copy }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = failed ? null : event.image?.url;
  return (
    <div className={`justgo-event__poster${imageUrl ? '' : ' justgo-event__poster--empty'}`}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={`${event.title} — ${copy.imageAlt}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <span role="img" aria-label={copy.missingImageAlt}>{copy.productName}</span>
      )}
    </div>
  );
}

function Unavailable({ copy, retry, transient }) {
  return (
    <section className="justgo-event__unavailable" aria-labelledby="event-unavailable-title">
      <span className="justgo-event__scribble" aria-hidden="true">?</span>
      <h1 id="event-unavailable-title">{copy.unavailableTitle}</h1>
      <p>{copy.unavailableBody}</p>
      {transient ? <button type="button" className="justgo-event__button" onClick={retry}>{copy.retry}</button> : null}
      <a
        className="justgo-event__button justgo-event__button--download"
        href={JUSTGO_IOS_STORE_URL}
        aria-label={copy.appStore}
      >
        {copy.appStore}<span aria-hidden="true">→</span>
      </a>
      <p className="justgo-event__download">{copy.downloadPrompt}</p>
    </section>
  );
}

export default function JustGoPublicEvent() {
  const { eventId } = useParams();
  const [state, setState] = useState({ status: 'loading', event: null, language: null });
  const [attempt, setAttempt] = useState(0);
  const copy = useMemo(() => resolvePublicEventCopy(state.language), [state.language]);

  useEffect(() => {
    if (state.status !== 'unavailable') return undefined;
    const robots = document.createElement('meta');
    robots.setAttribute('name', 'robots');
    robots.setAttribute('content', 'noindex, nofollow');
    robots.setAttribute('data-justgo-event-unavailable', '1');
    document.head.appendChild(robots);
    return () => robots.remove();
  }, [state.status]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setState((current) => ({ ...current, status: 'loading', event: null }));
      try {
        const [eventResponse, languageResponse] = await Promise.all([
          fetch(`/api/public/events/${encodeURIComponent(eventId)}`, { signal: controller.signal }),
          fetch(`/api/public/events/${encodeURIComponent(eventId)}/language`, {
            signal: controller.signal,
          }).catch(() => null),
        ]);
        if (controller.signal.aborted) return;
        const languagePayload = languageResponse?.ok ? await languageResponse.json() : null;
        if (eventResponse.status === 404) {
          setState({ status: 'unavailable', event: null, language: languagePayload?.language });
          return;
        }
        if (!eventResponse.ok) throw new Error('event request failed');
        const payload = await eventResponse.json();
        if (!payload?.data) throw new Error('invalid event response');
        setState({ status: 'ready', event: payload.data, language: languagePayload?.language });
      } catch (error) {
        if (!controller.signal.aborted && error?.name !== 'AbortError') {
          setState((current) => ({ ...current, status: 'error', event: null }));
        }
      }
    };
    load();
    return () => controller.abort();
  }, [attempt, eventId]);

  const event = state.event;
  const when = useMemo(() => formatPublicEventDate(event), [event]);
  const actionable = event?.registrationCapability === 'in_app' || event?.registrationCapability === 'external';
  const ctaLabel = actionable ? copy.registerCta : copy.openAppCta;
  const ctaA11y = actionable ? copy.registerA11y : copy.openAppA11y;

  return (
    <div className="justgo-event">
      <div className="justgo-event__grain" aria-hidden="true" />
      <header className="justgo-event__header">
        <a href="/" aria-label={copy.productName}><img src={justGoWordmark} alt={copy.productName} /></a>
      </header>
      <main className="justgo-event__main" id="event">
        {state.status === 'loading' ? <Loading copy={copy} /> : null}
        {state.status === 'unavailable' || state.status === 'error' ? (
          <Unavailable copy={copy} transient={state.status === 'error'} retry={() => setAttempt((value) => value + 1)} />
        ) : null}
        {state.status === 'ready' && event ? (
          <article className="justgo-event__layout">
            <EventPoster key={`${event.id}:${event.image?.url || ''}`} event={event} copy={copy} />
            <div className="justgo-event__content">
              {event.lifecycleStatus !== 'upcoming' ? <div className={`justgo-event__status justgo-event__status--${event.lifecycleStatus}`}>{event.lifecycleStatus === 'ended' ? copy.ended : copy.ongoing}</div> : null}
              <h1>{event.title}</h1>
              <div className="justgo-event__facts">
                {when ? <div className="justgo-event__fact"><ClockIcon /><div><strong>{when.date}</strong><span>{when.startTime} {copy.dateSeparator} {when.endTime}</span><small>{copy.timezoneLabel} {event.timezone}</small></div></div> : null}
                <div className="justgo-event__fact"><PinIcon /><div><small>{copy.venueLabel}</small><strong>{event.venue.text}</strong></div></div>
              </div>
              <div className="justgo-event__organizer">
                {event.organizer.imageUrl ? <img src={event.organizer.imageUrl} alt="" /> : <span aria-hidden="true">{event.organizer.name.slice(0, 1)}</span>}
                <p><small>{copy.organizerLabel}</small><strong>{event.organizer.name}</strong></p>
              </div>
              {event.description ? <p className="justgo-event__description">{event.description}</p> : null}
              <a className="justgo-event__button" href={event.canonicalUrl} aria-label={ctaA11y}>{ctaLabel}<span aria-hidden="true">→</span></a>
              <p className="justgo-event__download">{copy.downloadPrompt}</p>
            </div>
          </article>
        ) : null}
      </main>
    </div>
  );
}
