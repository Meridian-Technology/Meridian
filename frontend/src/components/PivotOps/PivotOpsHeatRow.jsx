import React, { useMemo } from 'react';
import './PivotOpsHeatRow.scss';

/**
 * Single-row heatmap / contribution pulse.
 * cells: [{ key, label, value, title?, sublabel?, caption? }]
 * value: absolute counts (normalized against max) or 0–1 intensities.
 * caption: optional letter under the cell (contrib heatmaps).
 */
function PivotOpsHeatRow({
  cells,
  label,
  ariaLabel,
  normalize = true,
  variant = 'default',
  className = '',
}) {
  const max = useMemo(() => {
    if (!cells?.length) return 1;
    return Math.max(1, ...cells.map((cell) => Number(cell.value) || 0));
  }, [cells]);

  if (!cells?.length) return null;

  return (
    <div
      className={`pivot-ops-heat-row pivot-ops-heat-row--${variant}${
        className ? ` ${className}` : ''
      }`}
      role="img"
      aria-label={ariaLabel || label || 'Heatmap'}
    >
      {label ? <p className="pivot-ops-heat-row__label">{label}</p> : null}
      <div className="pivot-ops-heat-row__cells">
        {cells.map((cell) => {
          const raw = Number(cell.value) || 0;
          const intensity = normalize
            ? Math.max(0, Math.min(1, raw > 1 || max > 1 ? raw / max : raw))
            : Math.max(0, Math.min(1, raw / max));
          // Keep empty days visible but nearly blank (GitHub-style).
          const heat = raw <= 0 ? 0 : Math.max(0.18, intensity);
          const tip =
            cell.title || `${cell.label}: ${cell.value ?? '—'}`;
          const cellNode = (
            <div
              className={`pivot-ops-heat-row__cell${
                raw <= 0 ? ' is-empty' : ''
              }`}
              style={{
                '--heat': heat.toFixed(3),
              }}
              tabIndex={0}
              aria-label={tip}
            >
              <span className="pivot-ops-heat-row__cell-label">{cell.label}</span>
              {cell.sublabel != null ? (
                <span className="pivot-ops-heat-row__cell-sub">{cell.sublabel}</span>
              ) : null}
              <span className="pivot-ops-heat-row__tip" role="tooltip">
                {tip}
              </span>
            </div>
          );

          if (variant === 'contrib') {
            return (
              <div
                key={cell.key || cell.label}
                className="pivot-ops-heat-row__unit"
              >
                {cellNode}
                <span className="pivot-ops-heat-row__caption" aria-hidden="true">
                  {cell.caption || ''}
                </span>
              </div>
            );
          }

          return (
            <React.Fragment key={cell.key || cell.label}>
              {cellNode}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default PivotOpsHeatRow;
