import React, { useState } from 'react';
import { authenticatedRequest } from '../../../../hooks/useFetch';
import './CarouselExportChoice.scss';

export function localExportCommand({ deckId, token, slideCount, baseUrl }) {
  return `node scripts/export-carousel.js ${deckId} '${token}' ${slideCount} '${baseUrl}'`;
}

export default function CarouselExportChoice({ onRelay, onClose, tenantKey, deckId }) {
  const [command, setCommand] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const commandLine = async () => {
    setBusy(true);
    setNotice('');
    setCommand('');
    const result = await authenticatedRequest(
      `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/carousels/${encodeURIComponent(deckId)}/export-token`,
      { method: 'POST' },
    );
    setBusy(false);
    const data = result.data?.data;
    if (!result.data?.success || !data?.token) {
      setNotice(result.data?.message || result.error || 'Could not prepare the command.');
      return;
    }
    setCommand(localExportCommand({
      deckId: data.deckId,
      token: data.token,
      slideCount: data.slideCount,
      baseUrl: window.location.origin,
    }));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setNotice('Copied. Run it from the Meridian directory within ten minutes.');
    } catch (_) {
      setNotice('Select the command and copy it. Run it from the Meridian directory within ten minutes.');
    }
  };

  return (
    <div className="jgz-export-choice">
      <h2>Export</h2>
      <p>Relay queues a worker job. The command line renders this saved revision in Chrome on this machine. Later edits do not change either export.</p>
      <div className="jgz-export-choice__actions">
        <button type="button" onClick={onRelay}>Relay</button>
        <button type="button" onClick={commandLine} disabled={busy || !tenantKey || !deckId}>
          {busy ? 'Preparing…' : 'Command line'}
        </button>
      </div>
      {command ? (
        <>
          <p>Run this from the Meridian directory. The token lasts ten minutes.</p>
          <textarea aria-label="Export command" readOnly rows={4} value={command} />
          <button type="button" onClick={copy}>Copy</button>
        </>
      ) : null}
      {notice ? <p role="alert">{notice}</p> : null}
      <button type="button" onClick={onClose}>Close</button>
    </div>
  );
}
