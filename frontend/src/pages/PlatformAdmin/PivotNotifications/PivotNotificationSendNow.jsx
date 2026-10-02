import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { authenticatedRequest, useFetch } from '../../../hooks/useFetch';
import { PivotOpsStatus } from '../../../components/PivotOps';
import { scheduleName } from './notificationScheduleCopy';
import './PivotNotificationSendNow.scss';

const NO_FETCH_CACHE = { enabled: false };
const FLEET_KEY = '_fleet';

function cityLabel(tenants, tenantKey) {
  if (!tenantKey) return 'All platform admins';
  const tenant = tenants.find((row) => row.tenantKey === tenantKey);
  const name = tenant?.location || tenant?.name || '';
  if (name && name.toLowerCase() !== tenantKey) return `${name} · ${tenantKey}`;
  return name || tenantKey;
}

function personName(row) {
  return row?.name || row?.username || 'Unnamed user';
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function formatClock(iso, timezone) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: timezone });
  } catch {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
}

export function formatWhen(iso) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return `on ${parsed.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function matchesFilter(row, filter) {
  if (!filter) return true;
  const needle = filter.toLowerCase();
  return [row.name, row.username, row.userId]
    .some((value) => String(value || '').toLowerCase().includes(needle));
}

function defaultLoadPreview(definition) {
  return (key) => authenticatedRequest('/admin/meridian/jobs/notifications/eligibility', {
    params: {
      handlerKey: definition?.handlerKey,
      definitionKey: definition?.definitionKey,
      ...(key === FLEET_KEY ? {} : { tenantKey: key }),
    },
  });
}

function defaultSubmit(definition) {
  return (body) => authenticatedRequest(
    `/admin/meridian/jobs/definitions/${encodeURIComponent(definition.id)}/send-now`,
    { method: 'POST', data: body, headers: { 'Content-Type': 'application/json' } },
  );
}

/**
 * Walks a sender through every recipient before anything goes out. Used by a
 * schedule's "Send now" and by one-time sends (which pass their own preview,
 * submit, and preset cities).
 */
function PivotNotificationSendNow({
  definition = null,
  tenants = [],
  tenantKey = '',
  presetCities = null,
  loadPreview = null,
  submit = null,
  name: nameOverride = '',
  message = null,
  sendAt = null,
  onBack = null,
  onClose,
  onSent,
}) {
  const custom = Boolean(loadPreview);
  const handlerKey = definition?.handlerKey || '';
  const name = nameOverride || scheduleName(definition);
  const { data: handlersResponse, loading: handlersFetching } = useFetch(
    custom ? null : '/admin/meridian/jobs/handlers',
    { cache: NO_FETCH_CACHE },
  );
  const handlersLoading = !custom && handlersFetching;
  const handler = custom
    ? { scope: 'city', channel: 'push' }
    : (handlersResponse?.success ? handlersResponse.data || [] : [])
      .find((row) => row.handlerKey === handlerKey) || null;
  const fleet = handler?.scope === 'fleet';
  const fixedCity = String(definition?.tenantKey || tenantKey || '').trim().toLowerCase();
  const preset = Array.isArray(presetCities) && presetCities.length ? presetCities : null;
  const skipCities = Boolean(fleet || fixedCity || preset);
  const fetchPreview = useMemo(
    () => loadPreview || defaultLoadPreview(definition),
    [definition, loadPreview],
  );
  const sendRequest = useMemo(() => submit || defaultSubmit(definition), [definition, submit]);
  const shownMessage = message || (handlerKey === 'scheduled_push' && definition?.copyBodyFallback
    ? { title: definition.copyTitleFallback, body: definition.copyBodyFallback }
    : null);

  const [step, setStep] = useState('cities');
  const [selected, setSelected] = useState(() => preset || (fixedCity ? [fixedCity] : []));
  const [previews, setPreviews] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('');
  const [ignoreQuietHours, setIgnoreQuietHours] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [sending, setSending] = useState(false);
  const [runs, setRuns] = useState([]);

  const keys = useMemo(() => (fleet ? [FLEET_KEY] : selected), [fleet, selected]);
  const shown = keys.map((key) => previews[key]).filter(Boolean);
  const total = shown.reduce((sum, preview) => sum + (preview.count || 0), 0);
  const quietCities = shown.filter((preview) => preview.quietHours?.active);
  const email = handler?.channel === 'email';
  const unit = email ? ['admin', 'admins'] : ['person', 'people'];

  const loadPreviews = useCallback(async () => {
    setLoading(true);
    setError('');
    const entries = await Promise.all(keys.map(async (key) => {
      const { data: res, error: reqError } = await fetchPreview(key);
      if (reqError || !res?.success) {
        return [key, null, `${cityLabel(tenants, key === FLEET_KEY ? '' : key)}: ${res?.message || reqError || 'could not load recipients'}`];
      }
      return [key, res.data, null];
    }));
    setLoading(false);
    const failures = entries.map(([, , message]) => message).filter(Boolean);
    if (failures.length) {
      setError(failures.join(' '));
      return false;
    }
    setPreviews(Object.fromEntries(entries.map(([key, data]) => [key, data])));
    return true;
  }, [fetchPreview, keys, tenants]);

  const review = useCallback(async () => {
    setNotice('');
    setAcknowledged(false);
    if (await loadPreviews()) setStep('review');
  }, [loadPreviews]);

  useEffect(() => {
    if (handlersLoading || step !== 'cities') return;
    if (skipCities) review();
  }, [skipCities, handlersLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    setSending(true);
    setError('');
    const body = fleet
      ? { fingerprint: previews[FLEET_KEY]?.fingerprint }
      : {
        cities: selected.map((key) => ({ tenantKey: key, fingerprint: previews[key]?.fingerprint })),
        ignoreQuietHours,
      };
    const { data: res, error: reqError, errorCode, errorData } = await sendRequest(body);
    setSending(false);
    if (errorCode === 'RECIPIENTS_CHANGED') {
      const changed = errorData?.details?.cities || [];
      setPreviews((current) => {
        const next = { ...current };
        changed.forEach((row) => { next[row.tenantKey || FLEET_KEY] = row; });
        return next;
      });
      setNotice(`The list changed in ${changed.map((row) => cityLabel(tenants, row.tenantKey)).join(', ')}. Review it again before sending.`);
      setAcknowledged(false);
      setStep('review');
      return;
    }
    if (reqError || !res?.success) {
      setError(res?.message || reqError || 'Could not send');
      return;
    }
    setRuns(res.data?.runs || []);
    setStep('done');
    onSent?.(res.data?.runs || []);
  };

  const stepNumber = { cities: 1, review: 2, confirm: 3, done: 3 }[step];

  return (
    <section className="pivot-notification-send-now" aria-label={`Send ${name} now`}>
      <header className="pivot-notification-send-now__head">
        <div>
          <p className="pivot-notification-send-now__step">
            {step === 'done' ? 'Done' : `Step ${stepNumber} of 3`}
          </p>
          <h3>
            {{
              cities: 'Where should it go?',
              review: 'Review who gets it',
              confirm: sendAt ? 'Confirm and schedule' : 'Confirm and send',
              done: sendAt ? 'Scheduled' : 'Sending',
            }[step]}
          </h3>
        </div>
        <button type="button" className="linear-btn linear-btn--secondary" onClick={onClose}>
          {step === 'done' ? 'Done' : 'Cancel'}
        </button>
      </header>

      {error ? <p className="pivot-notification-send-now__error" role="alert">{error}</p> : null}
      {notice ? <p className="pivot-notification-send-now__notice" role="status">{notice}</p> : null}

      {step === 'cities' ? (
        handlersLoading || skipCities ? (
          error ? (
            <div className="pivot-notification-send-now__actions">
              {onBack ? (
                <button type="button" className="linear-btn linear-btn--secondary" onClick={onBack}>
                  Edit
                </button>
              ) : null}
              <button type="button" className="linear-btn" disabled={loading} onClick={review}>
                {loading ? 'Loading…' : 'Try again'}
              </button>
            </div>
          ) : (
            <p className="pivot-notification-send-now__muted">Loading recipients…</p>
          )
        ) : (
          <>
            <p className="pivot-notification-send-now__muted">
              Pick the cities to send {name} to. You'll see every recipient before anything goes out.
            </p>
            <label className="linear-field linear-field--checkbox">
              <input
                type="checkbox"
                aria-label="All cities"
                checked={tenants.length > 0 && selected.length === tenants.length}
                onChange={(event) => setSelected(event.target.checked ? tenants.map((row) => row.tenantKey) : [])}
              />
              <span>All cities</span>
            </label>
            <div className="pivot-notification-send-now__cities">
              {tenants.map((tenant) => (
                <label key={tenant.tenantKey} className="linear-field linear-field--checkbox">
                  <input
                    type="checkbox"
                    aria-label={`Send to ${cityLabel(tenants, tenant.tenantKey)}`}
                    checked={selected.includes(tenant.tenantKey)}
                    onChange={(event) => setSelected((current) => (
                      event.target.checked
                        ? [...current, tenant.tenantKey]
                        : current.filter((key) => key !== tenant.tenantKey)
                    ))}
                  />
                  <span>{cityLabel(tenants, tenant.tenantKey)}</span>
                </label>
              ))}
            </div>
            <div className="pivot-notification-send-now__actions">
              <button
                type="button"
                className="linear-btn linear-btn--primary"
                disabled={!selected.length || loading}
                onClick={review}
              >
                {loading ? 'Loading recipients…' : `Review recipients${selected.length ? ` (${plural(selected.length, 'city', 'cities')})` : ''}`}
              </button>
            </div>
          </>
        )
      ) : null}

      {step === 'review' ? (
        <>
          {shownMessage ? (
            <div className="pivot-notification-send-now__message">
              <strong>{shownMessage.title || 'just go*'}</strong>
              <span>{shownMessage.body}</span>
            </div>
          ) : null}
          {sendAt ? (
            <p className="pivot-notification-send-now__muted">
              Sends {formatWhen(sendAt)}. These exact people get it then, even if who matches changes before that.
            </p>
          ) : null}
          {definition?.enabled === false ? (
            <p className="pivot-notification-send-now__muted">
              This schedule is paused. Sending now doesn't turn it on.
            </p>
          ) : null}
          {handlerKey === 'weekly_drop' ? (
            <p className="pivot-notification-send-now__muted">
              Sends the drop push now, even outside the drop window. It still goes out only once per city per week.
            </p>
          ) : null}
          {handlerKey === 'event_discovery' ? (
            <p className="pivot-notification-send-now__muted">
              New-events pushes go out once per city per day.
            </p>
          ) : null}
          <label className="linear-field">
            <span className="linear-field__label">Find someone</span>
            <input
              aria-label="Find a recipient"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>
          {keys.map((key) => {
            const preview = previews[key];
            if (!preview) return null;
            const people = (preview.people || []).filter((row) => matchesFilter(row, filter));
            return (
              <div key={key} className="pivot-notification-send-now__city">
                <div className="pivot-notification-send-now__city-head">
                  <h4>{cityLabel(tenants, key === FLEET_KEY ? '' : key)}</h4>
                  <span>{plural(preview.count || 0, ...unit)}</span>
                  {preview.quietHours?.active ? (
                    <PivotOpsStatus tone="info">
                      Quiet hours until {formatClock(preview.quietHours.endsAt, preview.quietHours.timezone)}
                    </PivotOpsStatus>
                  ) : null}
                </div>
                {preview.overflow ? (
                  <p className="pivot-notification-send-now__muted">
                    Showing the first {preview.people?.length || 0}. {preview.overflow} more aren't listed here.
                  </p>
                ) : null}
                {people.length ? (
                  <ul>
                    {people.map((row) => (
                      <li key={row.userId}>
                        <strong>{personName(row)}</strong>
                        <span>{row.username ? `@${row.username}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="pivot-notification-send-now__muted">
                    {filter ? 'Nobody here matches that search.' : 'Nobody here would get it right now.'}
                  </p>
                )}
              </div>
            );
          })}
          {quietCities.length ? (
            <label className="linear-field linear-field--checkbox">
              <input
                type="checkbox"
                aria-label="Send during quiet hours"
                checked={ignoreQuietHours}
                onChange={(event) => setIgnoreQuietHours(event.target.checked)}
              />
              <span>
                Send during quiet hours anyway. Otherwise {quietCities.length === 1 ? 'that city waits' : 'those cities wait'} until quiet hours end.
              </span>
            </label>
          ) : null}
          <div className="pivot-notification-send-now__actions">
            {skipCities ? null : (
              <button type="button" className="linear-btn linear-btn--secondary" onClick={() => setStep('cities')}>
                Back
              </button>
            )}
            {onBack ? (
              <button type="button" className="linear-btn linear-btn--secondary" onClick={onBack}>
                Edit
              </button>
            ) : null}
            <button type="button" className="linear-btn linear-btn--secondary" disabled={loading} onClick={review}>
              {loading ? 'Refreshing…' : 'Refresh list'}
            </button>
            <button
              type="button"
              className="linear-btn linear-btn--primary"
              disabled={!total}
              onClick={() => setStep('confirm')}
            >
              {total ? `Continue with ${plural(total, ...unit)}` : 'Nobody to send to'}
            </button>
          </div>
        </>
      ) : null}

      {step === 'confirm' ? (
        <>
          <p>
            {name} goes to {plural(total, ...unit)}
            {fleet ? '' : ` in ${plural(selected.length, 'city', 'cities')}`}
            {sendAt ? ` ${formatWhen(sendAt)}.` : ' as soon as you send.'}
            {quietCities.length && !ignoreQuietHours
              ? ` ${quietCities.map((preview) => cityLabel(tenants, preview.tenantKey)).join(', ')} will wait for quiet hours to end.`
              : ''}
          </p>
          <ul className="pivot-notification-send-now__summary">
            {shown.map((preview) => (
              <li key={preview.tenantKey || FLEET_KEY}>
                <span>{cityLabel(tenants, preview.tenantKey)}</span>
                <strong>{plural(preview.count || 0, ...unit)}</strong>
              </li>
            ))}
          </ul>
          <label className="linear-field linear-field--checkbox">
            <input
              type="checkbox"
              aria-label="I reviewed every recipient"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>I reviewed all {plural(total, ...unit)}.</span>
          </label>
          <div className="pivot-notification-send-now__actions">
            <button type="button" className="linear-btn linear-btn--secondary" onClick={() => setStep('review')}>
              Back
            </button>
            <button
              type="button"
              className="linear-btn linear-btn--primary"
              disabled={!acknowledged || sending}
              onClick={send}
            >
              {sending
                ? (sendAt ? 'Scheduling…' : 'Sending…')
                : `${sendAt ? 'Schedule for' : 'Send to'} ${plural(total, ...unit)}`}
            </button>
          </div>
        </>
      ) : null}

      {step === 'done' ? (
        <ul className="pivot-notification-send-now__summary">
          {runs.map((run) => (
            <li key={run.runId || run.tenantKey}>
              <span>{fleet ? 'All platform admins' : cityLabel(tenants, run.tenantKey)}</span>
              <PivotOpsStatus tone={run.created ? 'ok' : 'muted'}>
                {!run.created
                  ? 'Already sent for this period'
                  : (sendAt ? `Scheduled ${formatWhen(sendAt)}` : 'Queued to send')}
              </PivotOpsStatus>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default PivotNotificationSendNow;
