import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import Popup from '../../../../components/Popup/Popup';
import apiRequest from '../../../../utils/postRequest';
import './PivotPosterDownloadModal.scss';

function PivotPosterDownloadModal({ code, tenantKey, templates, isOpen, onClose, onNotify, onManage }) {
  const baseUrl = `/admin/platform/tenants/${tenantKey}/pivot-poster-templates`;
  const objectUrlRef = useRef(null);

  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);

  const revoke = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  const selectedTemplate = (templates || []).find((t) => t._id === selectedId) || null;

  const loadPreview = useCallback(
    async (templateId) => {
      if (!templateId || !code) return;
      setLoading(true);
      setError(null);
      revoke();
      setPreviewUrl(null);
      const res = await apiRequest(`${baseUrl}/${templateId}/render`, null, {
        method: 'GET',
        responseType: 'blob',
        params: { code, origin: window.location.origin },
      });
      setLoading(false);
      if (res instanceof Blob) {
        const url = URL.createObjectURL(res);
        objectUrlRef.current = url;
        setPreviewUrl(url);
      } else {
        setError(res?.error || 'Could not render this poster.');
      }
    },
    [baseUrl, code]
  );

  // On open (or code change) select the first template and render it.
  useEffect(() => {
    if (!isOpen) return;
    const first = (templates || [])[0];
    if (first) {
      setSelectedId(first._id);
      loadPreview(first._id);
    } else {
      setSelectedId(null);
      revoke();
      setPreviewUrl(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, code]);

  useEffect(() => () => revoke(), []);

  const handleSelect = (templateId) => {
    if (templateId === selectedId) return;
    setSelectedId(templateId);
    loadPreview(templateId);
  };

  const handleDownload = () => {
    if (!previewUrl || !selectedTemplate) return;
    const safeName = (selectedTemplate.name || 'poster').replace(/[^a-z0-9]/gi, '-');
    const safeCode = (code || 'code').replace(/[^a-z0-9]/gi, '-');
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `${safeName}-${safeCode}.png`;
    a.click();
    onNotify?.({ title: 'Downloaded', message: `${selectedTemplate.name} · ${code}`, type: 'success' });
  };

  const hasTemplates = (templates || []).length > 0;

  return (
    <Popup isOpen={isOpen} onClose={onClose} customClassName="pivot-poster-dl__shell">
      <div className="pivot-poster-dl" role="dialog" aria-modal="true" aria-label={`Poster for ${code}`}>
        <div className="pivot-poster-dl__head">
          <h3 className="pivot-poster-dl__title">Poster for {code}</h3>
          <p className="pivot-poster-dl__subtitle">
            Pick a template — the invite QR for this code is stamped in automatically.
          </p>
        </div>

        {!hasTemplates ? (
          <div className="pivot-poster-dl__empty">
            <p>No poster templates yet.</p>
            {onManage ? (
              <button type="button" className="linear-btn linear-btn--primary linear-btn--sm" onClick={onManage}>
                <Icon icon="mdi:image-plus" />
                Add a template
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="pivot-poster-dl__templates">
              {templates.map((tpl) => (
                <button
                  key={tpl._id}
                  type="button"
                  className={`pivot-poster-dl__template${selectedId === tpl._id ? ' is-selected' : ''}`}
                  onClick={() => handleSelect(tpl._id)}
                >
                  <img src={tpl.imageUrl} alt={tpl.name} draggable={false} />
                  <span>{tpl.name}</span>
                </button>
              ))}
            </div>

            <div className="pivot-poster-dl__preview">
              {loading ? (
                <div className="pivot-poster-dl__preview-status">
                  <Icon icon="mdi:loading" className="pivot-poster-dl__spinner" />
                  <span>Rendering…</span>
                </div>
              ) : error ? (
                <div className="pivot-poster-dl__preview-status pivot-poster-dl__preview-status--error">
                  {error}
                </div>
              ) : previewUrl ? (
                <img src={previewUrl} alt={`Poster preview for ${code}`} />
              ) : null}
            </div>

            <div className="pivot-poster-dl__actions">
              {onManage ? (
                <button type="button" className="linear-btn linear-btn--ghost linear-btn--sm" onClick={onManage}>
                  Manage templates
                </button>
              ) : null}
              <button
                type="button"
                className="linear-btn linear-btn--primary linear-btn--sm"
                onClick={handleDownload}
                disabled={!previewUrl || loading}
              >
                <Icon icon="mingcute:download-fill" />
                Download PNG
              </button>
            </div>
          </>
        )}
      </div>
    </Popup>
  );
}

export default PivotPosterDownloadModal;
