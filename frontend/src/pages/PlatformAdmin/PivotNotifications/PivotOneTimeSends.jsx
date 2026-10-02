import React, { useState } from 'react';
import { authenticatedRequest, useFetch } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import Popup from '../../../components/Popup/Popup';
import { PivotOpsSection, PivotOpsStatus } from '../../../components/PivotOps';
import PivotNotificationOneTimeSend from './PivotNotificationOneTimeSend';
import { formatWhen } from './PivotNotificationSendNow';
import './PivotNotificationOneTimeSend.scss';

const NO_FETCH_CACHE = { enabled: false };

const STATUS_LABELS = {
  pending: 'Scheduled',
  running: 'Sending',
  retry_wait: 'Retrying',
  succeeded: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function statusTone(status) {
  if (status === 'failed') return 'danger';
  if (status === 'succeeded') return 'ok';
  if (status === 'running' || status === 'retry_wait' || status === 'pending') return 'info';
  return 'muted';
}

function cityName(tenants, tenantKey) {
  const tenant = tenants.find((row) => row.tenantKey === tenantKey);
  return tenant?.location || tenant?.name || tenantKey;
}

function PivotOneTimeSends({ tenants = [], tenantKey = '', onSent }) {
  const { addNotification } = useNotification();
  const scoped = String(tenantKey || '').trim().toLowerCase();
  const [composing, setComposing] = useState(false);
  const [cancellingId, setCancellingId] = useState('');
  const { data, loading, error, refetch } = useFetch('/admin/meridian/jobs/one-time', {
    cache: NO_FETCH_CACHE,
    params: { limit: 20 },
  });
  const sends = (data?.success && Array.isArray(data.data) ? data.data : [])
    .filter((row) => row?.oneTimeId && Array.isArray(row.runs))
    .filter((row) => !scoped || row.runs.some((run) => run.tenantKey === scoped));

  const cancel = async (send) => {
    const name = send.label || `“${send.body}”`;
    if (!window.confirm(`Cancel ${name}? Cities that haven't started sending won't get it.`)) return;
    setCancellingId(send.oneTimeId);
    const { data: res, error: reqError } = await authenticatedRequest(
      `/admin/meridian/jobs/one-time/${encodeURIComponent(send.oneTimeId)}/cancel`,
      { method: 'POST' },
    );
    setCancellingId('');
    if (reqError || !res?.success) {
      addNotification({
        title: 'Could not cancel',
        message: res?.message || reqError || 'Unable to cancel this send',
        type: 'error',
      });
    } else {
      addNotification({
        title: 'Send cancelled',
        message: `${res.data?.cancelled?.length || 0} ${res.data?.cancelled?.length === 1 ? 'city' : 'cities'} cancelled`,
        type: 'success',
      });
    }
    refetch({ silent: true });
  };

  return (
    <PivotOpsSection
      title="One-time sends"
      description="Write any message, pick who and when, and review every recipient before it goes out."
      actions={(
        <button type="button" className="linear-btn linear-btn--primary" onClick={() => setComposing(true)}>
          New one-time send
        </button>
      )}
    >
      {error ? <p className="pivot-lab__error" role="alert">{error}</p> : null}
      {loading && !sends.length ? (
        <p className="pivot-lab__empty">Loading one-time sends…</p>
      ) : sends.length ? (
        <ul className="pivot-one-time-sends__list">
          {sends.map((send) => {
            const cancellable = send.runs.some((run) => run.status === 'pending');
            return (
              <li key={send.oneTimeId} className="pivot-one-time-sends__item">
                <div className="pivot-one-time-sends__item-head">
                  <strong>{send.label || send.title || 'One-time send'}</strong>
                  <span>{send.scheduledFor ? formatWhen(send.scheduledFor).replace(/^on /, '') : ''}</span>
                  {cancellable ? (
                    <button
                      type="button"
                      className="linear-btn linear-btn--secondary"
                      disabled={cancellingId === send.oneTimeId}
                      onClick={() => cancel(send)}
                    >
                      {cancellingId === send.oneTimeId ? 'Cancelling…' : 'Cancel send'}
                    </button>
                  ) : null}
                </div>
                <p className="pivot-one-time-sends__body">{send.body}</p>
                <div className="pivot-one-time-sends__cities">
                  {send.runs.map((run) => (
                    <span key={run.runId}>
                      {cityName(tenants, run.tenantKey)}{' '}
                      <PivotOpsStatus tone={statusTone(run.status)}>
                        {STATUS_LABELS[run.status] || run.status}
                        {run.status === 'succeeded' ? ` · ${run.summary?.accepted || 0}` : ''}
                      </PivotOpsStatus>
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pivot-lab__empty">No one-time sends yet.</p>
      )}

      <Popup
        isOpen={composing}
        onClose={() => setComposing(false)}
        defaultStyling={false}
        hideCloseButton
      >
        {composing ? (
          <div className="pivot-notification-one-time-dialog">
            <PivotNotificationOneTimeSend
              tenants={tenants}
              tenantKey={scoped}
              onClose={() => {
                setComposing(false);
                refetch({ silent: true });
              }}
              onSent={() => {
                refetch({ silent: true });
                onSent?.();
              }}
            />
          </div>
        ) : null}
      </Popup>
    </PivotOpsSection>
  );
}

export default PivotOneTimeSends;
