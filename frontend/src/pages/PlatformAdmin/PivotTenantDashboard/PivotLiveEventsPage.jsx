import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { PivotOpsBanner, PivotOpsPage, PivotOpsSection, PivotOpsStatus } from '../../../components/PivotOps';
import {
  LIVE_DRAWN_FIGHTERS,
  LIVE_EVENTS_PATH,
  LIVE_INTRO_LAYOUTS,
  blankLiveCard,
  blankLiveMatch,
  blankLiveSide,
  drawnFighterName,
  drawnFighterUrl,
  liveCardFromDefinition,
  liveDefinitionFromCard,
  liveEventPaths,
  liveFanLink,
  liveSpotterLink,
  moveItem,
  validateLiveEventId,
} from './liveEventsAdmin';
import './PivotLiveEventsPage.scss';

const NO_FETCH_CACHE = { enabled: false };

function requestMessage(result, fallback) {
  return result?.data?.message || result?.error || fallback;
}

function Field({ label, hint, children, wide = false }) {
  return (
    <label className={`live-field${wide ? ' live-field--wide' : ''}`}>
      <span className="live-field__label">{label}</span>
      {children}
      {hint ? <span className="live-field__hint">{hint}</span> : null}
    </label>
  );
}

function ColorInput({ value, onChange, placeholder = '#RRGGBB' }) {
  const valid = /^#[0-9A-Fa-f]{6}$/.test(value || '');
  return (
    <span className="live-color">
      <input
        type="color"
        value={valid ? value : '#ffffff'}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        aria-label="Pick a colour"
      />
      <input
        type="text"
        value={value || ''}
        placeholder={placeholder}
        maxLength={7}
        onChange={(event) => onChange(event.target.value.trim())}
      />
    </span>
  );
}

/**
 * A photo for the card: an upload (cut-outs keep their transparency), the
 * app's drawn fighters (corners only), or a pasted https link.
 */
function ImageField({ eventId, saved, value, onChange, allowDrawn = false }) {
  const { addNotification } = useNotification();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const drawn = drawnFighterName(value);

  const upload = useCallback(async (file) => {
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append('image', file);
    const result = await authenticatedRequest(liveEventPaths(eventId).image, { method: 'POST', data: form });
    setUploading(false);
    if (!result.data?.success) {
      addNotification({ title: 'Image not uploaded', message: requestMessage(result, 'The upload failed.'), type: 'error' });
      return;
    }
    onChange(result.data.data.url, { cutout: result.data.data.cutout });
  }, [addNotification, eventId, onChange]);

  return (
    <div className="live-image">
      <div className={`live-image__preview${drawn ? ' is-drawn' : ''}`}>
        {value && !drawn ? <img src={value} alt="" /> : null}
        {drawn ? <span>drawn: {drawn}</span> : null}
        {!value ? <span>no image</span> : null}
      </div>
      <div className="live-image__controls">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(event) => {
            upload(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          className="live-button"
          disabled={!saved || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        {allowDrawn ? (
          <select
            value={drawn}
            onChange={(event) => onChange(event.target.value ? drawnFighterUrl(event.target.value) : '', { cutout: false })}
            aria-label="Drawn fighter"
          >
            <option value="">Drawn fighter…</option>
            {LIVE_DRAWN_FIGHTERS.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        ) : null}
        {value ? (
          <button type="button" className="live-button live-button--quiet" onClick={() => onChange('', { cutout: false })}>
            Remove
          </button>
        ) : null}
        {!saved ? <span className="live-field__hint">Save the event first to upload.</span> : null}
      </div>
    </div>
  );
}

function SideEditor({ side, index, eventId, saved, canRemove, onChange, onRemove }) {
  const set = (patch) => onChange({ ...side, ...patch });
  const isDrawn = Boolean(drawnFighterName(side.imageUrl));
  return (
    <div className="live-side">
      <div className="live-side__head">
        <span className="live-side__swatch" style={{ background: side.color || '#ccc' }} />
        <strong>Corner {index + 1}</strong>
        {canRemove ? (
          <button type="button" className="live-button live-button--quiet" onClick={onRemove}>Remove corner</button>
        ) : null}
      </div>
      <div className="live-grid">
        <Field label="Name"><input value={side.name} maxLength={80} placeholder="Vega Storm" onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Line under the name"><input value={side.detail} maxLength={80} placeholder="blue corner" onChange={(e) => set({ detail: e.target.value })} /></Field>
        <Field label="Colour"><ColorInput value={side.color} onChange={(color) => set({ color })} /></Field>
        <Field label="Sticker" hint="Optional: champ, debut, hometown hero"><input value={side.badge} maxLength={24} onChange={(e) => set({ badge: e.target.value })} /></Field>
        <Field label="Image" wide>
          <ImageField
            eventId={eventId}
            saved={saved}
            value={side.imageUrl}
            allowDrawn
            onChange={(imageUrl, { cutout } = {}) => set({ imageUrl, imageCutout: Boolean(cutout) })}
          />
        </Field>
        {side.imageUrl && !isDrawn ? (
          <label className="live-check live-field--wide">
            <input type="checkbox" checked={side.imageCutout} onChange={(e) => set({ imageCutout: e.target.checked })} />
            <span>Cut-out on a transparent background (head and shoulders). Uploads with transparency tick this for you.</span>
          </label>
        ) : null}
      </div>
    </div>
  );
}

function MatchEditor({ match, index, count, eventId, saved, onChange, onMove, onRemove }) {
  const set = (patch) => onChange({ ...match, ...patch });
  const setSide = (sideIndex, side) => set({ sides: match.sides.map((each, i) => (i === sideIndex ? side : each)) });
  return (
    <div className="live-match">
      <div className="live-match__head">
        <h3>Match {index + 1}</h3>
        <div className="live-match__actions">
          <button type="button" className="live-button live-button--quiet" disabled={index === 0} onClick={() => onMove(-1)}>Up</button>
          <button type="button" className="live-button live-button--quiet" disabled={index === count - 1} onClick={() => onMove(1)}>Down</button>
          <button type="button" className="live-button live-button--quiet" disabled={count === 1} onClick={onRemove}>Remove match</button>
        </div>
      </div>
      <div className="live-grid">
        <Field label="Title"><input value={match.title} maxLength={120} placeholder="rex vs. vega" onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Line above it" hint="Defaults to “match 1”, “match 2”…"><input value={match.kicker} maxLength={80} placeholder="main event" onChange={(e) => set({ kicker: e.target.value })} /></Field>
        <Field label="Question while picks are open" hint="Defaults to “who takes it?”"><input value={match.callPrompt} maxLength={80} onChange={(e) => set({ callPrompt: e.target.value })} /></Field>
      </div>
      {match.sides.map((side, sideIndex) => (
        <SideEditor
          key={side.id}
          side={side}
          index={sideIndex}
          eventId={eventId}
          saved={saved}
          canRemove={match.sides.length > 2}
          onChange={(next) => setSide(sideIndex, next)}
          onRemove={() => set({ sides: match.sides.filter((_, i) => i !== sideIndex) })}
        />
      ))}
      {match.sides.length < 4 ? (
        <button type="button" className="live-button" onClick={() => set({ sides: [...match.sides, blankLiveSide(match)] })}>
          Add a corner ({match.sides.length + 1}-way)
        </button>
      ) : null}
    </div>
  );
}

function IntroEditor({ intro, eventId, saved, onChange }) {
  const set = (patch) => onChange({ ...intro, ...patch });
  const setFact = (index, patch) => set({ facts: intro.facts.map((fact, i) => (i === index ? { ...fact, ...patch } : fact)) });
  return (
    <div className="live-grid">
      <Field label="Layout" wide>
        <select value={intro.layout} onChange={(e) => set({ layout: e.target.value })}>
          {LIVE_INTRO_LAYOUTS.map((layout) => <option key={layout.value} value={layout.value}>{layout.label}</option>)}
        </select>
      </Field>
      <Field label={intro.layout === 'poster' ? 'Flier' : intro.layout === 'backdrop' ? 'Backdrop image' : 'Banner'} wide>
        <ImageField eventId={eventId} saved={saved} value={intro.imageUrl} onChange={(imageUrl) => set({ imageUrl })} />
      </Field>
      {intro.layout === 'backdrop' ? (
        <Field label={`Where the image's art ends: ${Math.round(intro.imageEnd * 100)}% down`} hint="The details start there. Match the colour below to the image's flat part.">
          <input type="range" min="0.2" max="0.95" step="0.01" value={intro.imageEnd} onChange={(e) => set({ imageEnd: Number(e.target.value) })} />
        </Field>
      ) : null}
      <Field label="Background colour" hint="Defaults to the event colour"><ColorInput value={intro.color} onChange={(color) => set({ color })} /></Field>
      <Field label="Align">
        <select value={intro.align} onChange={(e) => set({ align: e.target.value })}>
          <option value="start">Left</option>
          <option value="center">Centred</option>
        </select>
      </Field>
      <Field label="Presented by"><input value={intro.presenterName} maxLength={80} placeholder="iowa underground" onChange={(e) => set({ presenterName: e.target.value })} /></Field>
      <Field label="Presenter line" hint="Over the name, or use {name}: “{name} presents”"><input value={intro.presenterLabel} maxLength={40} placeholder="presented by" onChange={(e) => set({ presenterLabel: e.target.value })} /></Field>
      <Field label="Line above the title"><input value={intro.kicker} maxLength={80} placeholder="no ring / no rules" onChange={(e) => set({ kicker: e.target.value })} /></Field>
      <Field label="Title" hint="Defaults to the event title"><input value={intro.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} /></Field>
      <Field label="Body" wide><textarea rows={2} value={intro.body} maxLength={400} placeholder="pick who wins each match, then cheer your corner." onChange={(e) => set({ body: e.target.value })} /></Field>
      <div className="live-field live-field--wide">
        <span className="live-field__label">Quick facts</span>
        {intro.facts.map((fact, index) => (
          <div className="live-fact" key={index}>
            <input value={fact.label} maxLength={24} placeholder="when" onChange={(e) => setFact(index, { label: e.target.value })} />
            <input value={fact.value} maxLength={60} placeholder="fri oct 30 · doors 7pm" onChange={(e) => setFact(index, { value: e.target.value })} />
            <button type="button" className="live-button live-button--quiet" onClick={() => set({ facts: intro.facts.filter((_, i) => i !== index) })}>Remove</button>
          </div>
        ))}
        {intro.facts.length < 6 ? (
          <button type="button" className="live-button" onClick={() => set({ facts: [...intro.facts, { label: '', value: '' }] })}>Add a fact</button>
        ) : null}
      </div>
      <Field label="Button"><input value={intro.cta} maxLength={40} placeholder="step in" onChange={(e) => set({ cta: e.target.value })} /></Field>
      {intro.layout === 'card' ? (
        <label className="live-check">
          <input type="checkbox" checked={intro.showCard} onChange={(e) => set({ showCard: e.target.checked })} />
          <span>Show tonight’s matches on it</span>
        </label>
      ) : null}
    </div>
  );
}

function ShareSection({ event, cities }) {
  const { addNotification } = useNotification();
  const [city, setCity] = useState(cities.includes('ic') ? 'ic' : cities[0] || 'ic');
  const [source, setSource] = useState('');
  const qrRef = useRef(null);
  const fanLink = liveFanLink({ city, eventId: event.eventId, source });
  const spotterLink = liveSpotterLink(event.eventId);

  const copy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      addNotification({ title: `${label} copied`, type: 'success' });
    } catch (_) {
      addNotification({ title: 'Couldn’t copy', message: value, type: 'error' });
    }
  };

  const downloadQr = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${event.eventId}${source ? `-${source}` : ''}-qr.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PivotOpsSection title="Share" description="The QR goes on posters and screens at the venue. The spotter runs the night from the console.">
      <div className="live-share">
        <div className="live-share__qr" ref={qrRef}>
          <QRCodeSVG value={fanLink} size={176} level="Q" marginSize={2} />
        </div>
        <div className="live-share__links">
          <div className="live-grid">
            <Field label="City" hint="The App Clip opens for this city">
              <select value={city} onChange={(e) => setCity(e.target.value)}>
                {(cities.length ? cities : ['ic']).map((key) => <option key={key} value={key}>{key}</option>)}
              </select>
            </Field>
            <Field label="Where this code hangs" hint="Optional: door, bar, ring. Shows which code got scanned.">
              <input value={source} maxLength={32} onChange={(e) => setSource(e.target.value)} />
            </Field>
          </div>
          <div className="live-link">
            <span className="live-field__label">Fan link</span>
            <code>{fanLink}</code>
            <div className="live-link__actions">
              <button type="button" className="live-button" onClick={() => copy(fanLink, 'Fan link')}>Copy</button>
              <button type="button" className="live-button" onClick={downloadQr}>Download QR (SVG)</button>
            </div>
          </div>
          <div className="live-link">
            <span className="live-field__label">Spotter console</span>
            <code>{spotterLink}</code>
            <div className="live-link__actions">
              <button type="button" className="live-button" onClick={() => copy(spotterLink, 'Spotter link')}>Copy</button>
              <a className="live-button" href={spotterLink} target="_blank" rel="noreferrer">Open</a>
            </div>
          </div>
        </div>
      </div>
    </PivotOpsSection>
  );
}

function ResetSection({ event, onReset }) {
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <PivotOpsSection
      title="Reset the night"
      description="Clears the spotter’s calls and every fan’s picks and name. The card and PIN stay. Phones in the event reconnect and start over. Use it after a rehearsal, never during a show."
    >
      <div className="live-reset">
        <input value={confirm} placeholder={`Type ${event.eventId}`} onChange={(e) => setConfirm(e.target.value)} />
        <button
          type="button"
          className="live-button live-button--danger"
          disabled={confirm !== event.eventId || busy}
          onClick={async () => {
            setBusy(true);
            await onReset(confirm);
            setBusy(false);
            setConfirm('');
          }}
        >
          Reset
        </button>
      </div>
    </PivotOpsSection>
  );
}

function PivotLiveEventsPage({ tenants = [] }) {
  const { addNotification } = useNotification();
  const { data, loading, refetch } = useFetch(LIVE_EVENTS_PATH, { cache: NO_FETCH_CACHE });
  const events = data?.success ? data.data?.events || [] : [];
  const cities = useMemo(() => tenants.map((tenant) => tenant.tenantKey).filter(Boolean), [tenants]);

  /** `{eventId, isNew, card, pin, saved, event}` while editing. */
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const openEvent = useCallback(async (eventId) => {
    const result = await authenticatedRequest(liveEventPaths(eventId).event);
    if (!result.data?.success) {
      addNotification({ title: 'Couldn’t open the event', message: requestMessage(result, 'Try again.'), type: 'error' });
      return;
    }
    const { event } = result.data.data;
    setDraft({ eventId, isNew: false, card: liveCardFromDefinition(event.definition), pin: '', event });
    setErrors([]);
    setDirty(false);
  }, [addNotification]);

  const startNew = () => {
    setDraft({ eventId: '', isNew: true, card: blankLiveCard(), pin: '', event: null });
    setErrors([]);
    setDirty(false);
  };

  const update = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  };
  const updateCard = (patch) => update({ card: { ...draft.card, ...patch } });

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    const idError = draft.isNew ? validateLiveEventId(draft.eventId) : '';
    if (idError) {
      setErrors([idError]);
      return;
    }
    if (draft.isNew && !/^\d{4,8}$/.test(draft.pin)) {
      setErrors(['Set a spotter PIN: 4 to 8 digits.']);
      return;
    }
    setSaving(true);
    const eventId = draft.eventId.trim();
    const result = await authenticatedRequest(liveEventPaths(eventId).event, {
      method: 'PUT',
      data: {
        definition: liveDefinitionFromCard(draft.card),
        pin: draft.pin || undefined,
        create: draft.isNew,
      },
    });
    setSaving(false);
    if (!result.data?.success) {
      setErrors(result.data?.errors?.length ? result.data.errors : [requestMessage(result, 'The event wasn’t saved.')]);
      return;
    }
    const { event } = result.data.data;
    setDraft({ eventId, isNew: false, card: liveCardFromDefinition(event.definition), pin: '', event });
    setErrors([]);
    setDirty(false);
    refetch();
    addNotification({ title: draft.isNew ? 'Event created' : 'Saved', message: 'Phones in the event see the change now.', type: 'success' });
  };

  const reset = async (confirm) => {
    const result = await authenticatedRequest(liveEventPaths(draft.eventId).reset, { method: 'POST', data: { confirm } });
    if (!result.data?.success) {
      addNotification({ title: 'Not reset', message: requestMessage(result, 'Try again.'), type: 'error' });
      return;
    }
    setDraft((current) => ({ ...current, event: result.data.data.event }));
    refetch();
    addNotification({ title: 'Night reset', message: 'Calls, picks and names are cleared.', type: 'success' });
  };

  const card = draft?.card;
  const saved = Boolean(draft && !draft.isNew);

  return (
    <PivotOpsPage
      title="Live"
      subtitle="Crowd games for live shows: fans pick who wins before the bell, then cheer their corner."
      actions={<button type="button" className="live-button live-button--primary" onClick={startNew}>New event</button>}
      className="live-events"
    >
      <PivotOpsSection title="Events">
        {loading && !events.length ? <p className="live-muted">Loading…</p> : null}
        {!loading && !events.length ? <p className="live-muted">No live events yet. Start one with “New event”.</p> : null}
        <div className="live-list">
          {events.map((event) => (
            <button
              type="button"
              key={event.eventId}
              className={`live-list__row${draft?.eventId === event.eventId ? ' is-selected' : ''}`}
              onClick={() => (dirty && !window.confirm('Discard unsaved changes?') ? null : openEvent(event.eventId))}
            >
              <span className="live-list__title">{event.title}</span>
              <span className="live-list__meta">{event.eventId} · {event.matches} matches · {event.fans} fans</span>
              <PivotOpsStatus tone={event.status?.tone}>{event.status?.label}</PivotOpsStatus>
            </button>
          ))}
        </div>
      </PivotOpsSection>

      {draft ? (
        <>
          {saved && draft.event ? <ShareSection key={draft.eventId} event={draft.event} cities={cities} /> : null}

          <PivotOpsSection title={draft.isNew ? 'New event' : 'Event'}>
            <div className="live-grid">
              <Field label="Event id" hint={draft.isNew ? 'Goes in the QR code and can’t change. e.g. underground-6' : 'Fixed: it’s in the QR code.'}>
                <input value={draft.eventId} disabled={!draft.isNew} maxLength={64} onChange={(e) => update({ eventId: e.target.value.trim() })} />
              </Field>
              <Field label="Title"><input value={card.title} maxLength={120} placeholder="underground pro-wrestling 6" onChange={(e) => updateCard({ title: e.target.value })} /></Field>
              <Field label="Line above the title"><input value={card.kicker} maxLength={80} placeholder="iowa underground · live" onChange={(e) => updateCard({ kicker: e.target.value })} /></Field>
              <Field label="Event colour" hint="Buttons and highlights"><ColorInput value={card.accent} onChange={(accent) => updateCard({ accent })} /></Field>
              <Field label="Spotter PIN" hint={draft.isNew ? 'Required: 4 to 8 digits' : draft.event?.hasPin ? 'Set. Type a new one to change it.' : 'Not set'}>
                <input type="password" inputMode="numeric" autoComplete="new-password" value={draft.pin} maxLength={8} onChange={(e) => update({ pin: e.target.value.replace(/\D/g, '') })} />
              </Field>
              {draft.event ? (
                <div className="live-field">
                  <span className="live-field__label">Tonight</span>
                  <span><PivotOpsStatus tone={draft.event.status?.tone}>{draft.event.status?.label}</PivotOpsStatus> {draft.event.fans} fans</span>
                </div>
              ) : null}
            </div>
          </PivotOpsSection>

          <PivotOpsSection title="Opening screen" description="What fans see first. Everything is optional.">
            <IntroEditor intro={card.intro} eventId={draft.eventId} saved={saved} onChange={(intro) => updateCard({ intro })} />
          </PivotOpsSection>

          <PivotOpsSection
            title="Matches"
            description="In running order. Each match has 2 to 4 corners. Renaming is safe mid-night; picks stay with their corner."
          >
            {card.matches.map((match, index) => (
              <MatchEditor
                key={match.id}
                match={match}
                index={index}
                count={card.matches.length}
                eventId={draft.eventId}
                saved={saved}
                onChange={(next) => updateCard({ matches: card.matches.map((each, i) => (i === index ? next : each)) })}
                onMove={(delta) => updateCard({ matches: moveItem(card.matches, index, delta) })}
                onRemove={() => updateCard({ matches: card.matches.filter((_, i) => i !== index) })}
              />
            ))}
            <button type="button" className="live-button" onClick={() => updateCard({ matches: [...card.matches, blankLiveMatch(card.matches)] })}>
              Add a match
            </button>
          </PivotOpsSection>

          {saved && draft.event ? <ResetSection event={draft.event} onReset={reset} /> : null}

          <div className="live-savebar">
            {errors.length ? (
              <PivotOpsBanner tone="danger" title="Not saved">
                <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
              </PivotOpsBanner>
            ) : null}
            <div className="live-savebar__row">
              <span className="live-muted">{dirty ? 'Unsaved changes' : saved ? 'All changes saved' : ''}</span>
              <button type="button" className="live-button live-button--primary" disabled={saving} onClick={save}>
                {saving ? 'Saving…' : draft.isNew ? 'Create event' : 'Save'}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </PivotOpsPage>
  );
}

export default PivotLiveEventsPage;
