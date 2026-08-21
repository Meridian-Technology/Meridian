import React, { useCallback, useEffect, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { PivotOpsSection } from '../../../components/PivotOps';
import StyledJustGoQr from '../../../components/JustGoQr/StyledJustGoQr';
import {
  JUSTGO_QR_DEFAULT_BG,
  JUSTGO_QR_DEFAULT_FG,
  downloadJustGoQr,
  justGoQrFilename,
} from '../../../components/JustGoQr/justGoQrTheme';
import { justGoPublicUrl } from '../../JustGoLanding/justGoLandingCopy';
import PivotLandingQrModal from './PivotLandingQrModal';
import './PivotLandingQrManager.scss';

const NO_FETCH_CACHE = { enabled: false };

function payload(response) {
  if (!response?.success || !response.data) return null;
  return response.data;
}

function qrPayloadUrl(qr) {
  return qr?.payloadUrl || justGoPublicUrl(`/qr/${encodeURIComponent(qr?.name || '')}`);
}

function formatSemanticDate(value) {
  if (!value) return null;
  const parsed = String(value).includes('T') ? new Date(value) : new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(parsed);
  day.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - day) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return parsed.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function jsonHeaders() {
  return { 'Content-Type': 'application/json' };
}

function PivotLandingQrManager({ tenantKey, refetchRef }) {
  const { addNotification } = useNotification();
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [downloading, setDownloading] = useState('');
  const [downloadMenu, setDownloadMenu] = useState('');
  const [wiping, setWiping] = useState('');

  const qrsUrl = tenantKey
    ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/landing-qrs`
    : null;
  const {
    data: qrsResponse,
    loading,
    error,
    refetch,
  } = useFetch(qrsUrl, { cache: NO_FETCH_CACHE });

  useEffect(() => {
    if (!refetchRef) return undefined;
    refetchRef.current = refetch;
    return () => {
      if (refetchRef.current === refetch) refetchRef.current = null;
    };
  }, [refetch, refetchRef]);

  const data = payload(qrsResponse);
  const items = data?.items || [];
  const listError =
    error ||
    (qrsResponse && !qrsResponse.success
      ? qrsResponse.message || 'Unable to load tracking QRs.'
      : null);

  const closeModal = useCallback(() => {
    if (saving) return;
    setModal(null);
    setFormError('');
  }, [saving]);

  useEffect(() => {
    if (!downloadMenu) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setDownloadMenu('');
    };
    const onPointer = (event) => {
      if (event.target?.closest?.('[data-qr-download]')) return;
      setDownloadMenu('');
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [downloadMenu]);

  const handleCopy = useCallback(
    async (qr) => {
      const url = qrPayloadUrl(qr);
      try {
        await navigator.clipboard.writeText(url);
        addNotification({ title: 'Link copied', message: url, type: 'success' });
      } catch {
        addNotification({ title: 'Could not copy link', message: url, type: 'error' });
      }
    },
    [addNotification],
  );

  const handleDownload = useCallback(
    async (qr, format) => {
      const url = qrPayloadUrl(qr);
      const key = `${qr.name}:${format}`;
      setDownloading(key);
      try {
        await downloadJustGoQr(url, {
          filename: justGoQrFilename(qr.name, format),
          format,
          fgColor: qr.fgColor || JUSTGO_QR_DEFAULT_FG,
          bgColor: qr.bgColor,
          transparentBg: qr.transparentBg !== false,
          dotType: qr.dotType,
          cornerType: qr.cornerType,
        });
        setDownloadMenu('');
      } catch {
        addNotification({
          title: 'Download failed',
          message: 'Could not generate QR image.',
          type: 'error',
        });
      } finally {
        setDownloading('');
      }
    },
    [addNotification],
  );

  const handleCreate = useCallback(async (body) => {
    if (!tenantKey) return;
    setSaving(true);
    setFormError('');
    const { data: res, error: reqError } = await authenticatedRequest(
      `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/landing-qrs`,
      { method: 'POST', data: body, headers: jsonHeaders() },
    );
    setSaving(false);
    if (reqError || !res?.success) {
      setFormError(res?.message || reqError || 'Unable to create QR.');
      return;
    }
    addNotification({
      title: 'QR created',
      message: `${res.data?.name || body.name} is live at ${qrPayloadUrl(res.data || body)}.`,
      type: 'success',
    });
    setModal(null);
    refetch();
  }, [addNotification, refetch, tenantKey]);

  const handleEdit = useCallback(async (body) => {
    const name = modal?.qr?.name;
    if (!name) return;
    setSaving(true);
    setFormError('');
    const { data: res, error: reqError } = await authenticatedRequest(
      `/admin/pivot/landing-qrs/${encodeURIComponent(name)}`,
      {
        method: 'PATCH',
        data: {
          description: body.description,
          fgColor: body.fgColor,
          bgColor: body.bgColor,
          transparentBg: body.transparentBg,
          isActive: body.isActive,
          dotType: body.dotType,
          cornerType: body.cornerType,
        },
        headers: jsonHeaders(),
      },
    );
    setSaving(false);
    if (reqError || !res?.success) {
      setFormError(res?.message || reqError || 'Unable to update QR.');
      return;
    }
    addNotification({
      title: 'QR updated',
      message: name,
      type: 'success',
    });
    setModal(null);
    refetch();
  }, [addNotification, modal?.qr?.name, refetch]);

  const handleDeactivate = useCallback(async (qr) => {
    const confirmed = window.confirm(
      `Deactivate ${qr.name}? Scans will stop hopping until you turn it back on.`,
    );
    if (!confirmed) return;
    const { data: res, error: reqError } = await authenticatedRequest(
      `/admin/pivot/landing-qrs/${encodeURIComponent(qr.name)}`,
      { method: 'DELETE' },
    );
    if (reqError || !res?.success) {
      addNotification({
        title: 'Could not deactivate QR',
        message: res?.message || reqError || 'Unable to deactivate QR.',
        type: 'error',
      });
      return;
    }
    addNotification({ title: 'QR deactivated', message: qr.name, type: 'success' });
    refetch();
  }, [addNotification, refetch]);

  const handleWipeScans = useCallback(async (qr) => {
    const confirmed = window.confirm(
      `Wipe all scans for ${qr.name}? Counters go back to zero. This cannot be undone.`,
    );
    if (!confirmed) return;
    setWiping(qr.name);
    const { data: res, error: reqError } = await authenticatedRequest(
      `/admin/pivot/landing-qrs/${encodeURIComponent(qr.name)}/wipe-scans`,
      { method: 'POST' },
    );
    setWiping('');
    if (reqError || !res?.success) {
      addNotification({
        title: 'Could not wipe scans',
        message: res?.message || reqError || 'Unable to wipe scans.',
        type: 'error',
      });
      return;
    }
    const cleared = res.data?.wiped?.scans;
    addNotification({
      title: 'Scans wiped',
      message:
        typeof cleared === 'number'
          ? `${qr.name}: ${cleared} scan${cleared === 1 ? '' : 's'} cleared`
          : qr.name,
      type: 'success',
    });
    refetch();
  }, [addNotification, refetch]);

  return (
    <PivotOpsSection
      title="Tracking QRs"
      titleId="pivot-launch-qrs"
      description="Named codes at justgo.lol/qr/{name}. Default ink is Just Go, not campus green."
      actions={
        <button
          type="button"
          className="linear-btn linear-btn--primary"
          onClick={() => {
            setFormError('');
            setModal({ mode: 'create' });
          }}
          disabled={!tenantKey}
        >
          Create QR
        </button>
      }
    >
      {listError ? (
        <p className="pivot-lab__error" role="alert">
          {listError}
        </p>
      ) : null}
      {loading && !data ? (
        <p className="pivot-lab__empty">Loading tracking QRs…</p>
      ) : !items.length ? (
        <p className="pivot-lab__empty">No tracking QRs yet.</p>
      ) : (
        <div className="pivot-landing-qr-list">
          {items.map((qr) => {
            const url = qrPayloadUrl(qr);
            const lastScan = formatSemanticDate(qr.lastScannedAt);
            return (
              <div
                key={qr.name}
                className={`pivot-landing-qr-item${qr.isActive === false ? ' is-inactive' : ''}`}
              >
                <div className="pivot-landing-qr-item__main">
                  <div className="pivot-landing-qr-item__preview">
                    <StyledJustGoQr
                      url={url}
                      fgColor={qr.fgColor || JUSTGO_QR_DEFAULT_FG}
                      bgColor={qr.bgColor || JUSTGO_QR_DEFAULT_BG}
                      transparentBg={qr.transparentBg !== false}
                      dotType={qr.dotType}
                      cornerType={qr.cornerType}
                      size={80}
                    />
                  </div>
                  <div className="pivot-landing-qr-item__info">
                    <span className="pivot-landing-qr-item__name">{qr.name}</span>
                    {qr.description ? (
                      <span className="pivot-landing-qr-item__desc">{qr.description}</span>
                    ) : null}
                    <span className="pivot-landing-qr-item__redirect" title={url}>
                      → {url}
                    </span>
                    <span className="pivot-landing-qr-item__stats">
                      {qr.scans ?? 0} scans
                      {qr.uniqueScans != null ? ` · ${qr.uniqueScans} unique` : ''}
                    </span>
                    {lastScan ? (
                      <span className="pivot-landing-qr-item__meta">Last scan: {lastScan}</span>
                    ) : null}
                  </div>
                  <div className="pivot-landing-qr-item__actions">
                    <button
                      type="button"
                      className="pivot-landing-qr-item__action"
                      title="Edit"
                      aria-label="Edit"
                      onClick={() => {
                        setFormError('');
                        setModal({ mode: 'edit', qr });
                      }}
                    >
                      <Icon icon="material-symbols:edit" />
                    </button>
                    <button
                      type="button"
                      className="pivot-landing-qr-item__action"
                      title="Copy link"
                      aria-label="Copy link"
                      onClick={() => handleCopy(qr)}
                    >
                      <Icon icon="material-symbols:content-copy" />
                    </button>
                    <div className="pivot-landing-qr-item__download" data-qr-download>
                      {downloadMenu === qr.name ? (
                        <div
                          className="pivot-landing-qr-item__formats"
                          role="group"
                          aria-label="Download format"
                        >
                          <button
                            type="button"
                            className="pivot-landing-qr-item__format"
                            onClick={() => handleDownload(qr, 'png')}
                            disabled={downloading === `${qr.name}:png`}
                          >
                            {downloading === `${qr.name}:png` ? '…' : 'PNG'}
                          </button>
                          <button
                            type="button"
                            className="pivot-landing-qr-item__format"
                            onClick={() => handleDownload(qr, 'svg')}
                            disabled={downloading === `${qr.name}:svg`}
                          >
                            {downloading === `${qr.name}:svg` ? '…' : 'SVG'}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="pivot-landing-qr-item__action"
                          title="Download"
                          aria-label="Download"
                          aria-haspopup="true"
                          aria-expanded={false}
                          onClick={() => setDownloadMenu(qr.name)}
                        >
                          <Icon icon="mingcute:download-fill" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      className="pivot-landing-qr-item__action"
                      title="Wipe scans"
                      aria-label="Wipe scans"
                      onClick={() => handleWipeScans(qr)}
                      disabled={wiping === qr.name}
                    >
                      <Icon icon="material-symbols:restart-alt" />
                    </button>
                    {qr.isActive ? (
                      <button
                        type="button"
                        className="pivot-landing-qr-item__action pivot-landing-qr-item__action--danger"
                        title="Deactivate"
                        aria-label="Deactivate"
                        onClick={() => handleDeactivate(qr)}
                      >
                        <Icon icon="material-symbols:delete" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PivotLandingQrModal
        isOpen={Boolean(modal)}
        mode={modal?.mode || 'create'}
        qr={modal?.qr || null}
        saving={saving}
        error={formError}
        onClose={closeModal}
        onSubmit={modal?.mode === 'edit' ? handleEdit : handleCreate}
      />
    </PivotOpsSection>
  );
}

export default PivotLandingQrManager;
export { qrPayloadUrl };
