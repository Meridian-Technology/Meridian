import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import Popup from '../../../../components/Popup/Popup';
import './PivotInviteQRModal.scss';

// just go theme palette (see InviteLanding.scss). The ink is the default / current color.
const DEFAULT_FG = '#1A1714';
const QR_SWATCHES = [
  { label: 'just go ink', value: '#1A1714' },
  { label: 'white', value: '#FFFFFF' },
  { label: 'accent', value: '#FF4F1F' },
  { label: 'burst', value: '#FF2A2A' },
  { label: 'pop', value: '#FFD23F' },
  { label: 'ticker', value: '#4AB5FF' },
];

export function buildInviteLink(code) {
  if (!code) return '';
  return `${window.location.origin}/invite?code=${encodeURIComponent(code)}`;
}

function qrOptions(url, { size, type, fgColor }) {
  return {
    width: size,
    height: size,
    type,
    data: url,
    dotsOptions: { color: fgColor, type: 'extra-rounded' },
    backgroundOptions: { color: 'transparent' },
    cornersSquareOptions: { type: 'extra-rounded', color: fgColor },
    cornersDotOptions: { type: 'extra-rounded', color: fgColor },
  };
}

function StyledInviteQR({ url, fgColor, size = 240 }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!url || !node) return undefined;
    let cancelled = false;
    (async () => {
      const { default: QRCodeStyling } = await import('qr-code-styling');
      if (cancelled || !node) return;
      const qr = new QRCodeStyling(qrOptions(url, { size, type: 'svg', fgColor }));
      node.innerHTML = '';
      qr.append(node);
    })();
    return () => {
      cancelled = true;
      node.innerHTML = '';
    };
  }, [url, fgColor, size]);

  return <div ref={containerRef} className="pivot-invite-qr__canvas" style={{ width: size, height: size }} />;
}

function PivotInviteQRModal({ code, isOpen, onClose, onNotify }) {
  const url = buildInviteLink(code);
  const [fgColor, setFgColor] = useState(DEFAULT_FG);
  const [downloading, setDownloading] = useState(false);

  // Reset the color each time a different code's modal is opened.
  useEffect(() => {
    if (isOpen) setFgColor(DEFAULT_FG);
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
      const { default: QRCodeStyling } = await import('qr-code-styling');
      const qr = new QRCodeStyling(qrOptions(url, { size: 1024, type: 'png', fgColor }));
      const blob = await qr.getRawData('png');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `invite-${(code || 'code').replace(/[^a-z0-9]/gi, '-')}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
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

        <div className="pivot-invite-qr__frame">
          {url ? <StyledInviteQR url={url} fgColor={fgColor} size={240} /> : null}
        </div>

        <div className="pivot-invite-qr__swatches" role="radiogroup" aria-label="QR color">
          {QR_SWATCHES.map((swatch) => {
            const selected = fgColor.toLowerCase() === swatch.value.toLowerCase();
            return (
              <button
                key={swatch.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`pivot-invite-qr__swatch${selected ? ' is-selected' : ''}`}
                style={{ '--swatch': swatch.value }}
                onClick={() => setFgColor(swatch.value)}
                title={swatch.label}
                aria-label={swatch.label}
              >
                {selected ? <Icon icon="mdi:check" /> : null}
              </button>
            );
          })}
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
