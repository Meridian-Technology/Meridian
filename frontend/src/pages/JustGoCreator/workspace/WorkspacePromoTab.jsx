import React, { useRef, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { QRCodeCanvas } from 'qrcode.react';
import justGoCreatorCopy from '../justGoCreatorCopy';
import { buildPublicEventUrl } from './workspaceUtils';

/**
 * Promo QR tab — rendered entirely client-side against the public listing URL.
 *
 * No short-link service or scan analytics: the campus promo-QR flow is backed by org endpoints a
 * creator cannot call, and inventing tracked short links would be a Phase 2 promise. This encodes
 * the same `/event/:id` page the Preview action opens.
 */
function WorkspacePromoTab({ event }) {
  const copy = justGoCreatorCopy.workspace.promo;
  const canvasWrapRef = useRef(null);
  const [copied, setCopied] = useState(false);

  const publicUrl = buildPublicEventUrl(event?._id);
  const isPublished = event?.ingestStatus === 'published';

  const handleCopy = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permissions vary; the URL is on screen either way.
    }
  };

  const handleDownload = () => {
    const canvas = canvasWrapRef.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = copy.downloadName;
    link.click();
  };

  if (!publicUrl) return null;

  return (
    <div className="jg-workspace-tab">
      <section className="jg-workspace-tab__section">
        <h2 className="jg-workspace-tab__title">{copy.title}</h2>
        <p className="jg-workspace-tab__subtitle">{copy.subtitle}</p>

        <div className="jg-promo">
          <div className="jg-promo__code" ref={canvasWrapRef}>
            <QRCodeCanvas value={publicUrl} size={200} level="M" marginSize={2} />
          </div>
          <div className="jg-promo__side">
            <span className="jg-promo__url-label">{copy.urlLabel}</span>
            <code className="jg-promo__url">{publicUrl}</code>
            <div className="jg-promo__actions">
              <button type="button" className="jg-chip" onClick={handleCopy}>
                <Icon icon={copied ? 'mdi:check' : 'mdi:link-variant'} />
                {copied ? copy.copied : copy.copyLink}
              </button>
              <button type="button" className="jg-chip" onClick={handleDownload}>
                <Icon icon="mdi:download" />
                {copy.download}
              </button>
            </div>
          </div>
        </div>

        <p className="jg-workspace-tab__note">
          {isPublished ? copy.liveNote : copy.notLiveNote}
        </p>
      </section>
    </div>
  );
}

export default WorkspacePromoTab;
