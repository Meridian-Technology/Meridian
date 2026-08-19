import React from 'react';
import Popup from '../../../components/Popup/Popup';
import { formatPivotCopyTemplate } from './pivotCopyFormat';
import './PivotVoicePage.scss';

function PivotVoiceSaveModal({
  isOpen,
  row,
  before,
  after,
  previewParams,
  saving,
  onClose,
  onConfirm,
}) {
  if (!row) return null;

  const beforePreview = formatPivotCopyTemplate(before, previewParams);
  const afterPreview = formatPivotCopyTemplate(after, previewParams);
  const inheritLabel = row.type === 'token' ? 'token default' : 'shipped';

  return (
    <Popup
      isOpen={isOpen}
      onClose={onClose}
      customClassName="pivot-voice-save-modal"
      disableOutsideClick={saving}
    >
      <div className="pivot-voice-save-modal__body">
        <h2 className="pivot-voice-save-modal__title">Review voice change</h2>
        <p className="pivot-voice-save-modal__lead">
          Live write to the platform pack for <code>{row.path}</code>. Phones pick this
          up from <code>GET /pivot/copy</code> on the next revision mismatch.
        </p>

        <div className="pivot-voice-save-modal__section">
          <h3 className="pivot-voice-save-modal__section-title">Before</h3>
          <pre className="pivot-voice-save-modal__json">
            {before || `(inherit ${inheritLabel})`}
          </pre>
          <p className="pivot-voice-save-modal__preview">
            {beforePreview.ok ? beforePreview.text : beforePreview.error}
          </p>
        </div>

        <div className="pivot-voice-save-modal__section">
          <h3 className="pivot-voice-save-modal__section-title">After</h3>
          <pre className="pivot-voice-save-modal__json">{after}</pre>
          <p className="pivot-voice-save-modal__preview">
            {afterPreview.ok ? afterPreview.text : afterPreview.error}
          </p>
        </div>

        <footer className="pivot-voice-save-modal__footer">
          <button
            type="button"
            className="linear-btn linear-btn--ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="linear-btn linear-btn--primary"
            onClick={onConfirm}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save voice'}
          </button>
        </footer>
      </div>
    </Popup>
  );
}

export default PivotVoiceSaveModal;
