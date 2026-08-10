import React, { useEffect, useMemo, useState } from 'react';
import Popup from '../../../../components/Popup/Popup';
import {
  buildCrewConfigSavePreview,
  formatJsonDiff,
  mergePivotCrewConfig,
} from './pivotCrewConfigUtils';
import './PivotCrewConfigSaveModal.scss';

function PivotCrewConfigSaveModal({
  isOpen,
  preview,
  saving,
  onClose,
  onConfirm,
}) {
  const diffLines = useMemo(() => {
    if (!preview) return [];
    return formatJsonDiff(preview.beforeEffective, preview.afterEffective);
  }, [preview]);

  if (!preview) {
    return null;
  }

  return (
    <Popup
      isOpen={isOpen}
      onClose={onClose}
      customClassName="pivot-crew-config-save-modal"
      disableOutsideClick={saving}
    >
      <div className="pivot-crew-config-save-modal__body">
        <h2 className="pivot-crew-config-save-modal__title">Review crew config changes</h2>
        <p className="pivot-crew-config-save-modal__lead">
          Stored tenant overrides will be replaced with the diff below. Effective values are what
          mobile clients receive from <code>GET /pivot/config</code>.
        </p>

        <div className="pivot-crew-config-save-modal__section">
          <h3 className="pivot-crew-config-save-modal__section-title">Stored override patch</h3>
          <pre className="pivot-crew-config-save-modal__json">
            {JSON.stringify(preview.storedPatch, null, 2)}
          </pre>
        </div>

        <div className="pivot-crew-config-save-modal__section">
          <h3 className="pivot-crew-config-save-modal__section-title">Effective config diff</h3>
          <pre className="pivot-crew-config-save-modal__diff">
            {diffLines.map((line, index) => (
              <span
                key={`${line.type}-${index}`}
                className={`pivot-crew-config-save-modal__diff-line pivot-crew-config-save-modal__diff-line--${line.type}`}
              >
                {line.text}
                {'\n'}
              </span>
            ))}
          </pre>
        </div>

        <footer className="pivot-crew-config-save-modal__footer">
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
            {saving ? 'Saving…' : 'Save crew config'}
          </button>
        </footer>
      </div>
    </Popup>
  );
}

export default PivotCrewConfigSaveModal;
