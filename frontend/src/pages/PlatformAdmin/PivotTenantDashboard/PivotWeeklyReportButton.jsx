import React, { useState } from 'react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import Popup from '../../../components/Popup/Popup';
import './PivotWeeklyReportButton.scss';

const NO_FETCH_CACHE = { enabled: false };

/**
 * Weekly report email for platform admins (meant for Sundays; no scheduler
 * yet). Previews the email, sends a test to the signed-in admin, or sends it to
 * every platform admin after a confirm. Same report as `npm run report:weekly`.
 */
function PivotWeeklyReportButton() {
  const { addNotification } = useNotification() || {};
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(null);
  const [sendError, setSendError] = useState(null);
  const [lastSent, setLastSent] = useState(null);

  const { data: response, loading, error } = useFetch(
    open ? '/admin/pivot/reports/weekly/preview' : null,
    { cache: NO_FETCH_CACHE },
  );
  const preview = response?.success ? response.data : null;
  const previewError =
    error || (response && !response.success ? response.message || 'Unable to build the report.' : null);
  const recipients = preview?.recipients || [];

  const send = async (audience) => {
    if (audience === 'admins') {
      const confirmed = window.confirm(
        `Send “${preview?.subject || 'the weekly report'}” to ${recipients.length} platform admin${
          recipients.length === 1 ? '' : 's'
        }?`,
      );
      if (!confirmed) return;
    }
    setSending(audience);
    setSendError(null);
    const { data: res, error: reqError } = await authenticatedRequest('/admin/pivot/reports/weekly/send', {
      method: 'POST',
      data: { audience },
      headers: { 'Content-Type': 'application/json' },
    });
    setSending(null);
    if (reqError || !res?.success) {
      setSendError(res?.message || reqError || 'Unable to send the weekly report.');
      return;
    }
    const sentTo = res.data?.recipients || [];
    setLastSent({ audience, count: sentTo.length });
    addNotification?.({
      title: 'Weekly report sent',
      message: audience === 'me' ? `Test sent to ${sentTo[0]}.` : `Sent to ${sentTo.length} platform admins.`,
      type: 'success',
    });
  };

  return (
    <>
      <button type="button" className="linear-btn linear-btn--secondary" onClick={() => setOpen(true)}>
        Weekly report
      </button>
      <Popup
        isOpen={open}
        onClose={() => {
          if (!sending) setOpen(false);
        }}
        customClassName="pivot-weekly-report"
        disableOutsideClick={Boolean(sending)}
      >
        <div className="pivot-weekly-report__body">
          <h2 className="pivot-weekly-report__title">Weekly report email</h2>
          <p className="pivot-weekly-report__lead">
            Last complete drop week across all cities, meant to go out on Sundays. There’s no
            automatic schedule yet: send it here or with <code>npm run report:weekly</code>.
          </p>

          {loading && !preview ? <p className="pivot-lab__empty">Building the report…</p> : null}
          {previewError && !preview ? (
            <p className="pivot-lab__error" role="alert">
              {typeof previewError === 'string' ? previewError : 'Unable to build the report.'}
            </p>
          ) : null}

          {preview ? (
            <>
              <p className="pivot-weekly-report__meta">
                <strong>{preview.subject}</strong>
                <span>
                  {' '}
                  · To {recipients.length} platform admin{recipients.length === 1 ? '' : 's'}:{' '}
                  {recipients.join(', ')}
                </span>
              </p>
              <iframe
                className="pivot-weekly-report__frame"
                title="Weekly report preview"
                srcDoc={preview.html}
                sandbox=""
              />
            </>
          ) : null}

          {sendError ? (
            <p className="pivot-lab__error" role="alert">
              {sendError}
            </p>
          ) : null}
          {lastSent ? (
            <p className="pivot-weekly-report__sent" role="status">
              {lastSent.audience === 'me'
                ? 'Test sent to you.'
                : `Sent to ${lastSent.count} platform admins.`}
            </p>
          ) : null}

          <footer className="pivot-weekly-report__footer">
            <button
              type="button"
              className="linear-btn linear-btn--ghost"
              onClick={() => setOpen(false)}
              disabled={Boolean(sending)}
            >
              Close
            </button>
            <button
              type="button"
              className="linear-btn linear-btn--secondary"
              onClick={() => send('me')}
              disabled={!preview || Boolean(sending)}
            >
              {sending === 'me' ? 'Sending…' : 'Send test to me'}
            </button>
            <button
              type="button"
              className="linear-btn linear-btn--primary"
              onClick={() => send('admins')}
              disabled={!preview || !recipients.length || Boolean(sending)}
            >
              {sending === 'admins' ? 'Sending…' : `Send to ${recipients.length} admins`}
            </button>
          </footer>
        </div>
      </Popup>
    </>
  );
}

export default PivotWeeklyReportButton;
