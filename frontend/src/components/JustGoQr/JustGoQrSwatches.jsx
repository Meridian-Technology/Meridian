import React from 'react';
import { Icon } from '@iconify-icon/react';
import { JUSTGO_QR_SWATCHES } from './justGoQrTheme';
import './JustGoQr.scss';

function JustGoQrSwatches({ value, onChange, labelledBy }) {
  return (
    <div className="justgo-qr-swatches" role="radiogroup" aria-labelledby={labelledBy} aria-label="QR color">
      {JUSTGO_QR_SWATCHES.map((swatch) => {
        const selected = String(value || '').toLowerCase() === swatch.value.toLowerCase();
        return (
          <button
            key={swatch.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`justgo-qr-swatch${selected ? ' is-selected' : ''}`}
            style={{ '--swatch': swatch.value }}
            onClick={() => onChange?.(swatch.value)}
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

export default JustGoQrSwatches;
