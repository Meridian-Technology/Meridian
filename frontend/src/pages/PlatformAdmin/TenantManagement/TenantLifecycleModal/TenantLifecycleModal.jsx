import React, { useCallback, useEffect, useState } from 'react';
import Popup from '../../../../components/Popup/Popup';
import { getSoftWarnings, statusLabel } from '../tenantStatusConstants';
import './TenantLifecycleModal.scss';

const SESSION_CLEAR_MS = 320;

function TenantLifecycleModalContent({
  handleClose = () => {},
  session,
  tenant,
  saving,
  onConfirm,
}) {
  const [attachMessage, setAttachMessage] = useState(null);
  const [messageDraft, setMessageDraft] = useState('');

  const { mode, targetStatus, initialMessage } = session;
  const isMessageOnly = mode === 'message';
  const isActivate = mode === 'activate';
  const nextStatus = isMessageOnly ? (tenant.status || 'coming_soon') : targetStatus;
  const warnings = isMessageOnly ? [] : getSoftWarnings(tenant, nextStatus);
  const statusLabelLower = statusLabel(nextStatus).toLowerCase();

  useEffect(() => {
    const hasMessage = Boolean((initialMessage || '').trim());
    setAttachMessage(isMessageOnly ? true : hasMessage ? true : null);
    setMessageDraft(initialMessage || '');
  }, [isMessageOnly, initialMessage, mode, targetStatus]);

  const handleConfirm = useCallback(async () => {
    if (!isMessageOnly && attachMessage === null) return;

    let statusMessage = tenant.statusMessage || '';
    if (isMessageOnly || attachMessage === true) {
      statusMessage = messageDraft.trim();
    } else if (attachMessage === false) {
      statusMessage = '';
    }

    const ok = await onConfirm({
      status: isMessageOnly ? tenant.status || 'coming_soon' : nextStatus,
      statusMessage,
    });
    if (ok !== false) {
      handleClose();
    }
  }, [
    attachMessage,
    handleClose,
    isMessageOnly,
    messageDraft,
    nextStatus,
    onConfirm,
    tenant.status,
    tenant.statusMessage,
  ]);

  const dialogTitle = isMessageOnly
    ? 'Edit status message'
    : isActivate
      ? 'Activate subdomain'
      : `Change status to ${statusLabel(nextStatus)}`;

  const subdomainUrl = tenant.subdomainUrl || `${tenant.subdomain || tenant.tenantKey}.meridian.study`;

  return (
    <div className="tenant-lifecycle-modal">
      <h2 className="tenant-lifecycle-modal__title">{dialogTitle}</h2>

      {!isMessageOnly ? (
        <p className="tenant-lifecycle-modal__lead">
          Are you sure you want to {isActivate ? 'activate' : 'set'} <strong>{subdomainUrl}</strong>
          {isActivate ? ' for users' : ` to ${statusLabelLower}`}?
        </p>
      ) : (
        <p className="tenant-lifecycle-modal__lead">
          Message shown on the tenant status page when the city is not fully available.
        </p>
      )}

      {warnings.length > 0 ? (
        <ul className="tenant-lifecycle-modal__warnings">
          {warnings.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      ) : null}

      {!isMessageOnly ? (
        <fieldset className="tenant-lifecycle-modal__fieldset">
          <legend className="tenant-lifecycle-modal__legend">Status message</legend>
          <p className="tenant-lifecycle-modal__hint">Optional. Shown to users when this tenant is not active.</p>
          <div className="tenant-lifecycle-modal__choices" role="radiogroup" aria-label="Attach status message">
            <label className="tenant-lifecycle-modal__choice">
              <input
                type="radio"
                name="attach-message"
                checked={attachMessage === true}
                onChange={() => setAttachMessage(true)}
              />
              <span>Add or update message</span>
            </label>
            <label className="tenant-lifecycle-modal__choice">
              <input
                type="radio"
                name="attach-message"
                checked={attachMessage === false}
                onChange={() => setAttachMessage(false)}
              />
              <span>No message</span>
            </label>
          </div>
          {attachMessage === true ? (
            <textarea
              className="tenant-lifecycle-modal__textarea"
              value={messageDraft}
              onChange={(e) => setMessageDraft(e.target.value)}
              placeholder="e.g. Launching March 2026 — check back soon."
              maxLength={240}
              rows={3}
            />
          ) : null}
        </fieldset>
      ) : (
        <label className="tenant-lifecycle-modal__field">
          <span className="tenant-lifecycle-modal__field-label">Message</span>
          <textarea
            className="tenant-lifecycle-modal__textarea"
            value={messageDraft}
            onChange={(e) => setMessageDraft(e.target.value)}
            placeholder="Optional message for users"
            maxLength={240}
            rows={3}
          />
        </label>
      )}

      <footer className="tenant-lifecycle-modal__footer">
        <button type="button" className="tenant-lifecycle-modal__btn tenant-lifecycle-modal__btn--ghost" onClick={handleClose} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="tenant-lifecycle-modal__btn tenant-lifecycle-modal__btn--primary"
          disabled={saving || (!isMessageOnly && attachMessage === null)}
          onClick={handleConfirm}
        >
          {saving ? 'Saving…' : isMessageOnly ? 'Save message' : 'Confirm change'}
        </button>
      </footer>
    </div>
  );
}

/**
 * Confirmation modal for tenant status / message changes (portaled).
 * @param {object|null} request - { mode, targetStatus, initialMessage } while open
 */
function TenantLifecycleModal({ request, tenant, saving, onClose, onConfirm }) {
  const [session, setSession] = useState(null);
  const isOpen = Boolean(request && tenant);

  useEffect(() => {
    if (request && tenant) {
      setSession({
        mode: request.mode || 'status',
        targetStatus: request.targetStatus ?? tenant.status ?? 'coming_soon',
        initialMessage: request.initialMessage ?? tenant.statusMessage ?? '',
      });
    }
  }, [request, tenant]);

  useEffect(() => {
    if (!request) {
      const timer = setTimeout(() => setSession(null), SESSION_CLEAR_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [request]);

  const handleConfirm = useCallback(
    async (payload) => {
      try {
        const ok = await onConfirm(payload);
        return ok !== false;
      } catch (_) {
        return false;
      }
    },
    [onConfirm]
  );

  if (!session && !isOpen) {
    return null;
  }

  return (
    <Popup
      isOpen={isOpen}
      onClose={onClose}
      customClassName="tenant-lifecycle-modal__shell"
    >
      {session && tenant ? (
        <TenantLifecycleModalContent
          session={session}
          tenant={tenant}
          saving={saving}
          onConfirm={handleConfirm}
        />
      ) : null}
    </Popup>
  );
}

export default TenantLifecycleModal;
