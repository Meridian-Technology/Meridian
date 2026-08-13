import React, { useMemo } from 'react';
import './PivotOpsStack.scss';

const SEGMENT_TONES = ['accent', 'ink', 'soft', 'warn', 'success'];

/**
 * Stacked composition bar + legend.
 * segments: [{ key, label, value, tone? }]
 */
function PivotOpsStack({
  segments,
  title,
  ariaLabel,
  className = '',
}) {
  const total = useMemo(
    () =>
      (segments || []).reduce(
        (sum, segment) => sum + (Number(segment.value) || 0),
        0,
      ),
    [segments],
  );

  if (!segments?.length || total <= 0) {
    return (
      <div className={`pivot-ops-stack${className ? ` ${className}` : ''}`}>
        {title ? <p className="pivot-ops-stack__title">{title}</p> : null}
        <p className="pivot-ops-stack__empty">No composition data</p>
      </div>
    );
  }

  return (
    <div
      className={`pivot-ops-stack${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={ariaLabel || title || 'Composition'}
    >
      {title ? <p className="pivot-ops-stack__title">{title}</p> : null}
      <div className="pivot-ops-stack__bar">
        {segments.map((segment, index) => {
          const value = Number(segment.value) || 0;
          if (value <= 0) return null;
          const tone = segment.tone || SEGMENT_TONES[index % SEGMENT_TONES.length];
          return (
            <div
              key={segment.key || segment.label}
              className={`pivot-ops-stack__segment pivot-ops-stack__segment--${tone}`}
              style={{ flexGrow: value, flexBasis: 0 }}
              title={`${segment.label}: ${value}`}
            />
          );
        })}
      </div>
      <ul className="pivot-ops-stack__legend">
        {segments.map((segment, index) => {
          const value = Number(segment.value) || 0;
          const tone = segment.tone || SEGMENT_TONES[index % SEGMENT_TONES.length];
          const pct = Math.round((value / total) * 100);
          return (
            <li key={segment.key || segment.label}>
              <span
                className={`pivot-ops-stack__swatch pivot-ops-stack__swatch--${tone}`}
              />
              <span className="pivot-ops-stack__legend-label">{segment.label}</span>
              <span className="pivot-ops-stack__legend-value">
                {value}
                <span className="pivot-ops-stack__legend-pct">{pct}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default PivotOpsStack;
