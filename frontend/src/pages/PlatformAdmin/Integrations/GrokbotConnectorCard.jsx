import React, { useCallback, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import Popup from '../../../components/Popup/Popup';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { formatWhen, requestError } from './integrationFormat';

const NO_CACHE = { enabled: false };

function tokenStatus(token) {
  if (token.revokedAt) return { label: 'Revoked', modifier: 'hidden' };
  if (token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now()) {
    return { label: 'Expired', modifier: 'maintenance' };
  }
  return { label: 'Active', modifier: 'active' };
}

function GrokbotConnectorCard({ serverUrl, onCopy }) {
  const { addNotification } = useNotification();
  const [label, setLabel] = useState('grokbot');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const { data, loading, error, refetch } = useFetch('/admin/platform/access-tokens', {
    cache: NO_CACHE,
  });
  const tokens = useMemo(() => (data?.success && Array.isArray(data.data) ? data.data : []), [data]);

  const handleCreate = useCallback(
    async (event) => {
      event.preventDefault();
      const nextLabel = label.trim();
      if (!nextLabel || creating) return;
      setCreating(true);
      setActionError(null);
      const { data: res, error: reqError } = await authenticatedRequest('/admin/platform/access-tokens', {
        method: 'POST',
        data: { label: nextLabel },
        headers: { 'Content-Type': 'application/json' },
      });
      setCreating(false);
      if (reqError || !res?.success) {
        setActionError(requestError(res, reqError));
        return;
      }
      setCreated(res.data);
      refetch();
    },
    [creating, label, refetch],
  );

  const handleRevoke = useCallback(
    async (token) => {
      if (!token?.id || busyId) return;
      if (
        !window.confirm(
          `Revoke "${token.label}" (${token.displayPrefix}…)?\n\nAny connector using it stops working at once.`,
        )
      ) {
        return;
      }
      setBusyId(token.id);
      setActionError(null);
      const { data: res, error: reqError } = await authenticatedRequest(
        `/admin/platform/access-tokens/${encodeURIComponent(token.id)}/revoke`,
        { method: 'POST' },
      );
      setBusyId(null);
      if (reqError || !res?.success) {
        setActionError(requestError(res, reqError));
        return;
      }
      addNotification({ title: 'Revoked', message: `"${token.label}" no longer works.`, type: 'success' });
      refetch();
    },
    [addNotification, busyId, refetch],
  );

  return (
    <section className="linear-section platform-admin-integrations__card" aria-labelledby="grokbot-connector">
      <h2 id="grokbot-connector" className="linear-section__title">Grokbot connector</h2>
      <p className="platform-admin-integrations__hint">
        In grokbot, add a custom connector with this server URL and send the token as{' '}
        <code className="linear-code linear-code--inline">Authorization: Bearer &lt;token&gt;</code>. Leave Client
        ID empty. Each admin has one active token; it expires a year after it is created.
      </p>

      <div className="platform-admin-integrations__copy-row">
        <span className="linear-field__label">Server URL</span>
        <code className="linear-code linear-code--inline platform-admin-integrations__url">{serverUrl || '—'}</code>
        <button
          type="button"
          className="linear-btn linear-btn--secondary linear-btn--sm"
          disabled={!serverUrl}
          onClick={() => onCopy(serverUrl, 'Server URL')}
        >
          <Icon icon="mdi:content-copy" />
          Copy
        </button>
      </div>

      <form className="platform-admin-integrations__form" onSubmit={handleCreate}>
        <label className="linear-field platform-admin-integrations__field">
          <span className="linear-field__label">Token label</span>
          <input
            className="linear-input"
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
            disabled={creating}
          />
        </label>
        <button type="submit" className="linear-btn linear-btn--primary" disabled={creating || !label.trim()}>
          {creating ? 'Creating…' : 'Create token'}
        </button>
      </form>

      {actionError ? (
        <p className="platform-admin-integrations__error" role="alert">{actionError}</p>
      ) : null}
      {error ? (
        <p className="platform-admin-integrations__error" role="alert">
          {typeof error === 'string' ? error : 'Unable to load access tokens.'}
        </p>
      ) : null}

      {loading && !tokens.length ? (
        <p className="platform-admin-integrations__muted">Loading…</p>
      ) : tokens.length ? (
        <div className="platform-admin-integrations__table-wrap">
          <table className="platform-admin-integrations__table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Owner</th>
                <th>Prefix</th>
                <th>Expires</th>
                <th>Last used</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => {
                const status = tokenStatus(token);
                return (
                  <tr key={token.id}>
                    <td>{token.label}</td>
                    <td>{token.ownerEmail || token.globalUserId}</td>
                    <td><code className="linear-code linear-code--inline">{token.displayPrefix}…</code></td>
                    <td>{formatWhen(token.expiresAt)}</td>
                    <td>{formatWhen(token.lastUsedAt)}</td>
                    <td>
                      <span className={`linear-badge linear-badge--${status.modifier}`}>{status.label}</span>
                    </td>
                    <td>
                      {token.revokedAt ? null : (
                        <button
                          type="button"
                          className="linear-btn linear-btn--secondary linear-btn--sm"
                          disabled={busyId === token.id}
                          onClick={() => handleRevoke(token)}
                          aria-label={`Revoke ${token.label}`}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="platform-admin-integrations__muted">No access tokens yet.</p>
      )}

      <Popup isOpen={Boolean(created)} onClose={() => setCreated(null)} disableOutsideClick>
        {created ? (
          <div className="linear-admin platform-admin-integrations__dialog" role="dialog" aria-modal="true" aria-labelledby="token-created">
            <h3 id="token-created" className="platform-admin-integrations__dialog-title">Token created</h3>
            <p className="platform-admin-integrations__warning" role="note">
              Copy this token now. It can&apos;t be shown again; if you lose it, revoke it and create another.
            </p>
            <code className="linear-code platform-admin-integrations__secret" data-testid="created-token-secret">
              {created.secret}
            </code>
            <div className="platform-admin-integrations__dialog-actions">
              <button
                type="button"
                className="linear-btn linear-btn--secondary"
                onClick={() => onCopy(created.secret, 'Token')}
              >
                <Icon icon="mdi:content-copy" />
                Copy token
              </button>
              <button type="button" className="linear-btn linear-btn--primary" onClick={() => setCreated(null)}>
                Done
              </button>
            </div>
          </div>
        ) : null}
      </Popup>
    </section>
  );
}

export default GrokbotConnectorCard;
