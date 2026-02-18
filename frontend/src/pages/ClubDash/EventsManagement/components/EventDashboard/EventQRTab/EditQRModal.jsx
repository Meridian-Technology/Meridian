import React, { useState, useEffect, useRef } from 'react';
import apiRequest from '../../../../../../utils/postRequest';
import './CreateQRModal.scss';

const DOT_TYPES = [
    { value: 'extra-rounded', label: 'Rounded', desc: 'Soft, pill-like corners' },
    { value: 'square', label: 'Square', desc: 'Classic look' },
    { value: 'dots', label: 'Dots', desc: 'Circular modules' }
];

const CORNER_TYPES = [
    { value: 'extra-rounded', label: 'Rounded', desc: 'Smooth, pill-like corners' },
    { value: 'square', label: 'Square', desc: 'Sharp corners' },
    { value: 'dot', label: 'Dot', desc: 'Minimal corners' }
];

function toLibraryDotType(uiType) {
    if (uiType === 'rounded' || uiType === 'teardrop') return 'extra-rounded'; // legacy
    return uiType || 'extra-rounded';
}

function toLibraryCornerType(uiType) {
    if (uiType === 'dot') return { square: 'dot', dot: 'dot' };
    if (uiType === 'rounded' || uiType === 'teardrop') return { square: 'extra-rounded', dot: 'extra-rounded' }; // legacy
    return { square: uiType || 'extra-rounded', dot: uiType === 'extra-rounded' ? 'extra-rounded' : 'square' };
}

const COLOR_PRESETS = [
    { fg: '#414141', bg: '#ffffff', label: 'Dark on white' },
    { fg: '#000000', bg: '#ffffff', label: 'Black on white' },
    { fg: '#ffffff', bg: '#414141', label: 'White on dark' },
    { fg: '#4DAA57', bg: '#ffffff', label: 'Green on white' },
    { fg: '#2563eb', bg: '#ffffff', label: 'Blue on white' },
    { fg: '#000000', bg: '#fef3c7', label: 'Black on cream' }
];

function QRPreview({ url, fgColor, bgColor, dotType, cornerType, transparentBg, size = 180 }) {
    const containerRef = useRef(null);

    useEffect(() => {
        if (!url || !containerRef.current) return;
        let mounted = true;

        const loadQR = async () => {
            const { default: QRCodeStyling } = await import('qr-code-styling');
            if (!mounted || !containerRef.current) return;
            const corners = toLibraryCornerType(cornerType);
            const qr = new QRCodeStyling({
                width: size,
                height: size,
                type: 'svg',
                data: url,
                dotsOptions: { color: fgColor, type: toLibraryDotType(dotType) },
                backgroundOptions: { color: transparentBg ? 'transparent' : bgColor },
                cornersSquareOptions: { type: corners.square, color: fgColor },
                cornersDotOptions: { type: corners.dot, color: fgColor }
            });
            containerRef.current.innerHTML = '';
            qr.append(containerRef.current);
        };
        loadQR();
        return () => {
            mounted = false;
            if (containerRef.current) containerRef.current.innerHTML = '';
        };
    }, [url, fgColor, bgColor, dotType, cornerType, transparentBg, size]);

    return <div ref={containerRef} className="qr-preview-canvas" style={{ width: size, height: size }} />;
}

function EditQRModal({ event, orgId, qr, onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        name: qr?.name || '',
        fgColor: qr?.fgColor || '#414141',
        bgColor: qr?.bgColor || '#ffffff',
        transparentBg: qr?.transparentBg ?? false,
        dotType: qr?.dotType || 'extra-rounded',
        cornerType: qr?.cornerType || 'extra-rounded'
    });
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (qr) {
            const norm = (v) => {
                if (v === 'rounded' || v === 'teardrop') return 'extra-rounded';
                return v;
            };
            setFormData({
                name: qr.name || '',
                fgColor: qr.fgColor || '#414141',
                bgColor: qr.bgColor || '#ffffff',
                transparentBg: qr.transparentBg ?? false,
                dotType: norm(qr.dotType) || 'extra-rounded',
                cornerType: norm(qr.cornerType) || 'extra-rounded'
            });
        }
    }, [qr]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/qr/${qr._id}`,
                formData,
                { method: 'PUT' }
            );
            if (response.error) {
                setError(response.error);
            } else if (response.success) {
                onSuccess?.();
                onClose?.();
            } else {
                setError('Failed to update QR code');
            }
        } catch (err) {
            setError('Failed to update QR code');
        } finally {
            setLoading(false);
        }
    };

    const applyPreset = (preset) => {
        setFormData((prev) => ({ ...prev, fgColor: preset.fg, bgColor: preset.bg, transparentBg: false }));
    };

    const previewUrl = qr?.shortId ? `${window.location.origin}/qr/e/${qr.shortId}` : null;

    return (
        <div className="create-qr-modal">
            <h2>Edit QR Code</h2>
            <p className="create-qr-modal-subtitle">Update the name and styling. Changes apply immediately.</p>
            {error && (
                <div className="create-qr-modal-error">
                    {error}
                    <button type="button" onClick={() => setError(null)}>×</button>
                </div>
            )}

            <form onSubmit={handleSubmit} className="create-qr-form">
                <div className="create-qr-modal-layout">
                    <div className="create-qr-form-fields">
                        <div className="form-group">
                            <label>Name</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g. Poster, Flyer, Table Tent"
                            required
                            disabled={loading}
                        />
                        </div>

                        <div className="form-section">
                        <label className="form-section-label">Colors</label>
                        <div className="color-presets">
                            {COLOR_PRESETS.map((preset) => (
                                <button
                                    key={preset.label}
                                    type="button"
                                    className={`color-preset-btn ${formData.fgColor === preset.fg && formData.bgColor === preset.bg ? 'active' : ''}`}
                                    onClick={() => applyPreset(preset)}
                                    title={preset.label}
                                >
                                    <span className="color-preset-fg" style={{ background: preset.fg }} />
                                    <span className="color-preset-bg" style={{ background: preset.bg }} />
                                </button>
                            ))}
                        </div>
                        <div className="color-custom-row">
                            <div className="color-picker-group">
                                <label>Foreground</label>
                                <div className="color-input-row">
                                    <input
                                        type="color"
                                        value={formData.fgColor}
                                        onChange={(e) => setFormData({ ...formData, fgColor: e.target.value })}
                                        disabled={loading}
                                        className="color-swatch"
                                    />
                                    <input
                                        type="text"
                                        value={formData.fgColor}
                                        onChange={(e) => setFormData({ ...formData, fgColor: e.target.value })}
                                        disabled={loading}
                                        className="color-hex"
                                    />
                                </div>
                            </div>
                            <div className="color-picker-group">
                                <label>Background</label>
                                <div className="color-input-row">
                                    <input
                                        type="color"
                                        value={formData.bgColor}
                                        onChange={(e) => setFormData({ ...formData, bgColor: e.target.value })}
                                        disabled={loading || formData.transparentBg}
                                        className="color-swatch"
                                    />
                                    <input
                                        type="text"
                                        value={formData.bgColor}
                                        onChange={(e) => setFormData({ ...formData, bgColor: e.target.value })}
                                        disabled={loading || formData.transparentBg}
                                        className="color-hex"
                                    />
                                </div>
                            </div>
                        </div>
                        <label className="transparent-toggle">
                            <input
                                type="checkbox"
                                checked={formData.transparentBg}
                                onChange={(e) => setFormData({ ...formData, transparentBg: e.target.checked })}
                                disabled={loading}
                            />
                            <span>Transparent background</span>
                        </label>
                        </div>

                        <div className="form-section">
                            <label className="form-section-label">Dot style</label>
                        <div className="style-options">
                            {DOT_TYPES.map((t) => (
                                <button
                                    key={t.value}
                                    type="button"
                                    className={`style-option-btn ${formData.dotType === t.value ? 'active' : ''}`}
                                    onClick={() => setFormData({ ...formData, dotType: t.value })}
                                    disabled={loading}
                                >
                                    <span className="style-option-dots" data-type={t.value}>
                                        <span /><span /><span /><span /><span />
                                    </span>
                                    <span className="style-option-label">{t.label}</span>
                                </button>
                            ))}
                        </div>
                        </div>

                        <div className="form-section">
                            <label className="form-section-label">Corner style</label>
                        <div className="style-options">
                            {CORNER_TYPES.map((t) => (
                                <button
                                    key={t.value}
                                    type="button"
                                    className={`style-option-btn ${formData.cornerType === t.value ? 'active' : ''}`}
                                    onClick={() => setFormData({ ...formData, cornerType: t.value })}
                                    disabled={loading}
                                >
                                    <span className="style-option-corner" data-type={t.value} />
                                    <span className="style-option-label">{t.label}</span>
                                </button>
                            ))}
                        </div>
                        </div>
                    </div>

                    <div className="create-qr-preview-panel">
                        <div className="preview-label">Live preview</div>
                        <div className={`preview-qr-wrap ${formData.transparentBg ? 'transparent-bg' : ''}`}>
                        {previewUrl ? (
                            <QRPreview
                                url={previewUrl}
                                fgColor={formData.fgColor}
                                bgColor={formData.bgColor}
                                dotType={formData.dotType}
                                cornerType={formData.cornerType}
                                transparentBg={formData.transparentBg}
                                size={200}
                            />
                        ) : (
                            <div className="preview-placeholder">Loading...</div>
                        )}
                        </div>
                        <p className="preview-hint">This is how your QR will look. It links to your event.</p>
                    </div>
                </div>

                <div className="modal-actions">
                    <button type="button" onClick={onClose} disabled={loading}>
                        Cancel
                    </button>
                    <button type="submit" disabled={loading || !formData.name.trim()}>
                        {loading ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default EditQRModal;
