import React, { useCallback, useEffect, useState } from 'react';
import { getSoftWarnings, statusLabel } from '../tenantStatusConstants';
import './TenantLifecycleModal.scss';

function TenantLifecycleModalContent({
  handleClose = () => {},
  session,
  tenant,
  saving,
  onConfirm,
}) {
  const [messageDraft, setMessageDraft] = useState('');

  const { mode, targetStatus, initialMessage } = session;
  const isMessageOnly = mode === 'message';
  const isActivate = mode === 'activate';
  const nextStatus = isMessageOnly ? (tenant.status || 'coming_soon') : targetStatus;
  const isMaintenanceTarget = !isMessageOnly && nextStatus === 'maintenance';
  const showMessageField = isMessageOnly || isMaintenanceTarget;
  const warnings = isMessageOnly ? [] : getSoftWarnings(tenant, nextStatus);
  const statusLabelLower = statusLabel(nextStatus).toLowerCase();

  useEffect(() => {
    setMessageDraft(initialMessage ?? tenant.statusMessage ?? '');
  }, [initialMessage, isMessageOnly, mode, targetStatus, tenant.statusMessage]);

  const handleConfirm = useCallback(async () => {
    let statusMessage = tenant.statusMessage || '';
    if (isMessageOnly || isMaintenanceTarget) {
      statusMessage = messageDraft.trim();
    }

    const ok = await onConfirm({
      status: isMessageOnly ? tenant.status || 'coming_soon' : nextStatus,
      statusMessage,
    });
    if (ok !== false) {
      handleClose();
    }
  }, [
    handleClose,
    isMaintenanceTarget,
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

      {showMessageField ? (
        <label className="tenant-lifecycle-modal__field">
          <span className="tenant-lifecycle-modal__field-label">
            {isMaintenanceTarget ? 'Message for users (optional)' : 'Message'}
          </span>
          {isMaintenanceTarget ? (
            <p className="tenant-lifecycle-modal__hint">
              Shown on the tenant status page while this city is in maintenance.
            </p>
          ) : null}
          <textarea
            className="tenant-lifecycle-modal__textarea"
            value={messageDraft}
            onChange={(e) => setMessageDraft(e.target.value)}
            placeholder={
              isMaintenanceTarget
                ? 'e.g. Upgrading infrastructure — back shortly.'
                : 'Optional message for users'
            }
            maxLength={240}
            rows={3}
          />
        </label>
      ) : null}

      <footer className="tenant-lifecycle-modal__footer">
        <button type="button" className="tenant-lifecycle-modal__btn tenant-lifecycle-modal__btn--ghost" onClick={handleClose} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="tenant-lifecycle-modal__btn tenant-lifecycle-modal__btn--primary"
          disabled={saving}
          onClick={handleConfirm}
        >
          {saving ? 'Saving…' : isMessageOnly ? 'Save message' : 'Confirm change'}
        </button>
      </footer>
    </div>
  );
}

export default TenantLifecycleModalContent;
