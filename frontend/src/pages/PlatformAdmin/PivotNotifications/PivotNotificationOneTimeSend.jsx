import React, { useCallback, useMemo, useState } from 'react';
import { authenticatedRequest, useFetch } from '../../../hooks/useFetch';
import PivotNotificationWhoRules from './PivotNotificationWhoRules';
import PivotNotificationSendNow from './PivotNotificationSendNow';
import './PivotNotificationOneTimeSend.scss';

const NO_FETCH_CACHE = { enabled: false };
const TITLE_MAX = 100;
const BODY_MAX = 240;

function cityLabel(tenant) {
  const key = tenant?.tenantKey || '';
  const name = tenant?.location || tenant?.name || '';
  if (name && name.toLowerCase() !== key) return `${name} · ${key}`;
  return name || key;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toLocalInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function blankDraft(tenantKey) {
  return {
    label: '',
    title: '',
    body: '',
    cities: tenantKey ? [tenantKey] : [],
    rules: [],
    when: 'now',
    sendAtLocal: toLocalInput(new Date(Date.now() + 60 * 60 * 1000)),
  };
}

function validate(draft) {
  const errors = {};
  if (!draft.body.trim()) errors.body = 'Write a message';
  if (!draft.cities.length) errors.cities = 'Pick at least one city';
  if (draft.when === 'later') {
    const at = new Date(draft.sendAtLocal);
    if (Number.isNaN(at.getTime())) errors.sendAt = 'Pick a send time';
    else if (at.getTime() <= Date.now()) errors.sendAt = 'Pick a time in the future';
  }
  return errors;
}

/**
 * Compose a push for any cities, audience, and time, then hand off to the
 * same recipient review and confirmation as a schedule's "Send now".
 */
function PivotNotificationOneTimeSend({
  tenants = [],
  tenantKey = '',
  onClose,
  onSent,
}) {
  const scoped = String(tenantKey || '').trim().toLowerCase();
  const [draft, setDraft] = useState(() => blankDraft(scoped));
  const [errors, setErrors] = useState({});
  const [reviewing, setReviewing] = useState(null);

  const { data: catalogResponse } = useFetch(
    '/admin/meridian/jobs/notification-rule-catalog?handlerKey=scheduled_push',
    { cache: NO_FETCH_CACHE },
  );
  const catalog = catalogResponse?.success ? catalogResponse.data : null;

  const setField = (name, value) => setDraft((current) => ({ ...current, [name]: value }));

  const startReview = () => {
    const nextErrors = validate(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const sendAt = draft.when === 'later' ? new Date(draft.sendAtLocal).toISOString() : null;
    setReviewing({
      key: Date.now(),
      cities: [...draft.cities],
      body: {
        label: draft.label.trim() || null,
        title: draft.title.trim() || null,
        body: draft.body.trim(),
        rules: draft.rules,
        sendAt,
      },
    });
  };

  const reviewBody = reviewing?.body;
  const loadPreview = useCallback((key) => authenticatedRequest(
    '/admin/meridian/jobs/one-time/preview',
    {
      method: 'POST',
      data: { ...reviewBody, tenantKey: key },
      headers: { 'Content-Type': 'application/json' },
    },
  ), [reviewBody]);
  const submit = useCallback((body) => authenticatedRequest('/admin/meridian/jobs/one-time', {
    method: 'POST',
    data: { ...reviewBody, cities: body.cities, ignoreQuietHours: body.ignoreQuietHours === true },
    headers: { 'Content-Type': 'application/json' },
  }), [reviewBody]);
  const message = useMemo(
    () => (reviewBody ? { title: reviewBody.title, body: reviewBody.body } : null),
    [reviewBody],
  );

  if (reviewing) {
    return (
      <PivotNotificationSendNow
        key={reviewing.key}
        tenants={tenants}
        presetCities={reviewing.cities}
        loadPreview={loadPreview}
        submit={submit}
        name={reviewBody.label || 'This notification'}
        message={message}
        sendAt={reviewBody.sendAt}
        onBack={() => setReviewing(null)}
        onClose={onClose}
        onSent={onSent}
      />
    );
  }

  const allSelected = tenants.length > 0 && draft.cities.length === tenants.length;

  return (
    <section className="pivot-notification-one-time" aria-label="New one-time send">
      <header className="pivot-notification-one-time__head">
        <div>
          <p className="pivot-notification-one-time__step">Compose</p>
          <h3>New one-time send</h3>
        </div>
        <button type="button" className="linear-btn linear-btn--secondary" onClick={onClose}>
          Cancel
        </button>
      </header>

      <label className="linear-field">
        <span className="linear-field__label">Name (only admins see this)</span>
        <input
          aria-label="Send name"
          value={draft.label}
          maxLength={80}
          placeholder="Rain plan"
          onChange={(event) => setField('label', event.target.value)}
        />
      </label>

      <div className="pivot-notification-one-time__message">
        <label className="linear-field">
          <span className="linear-field__label">Title</span>
          <input
            aria-label="Push title"
            value={draft.title}
            maxLength={TITLE_MAX}
            placeholder="just go*"
            onChange={(event) => setField('title', event.target.value)}
          />
        </label>
        <label className="linear-field">
          <span className="linear-field__label">Message</span>
          <textarea
            aria-label="Push message"
            value={draft.body}
            maxLength={BODY_MAX}
            rows={3}
            onChange={(event) => setField('body', event.target.value)}
          />
        </label>
        <p className="pivot-notification-one-time__muted">{draft.body.length}/{BODY_MAX}</p>
        {errors.body ? <p className="pivot-notification-one-time__error" role="alert">{errors.body}</p> : null}
      </div>

      <fieldset className="pivot-notification-one-time__fieldset">
        <legend>Cities</legend>
        {scoped ? (
          <p className="pivot-notification-one-time__muted">
            {cityLabel(tenants.find((row) => row.tenantKey === scoped) || { tenantKey: scoped })}
          </p>
        ) : (
          <>
            <label className="linear-field linear-field--checkbox">
              <input
                type="checkbox"
                aria-label="All cities"
                checked={allSelected}
                onChange={(event) => setField('cities', event.target.checked ? tenants.map((row) => row.tenantKey) : [])}
              />
              <span>All cities</span>
            </label>
            <div className="pivot-notification-one-time__cities">
              {tenants.map((tenant) => (
                <label key={tenant.tenantKey} className="linear-field linear-field--checkbox">
                  <input
                    type="checkbox"
                    aria-label={`Send to ${cityLabel(tenant)}`}
                    checked={draft.cities.includes(tenant.tenantKey)}
                    onChange={(event) => setField('cities', event.target.checked
                      ? [...draft.cities, tenant.tenantKey]
                      : draft.cities.filter((key) => key !== tenant.tenantKey))}
                  />
                  <span>{cityLabel(tenant)}</span>
                </label>
              ))}
            </div>
          </>
        )}
        {errors.cities ? <p className="pivot-notification-one-time__error" role="alert">{errors.cities}</p> : null}
      </fieldset>

      <PivotNotificationWhoRules
        catalog={catalog}
        rules={draft.rules}
        labelPrefix="Who"
        emptyText="No conditions. Sends to everyone in those cities with push on."
        onChange={(rules) => setField('rules', rules)}
      />

      <fieldset className="pivot-notification-one-time__fieldset">
        <legend>When</legend>
        <div className="pivot-notification-one-time__when" role="radiogroup" aria-label="When to send">
          <label className="linear-field linear-field--checkbox">
            <input
              type="radio"
              name="one-time-when"
              aria-label="Send now"
              checked={draft.when === 'now'}
              onChange={() => setField('when', 'now')}
            />
            <span>Now</span>
          </label>
          <label className="linear-field linear-field--checkbox">
            <input
              type="radio"
              name="one-time-when"
              aria-label="Send later"
              checked={draft.when === 'later'}
              onChange={() => setField('when', 'later')}
            />
            <span>Later</span>
          </label>
          {draft.when === 'later' ? (
            <input
              type="datetime-local"
              aria-label="Send at"
              value={draft.sendAtLocal}
              onChange={(event) => setField('sendAtLocal', event.target.value)}
            />
          ) : null}
        </div>
        {draft.when === 'later' ? (
          <p className="pivot-notification-one-time__muted">In your time zone. Up to 60 days ahead.</p>
        ) : null}
        {errors.sendAt ? <p className="pivot-notification-one-time__error" role="alert">{errors.sendAt}</p> : null}
      </fieldset>

      <div className="pivot-notification-one-time__actions">
        <button type="button" className="linear-btn linear-btn--primary" onClick={startReview}>
          Review recipients
        </button>
      </div>
    </section>
  );
}

export default PivotNotificationOneTimeSend;
