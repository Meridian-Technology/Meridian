import React, { useEffect, useState } from 'react';
import Popup from '../../../components/Popup/Popup';
import StyledJustGoQr from '../../../components/JustGoQr/StyledJustGoQr';
import JustGoQrSwatches from '../../../components/JustGoQr/JustGoQrSwatches';
import {
  JUSTGO_QR_DEFAULT_BG,
  JUSTGO_QR_DEFAULT_FG,
  isValidLandingQrName,
  normalizeLandingQrNameInput,
} from '../../../components/JustGoQr/justGoQrTheme';
import { justGoPublicUrl } from '../../JustGoLanding/justGoLandingCopy';
import './PivotLandingQrModal.scss';

function emptyForm() {
  return {
    name: '',
    description: '',
    fgColor: JUSTGO_QR_DEFAULT_FG,
    transparentBg: true,
    isActive: true,
  };
}

function formFromQr(qr) {
  return {
    name: qr?.name || '',
    description: qr?.description || '',
    fgColor: qr?.fgColor || JUSTGO_QR_DEFAULT_FG,
    transparentBg: qr?.transparentBg !== false,
    isActive: qr?.isActive !== false,
  };
}

function PivotLandingQrModal({
  isOpen,
  mode = 'create',
  qr = null,
  saving = false,
  error = '',
  onClose,
  onSubmit,
}) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!isOpen) return;
    setForm(isEdit ? formFromQr(qr) : emptyForm());
  }, [isOpen, isEdit, qr]);

  const slug = normalizeLandingQrNameInput(form.name);
  const previewUrl = slug ? justGoPublicUrl(`/qr/${encodeURIComponent(slug)}`) : '';
  const nameError = form.name && !isValidLandingQrName(form.name)
    ? 'Use a lowercase slug (a-z, 0-9, hyphens).'
    : '';

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!isEdit && !isValidLandingQrName(form.name)) return;
    onSubmit?.({
      name: slug,
      description: form.description.trim(),
      fgColor: form.fgColor,
      bgColor: JUSTGO_QR_DEFAULT_BG,
      transparentBg: form.transparentBg,
      isActive: form.isActive,
    });
  };

  return (
    <Popup
      isOpen={isOpen}
      onClose={onClose}
      customClassName="pivot-landing-qr-modal__shell"
      disableOutsideClick={saving}
    >
      <form className="pivot-landing-qr-modal" onSubmit={handleSubmit}>
        <h3 className="pivot-landing-qr-modal__title">
          {isEdit ? `Edit ${qr?.name || 'QR'}` : 'New tracking QR'}
        </h3>
        <p className="pivot-landing-qr-modal__lead">
          Scans hop to this city’s landing with <code>src=qr</code>. Names are unique across all cities.
        </p>

        <label className="linear-field">
          <span className="linear-field__label">Name</span>
          <input
            className="linear-input"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="poster-night"
            autoComplete="off"
            disabled={isEdit || saving}
            required={!isEdit}
          />
        </label>
        {nameError ? (
          <p className="pivot-landing-qr-modal__error" role="alert">
            {nameError}
          </p>
        ) : null}

        <label className="linear-field">
          <span className="linear-field__label">Description</span>
          <input
            className="linear-input"
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Union Square posters"
            autoComplete="off"
            disabled={saving}
          />
        </label>

        <div className="pivot-landing-qr-modal__preview">
          <div className="justgo-qr-frame">
            {previewUrl ? (
              <StyledJustGoQr
                url={previewUrl}
                fgColor={form.fgColor}
                bgColor={JUSTGO_QR_DEFAULT_BG}
                transparentBg={form.transparentBg}
                size={180}
              />
            ) : (
              <div className="pivot-landing-qr-modal__preview-empty">Enter a name to preview</div>
            )}
          </div>
          <JustGoQrSwatches
            value={form.fgColor}
            onChange={(fgColor) => setForm((prev) => ({ ...prev, fgColor }))}
          />
          <label className="pivot-landing-qr-modal__check">
            <input
              type="checkbox"
              checked={form.transparentBg}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, transparentBg: event.target.checked }))
              }
              disabled={saving}
            />
            Transparent background
          </label>
          {isEdit ? (
            <label className="pivot-landing-qr-modal__check">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, isActive: event.target.checked }))
                }
                disabled={saving}
              />
              Active
            </label>
          ) : null}
        </div>

        {error ? (
          <p className="pivot-landing-qr-modal__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="pivot-landing-qr-modal__actions">
          <button
            type="button"
            className="linear-btn linear-btn--secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="linear-btn linear-btn--primary"
            disabled={saving || (!isEdit && !isValidLandingQrName(form.name))}
          >
            {saving ? 'Saving…' : isEdit ? 'Save QR' : 'Create QR'}
          </button>
        </div>
      </form>
    </Popup>
  );
}

export default PivotLandingQrModal;
