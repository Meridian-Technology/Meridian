import React, { useCallback, useEffect, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import Popup from '../../../../components/Popup/Popup';
import StyledJustGoQr from '../../../../components/JustGoQr/StyledJustGoQr';
import JustGoQrSwatches from '../../../../components/JustGoQr/JustGoQrSwatches';
import {
  JUSTGO_QR_DEFAULT_FG,
  downloadJustGoQr,
  justGoQrFilename,
} from '../../../../components/JustGoQr/justGoQrTheme';
import './PivotInviteQRModal.scss';

export function buildInviteLink(code) {
  if (!code) return '';
  return `${window.location.origin}/invite?code=${encodeURIComponent(code)}`;
}

function PivotInviteQRModal({ code, isOpen, onClose, onNotify }) {
  const url = buildInviteLink(code);
  const [fgColor, setFgColor] = useState(JUSTGO_QR_DEFAULT_FG);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (isOpen) setFgColor(JUSTGO_QR_DEFAULT_FG);
  }, [isOpen, code]);

  const handleCopyLink = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      onNotify?.({ title: 'Copied', message: 'Invite link copied to clipboard', type: 'success' });
    } catch {
      onNotify?.({ title: 'Copy failed', message: 'Could not copy invite link', type: 'error' });
    }
  }, [url, onNotify]);

  const handleDownload = useCallback(async () => {
    if (!url) return;
    setDownloading(true);
    try {
      await downloadJustGoQr(url, {
        filename: justGoQrFilename(`invite-${code || 'code'}`),
        format: 'png',
        fgColor,
        transparentBg: true,
      });
    } catch {
      onNotify?.({ title: 'Download failed', message: 'Could not generate QR image', type: 'error' });
    } finally {
      setDownloading(false);
    }
  }, [url, code, fgColor, onNotify]);

  return (
    <Popup isOpen={isOpen} onClose={onClose} customClassName="pivot-invite-qr__shell">
      <div className="pivot-invite-qr" role="dialog" aria-modal="true" aria-label={`Invite QR for ${code}`}>
        <div className="pivot-invite-qr__head">
          <h3 className="pivot-invite-qr__title">Invite QR</h3>
          <p className="pivot-invite-qr__subtitle">
            Scan to open the just go invite page with <code className="linear-code linear-code--inline">{code}</code> prefilled.
          </p>
        </div>

        <div className="justgo-qr-frame">
          {url ? <StyledJustGoQr url={url} fgColor={fgColor} size={240} /> : null}
        </div>

        <div className="pivot-invite-qr__swatches">
          <JustGoQrSwatches value={fgColor} onChange={setFgColor} />
        </div>
        <div className="pivot-invite-qr__link" title={url}>
          {url}
        </div>

        <div className="pivot-invite-qr__actions">
          <button
            type="button"
            className="linear-btn linear-btn--ghost linear-btn--sm"
            onClick={handleCopyLink}
          >
            <Icon icon="mdi:link-variant" />
            Copy link
          </button>
          <button
            type="button"
            className="linear-btn linear-btn--primary linear-btn--sm"
            onClick={handleDownload}
            disabled={downloading}
          >
            <Icon icon="mingcute:download-fill" />
            {downloading ? 'Preparing…' : 'Download PNG'}
          </button>
        </div>
      </div>
    </Popup>
  );
}

export default PivotInviteQRModal;
