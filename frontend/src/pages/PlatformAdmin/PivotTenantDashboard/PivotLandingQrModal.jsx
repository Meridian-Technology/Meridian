import React, { useEffect, useState } from 'react';
import Popup from '../../../components/Popup/Popup';
import StyledJustGoQr from '../../../components/JustGoQr/StyledJustGoQr';
import {
  JUSTGO_QR_DEFAULT_BG,
  JUSTGO_QR_DEFAULT_FG,
  isValidLandingQrName,
  normalizeLandingQrNameInput,
} from '../../../components/JustGoQr/justGoQrTheme';
import { justGoPublicUrl } from '../../JustGoLanding/justGoLandingCopy';
import './PivotLandingQrModal.scss';

const DOT_TYPES = [
  { value: 'extra-rounded', label: 'Rounded' },
  { value: 'square', label: 'Square' },
  { value: 'dots', label: 'Dots' },
];

const CORNER_TYPES = [
  { value: 'extra-rounded', label: 'Rounded' },
  { value: 'square', label: 'Square' },
  { value: 'dot', label: 'Dot' },
];

const COLOR_PRESETS = [
  { fg: '#1A1714', bg: '#FAF6EF', label: 'Ink on cream' },
  { fg: '#1A1714', bg: '#FFFFFF', label: 'Ink on white' },
  { fg: '#FFFFFF', bg: '#1A1714', label: 'White on ink' },
  { fg: '#FF4F1F', bg: '#FAF6EF', label: 'Accent on cream' },
  { fg: '#FFD23F', bg: '#1A1714', label: 'Pop on ink' },
  { fg: '#4AB5FF', bg: '#FFFFFF', label: 'Ticker on white' },
];

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function emptyForm() {
  return {
    name: '',
    description: '',
    fgColor: JUSTGO_QR_DEFAULT_FG,
    bgColor: JUSTGO_QR_DEFAULT_BG,
    transparentBg: true,
    isActive: true,
    dotType: 'extra-rounded',
    cornerType: 'extra-rounded',
  };
}

function formFromQr(qr) {
  return {
    name: qr?.name || '',
    description: qr?.description || '',
    fgColor: qr?.fgColor || JUSTGO_QR_DEFAULT_FG,
    bgColor: qr?.bgColor || JUSTGO_QR_DEFAULT_BG,
    transparentBg: qr?.transparentBg !== false,
    isActive: qr?.isActive !== false,
    dotType: qr?.dotType || 'extra-rounded',
    cornerType: qr?.cornerType || 'extra-rounded',
  };
}

function normalizeHex(value, fallback) {
  const next = String(value || '').trim();
  if (HEX_PATTERN.test(next)) return next.toUpperCase();
  return fallback;
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
  const previewUrl = slug
    ? justGoPublicUrl(`/qr/${encodeURIComponent(slug)}`)
    : justGoPublicUrl('/qr/preview');
  const nameError = form.name && !isValidLandingQrName(form.name)
    ? 'Use a lowercase slug (a-z, 0-9, hyphens).'
    : '';
  const canSubmit = isEdit || isValidLandingQrName(form.name);

  const patch = (next) => setForm((prev) => ({ ...prev, ...next }));

  const applyPreset = (preset) => {
    patch({
      fgColor: preset.fg,
      bgColor: preset.bg,
      transparentBg: false,
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit || saving) return;
    onSubmit?.({
      name: slug,
      description: form.description.trim(),
      fgColor: normalizeHex(form.fgColor, JUSTGO_QR_DEFAULT_FG),
      bgColor: normalizeHex(form.bgColor, JUSTGO_QR_DEFAULT_BG),
      transparentBg: form.transparentBg,
      isActive: form.isActive,
      dotType: form.dotType,
      cornerType: form.cornerType,
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
        <div className="pivot-landing-qr-modal__head">
          <h2>{isEdit ? `Edit ${qr?.name || 'QR'}` : 'Create New QR Code'}</h2>
          <p>
            Name it, customize colors and style, then confirm. Scans hop to this
            city’s landing with <code>src=qr</code>. Names are unique across all cities.
          </p>
        </div>

        {error ? (
          <div className="pivot-landing-qr-modal__banner" role="alert">
            {error}
          </div>
        ) : null}

        <div className="pivot-landing-qr-modal__layout">
          <div className="pivot-landing-qr-modal__fields">
            <label className="pivot-landing-qr-modal__field">
              <span>Name *</span>
              <input
                value={form.name}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="e.g. poster-night"
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

            <label className="pivot-landing-qr-modal__field">
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(event) => patch({ description: event.target.value })}
                placeholder="Optional campaign notes"
                disabled={saving}
                rows={2}
              />
            </label>

            <label className="pivot-landing-qr-modal__toggle">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => patch({ isActive: event.target.checked })}
                disabled={saving}
              />
              <span>Active</span>
            </label>

            <div className="pivot-landing-qr-modal__section">
              <span className="pivot-landing-qr-modal__section-label">Colors</span>
              <div className="pivot-landing-qr-modal__presets">
                {COLOR_PRESETS.map((preset) => {
                  const active = form.fgColor === preset.fg
                    && form.bgColor === preset.bg
                    && !form.transparentBg;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      className={`pivot-landing-qr-modal__preset${active ? ' is-active' : ''}`}
                      onClick={() => applyPreset(preset)}
                      title={preset.label}
                      aria-label={preset.label}
                      disabled={saving}
                    >
                      <span style={{ background: preset.fg }} />
                      <span style={{ background: preset.bg }} />
                    </button>
                  );
                })}
              </div>
              <div className="pivot-landing-qr-modal__colors">
                <label>
                  <span>Foreground</span>
                  <span className="pivot-landing-qr-modal__color-row">
                    <input
                      type="color"
                      value={HEX_PATTERN.test(form.fgColor) ? form.fgColor : JUSTGO_QR_DEFAULT_FG}
                      onChange={(event) => patch({ fgColor: event.target.value.toUpperCase() })}
                      disabled={saving}
                    />
                    <input
                      type="text"
                      value={form.fgColor}
                      onChange={(event) => patch({ fgColor: event.target.value })}
                      disabled={saving}
                      className="pivot-landing-qr-modal__hex"
                    />
                  </span>
                </label>
                <label>
                  <span>Background</span>
                  <span className="pivot-landing-qr-modal__color-row">
                    <input
                      type="color"
                      value={HEX_PATTERN.test(form.bgColor) ? form.bgColor : JUSTGO_QR_DEFAULT_BG}
                      onChange={(event) => patch({ bgColor: event.target.value.toUpperCase() })}
                      disabled={saving || form.transparentBg}
                    />
                    <input
                      type="text"
                      value={form.bgColor}
                      onChange={(event) => patch({ bgColor: event.target.value })}
                      disabled={saving || form.transparentBg}
                      className="pivot-landing-qr-modal__hex"
                    />
                  </span>
                </label>
              </div>
              <label className="pivot-landing-qr-modal__toggle">
                <input
                  type="checkbox"
                  checked={form.transparentBg}
                  onChange={(event) => patch({ transparentBg: event.target.checked })}
                  disabled={saving}
                />
                <span>Transparent background</span>
              </label>
            </div>

            <div className="pivot-landing-qr-modal__section">
              <span className="pivot-landing-qr-modal__section-label">Dot style</span>
              <div className="pivot-landing-qr-modal__styles">
                {DOT_TYPES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`pivot-landing-qr-modal__style${form.dotType === option.value ? ' is-active' : ''}`}
                    onClick={() => patch({ dotType: option.value })}
                    disabled={saving}
                  >
                    <span className="pivot-landing-qr-modal__dots" data-type={option.value}>
                      <span /><span /><span /><span /><span />
                    </span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pivot-landing-qr-modal__section">
              <span className="pivot-landing-qr-modal__section-label">Corner style</span>
              <div className="pivot-landing-qr-modal__styles">
                {CORNER_TYPES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`pivot-landing-qr-modal__style${form.cornerType === option.value ? ' is-active' : ''}`}
                    onClick={() => patch({ cornerType: option.value })}
                    disabled={saving}
                  >
                    <span className="pivot-landing-qr-modal__corner" data-type={option.value} />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="pivot-landing-qr-modal__preview-panel">
            <div className="pivot-landing-qr-modal__preview-label">Live preview</div>
            <div className={`pivot-landing-qr-modal__preview-wrap${form.transparentBg ? ' is-transparent' : ''}`}>
              <StyledJustGoQr
                url={previewUrl}
                fgColor={form.fgColor}
                bgColor={form.bgColor}
                transparentBg={form.transparentBg}
                dotType={form.dotType}
                cornerType={form.cornerType}
                size={200}
              />
            </div>
            <p>Scans hop to this city’s landing. Confirm below to save.</p>
          </aside>
        </div>

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
            disabled={saving || !canSubmit}
          >
            {saving ? (isEdit ? 'Updating…' : 'Creating…') : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </Popup>
  );
}

export default PivotLandingQrModal;
