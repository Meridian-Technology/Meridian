import React, { useCallback, useEffect, useState } from 'react';
import { authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { formatWhen, requestError } from './integrationFormat';

function deliveryResult(entry) {
  if (entry.status) return `HTTP ${entry.status}`;
  return entry.error || 'No response';
}

function testSummary(result) {
  if (result.ok) return `Delivered: HTTP ${result.status}`;
  if (result.status) return `Not accepted: HTTP ${result.status}`;
  return `Failed: ${result.error || 'no response'}`;
}

function GrokbotWebhookCard({ settings, loading, onChanged }) {
  const { addNotification } = useNotification();
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    if (!settings) return;
    setUrl(settings.webhookUrl || '');
    setEnabled(Boolean(settings.enabled));
  }, [settings]);

  const handleSave = useCallback(
    async (event) => {
      event.preventDefault();
      if (saving) return;
      setSaving(true);
      setActionError(null);
      const body = { webhookUrl: url.trim(), enabled };
      if (key) body.webhookKey = key;
      const { data: res, error: reqError } = await authenticatedRequest('/admin/platform/integrations/grokbot', {
        method: 'PUT',
        data: body,
        headers: { 'Content-Type': 'application/json' },
      });
      setSaving(false);
      if (reqError || !res?.success) {
        setActionError(requestError(res, reqError));
        return;
      }
      setKey('');
      addNotification({ title: 'Saved', message: 'Grokbot webhook settings saved.', type: 'success' });
      onChanged();
    },
    [addNotification, enabled, key, onChanged, saving, url],
  );

  const handleTest = useCallback(async () => {
    if (testing) return;
    setTesting(true);
    setActionError(null);
    setTestResult(null);
    const { data: res, error: reqError } = await authenticatedRequest(
      '/admin/platform/integrations/grokbot/test',
      { method: 'POST' },
    );
    setTesting(false);
    if (reqError || !res?.success) {
      setActionError(requestError(res, reqError));
      return;
    }
    setTestResult(res.data);
    onChanged();
  }, [onChanged, testing]);

  const deliveries = Array.isArray(settings?.deliveries) ? settings.deliveries : [];
  const keyPlaceholder = settings?.keySet
    ? `set, ends in ••••${settings.keyLast4 || ''}`
    : 'Not set';

  return (
    <section className="linear-section platform-admin-integrations__card" aria-labelledby="grokbot-webhook">
      <h2 id="grokbot-webhook" className="linear-section__title">Grokbot webhook</h2>
      <p className="platform-admin-integrations__hint">
        Meridian posts a content-free notice to this URL when a compose or revise job finishes. Use the URL and
        the <code className="linear-code linear-code--inline">Authorization: Bearer</code> key from the routine&apos;s
        Webhook section in grokbot.
      </p>
      {settings?.source === 'environment' ? (
        <p className="platform-admin-integrations__note">
          Notices currently go to GROKBOT_CAROUSEL_WEBHOOK_URL from the server environment, with no key. Saving
          here replaces it.
        </p>
      ) : null}

      <form className="platform-admin-integrations__webhook-form" onSubmit={handleSave}>
        <label className="linear-field">
          <span className="linear-field__label">Webhook URL</span>
          <input
            className="linear-input"
            type="url"
            value={url}
            placeholder="https://…"
            onChange={(e) => setUrl(e.target.value)}
            disabled={saving}
          />
        </label>
        <label className="linear-field">
          <span className="linear-field__label">Routine key</span>
          <input
            className="linear-input"
            type="password"
            autoComplete="new-password"
            value={key}
            placeholder={keyPlaceholder}
            onChange={(e) => setKey(e.target.value)}
            disabled={saving}
          />
          <span className="platform-admin-integrations__field-hint">
            Write-only. Leave blank to keep the current key.
          </span>
        </label>
        <label className="platform-admin-integrations__toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={saving}
          />
          <span>Send notices</span>
        </label>
        <div className="platform-admin-integrations__actions">
          <button type="submit" className="linear-btn linear-btn--primary" disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="linear-btn linear-btn--secondary"
            disabled={testing || !settings?.webhookUrl}
            onClick={handleTest}
          >
            {testing ? 'Sending…' : 'Send test'}
          </button>
          {testResult ? (
            <span
              className={`platform-admin-integrations__test platform-admin-integrations__test--${testResult.ok ? 'ok' : 'failed'}`}
              role="status"
            >
              {testSummary(testResult)}
            </span>
          ) : null}
        </div>
      </form>

      {actionError ? (
        <p className="platform-admin-integrations__error" role="alert">{actionError}</p>
      ) : null}

      <h3 className="platform-admin-integrations__subtitle">Recent deliveries</h3>
      {deliveries.length ? (
        <div className="platform-admin-integrations__table-wrap">
          <table className="platform-admin-integrations__table" aria-label="Recent deliveries">
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Job</th>
                <th>Attempt</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((entry, index) => (
                <tr key={`${entry.at}-${index}`}>
                  <td>{formatWhen(entry.at)}</td>
                  <td>{entry.event}</td>
                  <td className="platform-admin-integrations__job">{entry.jobId || '—'}</td>
                  <td>{entry.attempt}</td>
                  <td>
                    <span
                      className={`linear-badge linear-badge--${entry.status >= 200 && entry.status < 300 ? 'active' : 'maintenance'}`}
                    >
                      {deliveryResult(entry)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="platform-admin-integrations__muted">No deliveries yet.</p>
      )}
    </section>
  );
}

export default GrokbotWebhookCard;
