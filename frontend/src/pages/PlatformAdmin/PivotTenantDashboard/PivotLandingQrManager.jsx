import React, { useCallback, useEffect, useState } from 'react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import {
  PivotOpsBanner,
  PivotOpsSection,
  PivotOpsStatus,
} from '../../../components/PivotOps';
import {
  JUSTGO_QR_DEFAULT_FG,
  downloadJustGoQr,
  justGoQrFilename,
} from '../../../components/JustGoQr/justGoQrTheme';
import { justGoPublicUrl } from '../../JustGoLanding/justGoLandingCopy';
import PivotLandingQrModal from './PivotLandingQrModal';

const NO_FETCH_CACHE = { enabled: false };

function payload(response) {
  if (!response?.success || !response.data) return null;
  return response.data;
}

function qrPayloadUrl(qr) {
  return qr?.payloadUrl || justGoPublicUrl(`/qr/${encodeURIComponent(qr?.name || '')}`);
}

function formatTimestamp(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString();
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
        });
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
        <div className="pivot-tenant-launch__table-wrap">
          <table className="pivot-tenant-launch__table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Scans</th>
                <th>Unique</th>
                <th>Last scan</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((qr) => {
                const url = qrPayloadUrl(qr);
                const pngKey = `${qr.name}:png`;
                const svgKey = `${qr.name}:svg`;
                return (
                  <tr key={qr.name}>
                    <td>
                      <code className="linear-code linear-code--inline">{qr.name}</code>
                    </td>
                    <td>{qr.description || '—'}</td>
                    <td>{qr.scans ?? 0}</td>
                    <td>{qr.uniqueScans ?? 0}</td>
                    <td>{formatTimestamp(qr.lastScannedAt)}</td>
                    <td>
                      <PivotOpsStatus tone={qr.isActive ? 'success' : 'warn'}>
                        {qr.isActive ? 'Active' : 'Inactive'}
                      </PivotOpsStatus>
                    </td>
                    <td>
                      <div className="pivot-tenant-launch__qr-actions">
                        <button
                          type="button"
                          className="linear-btn linear-btn--ghost linear-btn--sm"
                          onClick={() => handleCopy(qr)}
                        >
                          Copy link
                        </button>
                        <button
                          type="button"
                          className="linear-btn linear-btn--ghost linear-btn--sm"
                          onClick={() => handleDownload(qr, 'png')}
                          disabled={downloading === pngKey}
                        >
                          {downloading === pngKey ? 'Preparing…' : 'Download PNG'}
                        </button>
                        <button
                          type="button"
                          className="linear-btn linear-btn--ghost linear-btn--sm"
                          onClick={() => handleDownload(qr, 'svg')}
                          disabled={downloading === svgKey}
                        >
                          {downloading === svgKey ? 'Preparing…' : 'Download SVG'}
                        </button>
                        <button
                          type="button"
                          className="linear-btn linear-btn--ghost linear-btn--sm"
                          onClick={() => {
                            setFormError('');
                            setModal({ mode: 'edit', qr });
                          }}
                        >
                          Edit
                        </button>
                        {qr.isActive ? (
                          <button
                            type="button"
                            className="linear-btn linear-btn--ghost linear-btn--sm"
                            onClick={() => handleDeactivate(qr)}
                          >
                            Deactivate
                          </button>
                        ) : null}
                      </div>
                      <div className="pivot-tenant-launch__qr-url" title={url}>
                        {url}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
