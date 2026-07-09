import React, { useCallback, useRef, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import Popup from '../../../../components/Popup/Popup';
import { authenticatedRequest } from '../../../../hooks/useFetch';
import PivotPosterQrBoxEditor from './PivotPosterQrBoxEditor';
import './PivotPosterTemplatesModal.scss';

// just go theme palette (mirrors PivotInviteQRModal / InviteLanding.scss).
const QR_SWATCHES = [
  { label: 'just go ink', value: '#1A1714' },
  { label: 'white', value: '#FFFFFF' },
  { label: 'accent', value: '#FF4F1F' },
  { label: 'burst', value: '#FF2A2A' },
  { label: 'pop', value: '#FFD23F' },
  { label: 'ticker', value: '#4AB5FF' },
];

const DEFAULT_BOX = { x: 0.36, y: 0.4, w: 0.28 };

function centeredBox(naturalWidth, naturalHeight, w = 0.28) {
  const aspect = naturalWidth && naturalHeight ? naturalWidth / naturalHeight : 1;
  const hFrac = Math.min(0.96, w * aspect);
  return { x: (1 - w) / 2, y: Math.max(0, (1 - hFrac) / 2), w };
}

function SwatchRow({ value, onChange }) {
  return (
    <div className="pivot-poster-tpl__swatches" role="radiogroup" aria-label="QR color">
      {QR_SWATCHES.map((swatch) => {
        const selected = value.toLowerCase() === swatch.value.toLowerCase();
        return (
          <button
            key={swatch.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`pivot-poster-tpl__swatch${selected ? ' is-selected' : ''}`}
            style={{ '--swatch': swatch.value }}
            onClick={() => onChange(swatch.value)}
            title={swatch.label}
            aria-label={swatch.label}
          >
            {selected ? <Icon icon="mdi:check" /> : null}
          </button>
        );
      })}
    </div>
  );
}

function TemplateCard({ template, onEdit, onDelete }) {
  return (
    <div className="pivot-poster-tpl__card">
      <div className="pivot-poster-tpl__thumb">
        <img src={template.imageUrl} alt={template.name} draggable={false} />
        <span
          className="pivot-poster-tpl__thumb-box"
          style={{
            left: `${template.qrBox.x * 100}%`,
            top: `${template.qrBox.y * 100}%`,
            width: `${template.qrBox.w * 100}%`,
            aspectRatio: '1 / 1',
            borderColor: template.qrColor,
          }}
        />
      </div>
      <div className="pivot-poster-tpl__card-body">
        <span className="pivot-poster-tpl__card-name">{template.name}</span>
        <div className="pivot-poster-tpl__card-actions">
          <button type="button" className="linear-btn linear-btn--ghost linear-btn--sm" onClick={() => onEdit(template)}>
            Edit
          </button>
          <button
            type="button"
            className="linear-btn linear-btn--ghost linear-btn--sm pivot-poster-tpl__delete"
            onClick={() => onDelete(template)}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function PivotPosterTemplatesModal({ tenantKey, templates, isOpen, onClose, onRefetch, onNotify }) {
  const baseUrl = `/admin/platform/tenants/${tenantKey}/pivot-poster-templates`;
  const fileInputRef = useRef(null);
  const objectUrlRef = useRef(null);

  const [view, setView] = useState('list'); // list | create | edit
  const [editingId, setEditingId] = useState(null);
  const [file, setFile] = useState(null);
  const [imageSrc, setImageSrc] = useState(null);
  const [name, setName] = useState('');
  const [box, setBox] = useState(DEFAULT_BOX);
  const [qrColor, setQrColor] = useState('#1A1714');
  const [plate, setPlate] = useState(true);
  const [saving, setSaving] = useState(false);

  const revokeObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  const resetForm = useCallback(() => {
    revokeObjectUrl();
    setView('list');
    setEditingId(null);
    setFile(null);
    setImageSrc(null);
    setName('');
    setBox(DEFAULT_BOX);
    setQrColor('#1A1714');
    setPlate(true);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const handleFilePicked = (e) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    revokeObjectUrl();
    const url = URL.createObjectURL(picked);
    objectUrlRef.current = url;
    setFile(picked);
    setImageSrc(url);
    setName(picked.name.replace(/\.[^.]+$/, ''));
    setQrColor('#1A1714');
    setPlate(true);
    setBox(DEFAULT_BOX);
    setView('create');
    // Center the box once we know the aspect ratio.
    const img = new Image();
    img.onload = () => setBox(centeredBox(img.naturalWidth, img.naturalHeight));
    img.src = url;
  };

  const startEdit = (template) => {
    revokeObjectUrl();
    setEditingId(template._id);
    setImageSrc(template.imageUrl);
    setName(template.name);
    setBox(template.qrBox);
    setQrColor(template.qrColor || '#1A1714');
    setPlate(template.plate !== false);
    setFile(null);
    setView('edit');
  };

  const handleCreate = async () => {
    if (!file || !name.trim()) {
      onNotify?.({ title: 'Missing info', message: 'A poster image and name are required.', type: 'error' });
      return;
    }
    setSaving(true);
    const form = new FormData();
    form.append('poster', file);
    form.append('name', name.trim());
    form.append('qrBox', JSON.stringify(box));
    form.append('qrColor', qrColor);
    form.append('plate', String(plate));
    const { data: res, error } = await authenticatedRequest(baseUrl, { method: 'POST', data: form });
    setSaving(false);
    if (error || !res?.success) {
      onNotify?.({ title: 'Upload failed', message: res?.message || error || 'Could not save template', type: 'error' });
      return;
    }
    onNotify?.({ title: 'Template saved', message: name.trim(), type: 'success' });
    resetForm();
    onRefetch?.();
  };

  const handleUpdate = async () => {
    if (!editingId || !name.trim()) return;
    setSaving(true);
    const { data: res, error } = await authenticatedRequest(`${baseUrl}/${editingId}`, {
      method: 'PUT',
      data: { name: name.trim(), qrBox: box, qrColor, plate },
      headers: { 'Content-Type': 'application/json' },
    });
    setSaving(false);
    if (error || !res?.success) {
      onNotify?.({ title: 'Update failed', message: res?.message || error || 'Could not update template', type: 'error' });
      return;
    }
    onNotify?.({ title: 'Template updated', message: name.trim(), type: 'success' });
    resetForm();
    onRefetch?.();
  };

  const handleDelete = async (template) => {
    if (!window.confirm(`Delete poster template "${template.name}"?`)) return;
    const { data: res, error } = await authenticatedRequest(`${baseUrl}/${template._id}`, { method: 'DELETE' });
    if (error || !res?.success) {
      onNotify?.({ title: 'Delete failed', message: res?.message || error || 'Could not delete template', type: 'error' });
      return;
    }
    onNotify?.({ title: 'Deleted', message: template.name, type: 'success' });
    onRefetch?.();
  };

  const isEditor = view === 'create' || view === 'edit';

  return (
    <Popup isOpen={isOpen} onClose={handleClose} customClassName="pivot-poster-tpl__shell">
      <div className="pivot-poster-tpl" role="dialog" aria-modal="true" aria-label="Poster templates">
        <div className="pivot-poster-tpl__head">
          <h3 className="pivot-poster-tpl__title">Poster templates</h3>
          <p className="pivot-poster-tpl__subtitle">
            Upload poster art and place the QR box once. Each referral code can then be exported as a
            ready-to-print poster with its own invite QR stamped in.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="pivot-poster-tpl__file"
          onChange={handleFilePicked}
        />

        {view === 'list' ? (
          <>
            <div className="pivot-poster-tpl__list">
              {(templates || []).length === 0 ? (
                <p className="pivot-poster-tpl__empty">No poster templates yet. Add one to get started.</p>
              ) : (
                templates.map((tpl) => (
                  <TemplateCard key={tpl._id} template={tpl} onEdit={startEdit} onDelete={handleDelete} />
                ))
              )}
            </div>
            <div className="pivot-poster-tpl__actions">
              <button
                type="button"
                className="linear-btn linear-btn--primary linear-btn--sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Icon icon="mdi:image-plus" />
                Add poster
              </button>
            </div>
          </>
        ) : null}

        {isEditor ? (
          <div className="pivot-poster-tpl__editor">
            <div className="pivot-poster-tpl__editor-main">
              {imageSrc ? (
                <PivotPosterQrBoxEditor
                  imageSrc={imageSrc}
                  value={box}
                  onChange={setBox}
                  qrColor={qrColor}
                  plate={plate}
                />
              ) : null}
              <p className="pivot-poster-tpl__editor-hint">
                Drag the box to position the QR; drag its corner to resize.
              </p>
            </div>

            <div className="pivot-poster-tpl__editor-fields">
              <label className="linear-field">
                <span className="linear-field__label">Template name</span>
                <input
                  className="linear-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Coffee shop flyer"
                />
              </label>

              <div className="linear-field">
                <span className="linear-field__label">QR color</span>
                <SwatchRow value={qrColor} onChange={setQrColor} />
              </div>

              <label className="linear-field linear-field--checkbox">
                <span className="linear-field__label">White plate behind QR</span>
                <input type="checkbox" checked={plate} onChange={(e) => setPlate(e.target.checked)} />
              </label>
              <p className="pivot-poster-tpl__editor-note">
                Keep the plate on for busy artwork so the QR stays scannable. Turn it off to drop the QR
                straight onto a clean area (transparent background).
              </p>

              <div className="pivot-poster-tpl__actions">
                <button
                  type="button"
                  className="linear-btn linear-btn--ghost linear-btn--sm"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="linear-btn linear-btn--primary linear-btn--sm"
                  onClick={view === 'create' ? handleCreate : handleUpdate}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : view === 'create' ? 'Save template' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Popup>
  );
}

export default PivotPosterTemplatesModal;
