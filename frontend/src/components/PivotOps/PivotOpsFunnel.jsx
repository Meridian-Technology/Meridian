import React, { useMemo } from 'react';
import './PivotOpsFunnel.scss';

function formatPercent(numerator, denominator) {
  if (!denominator) return null;
  return `${Math.round((numerator / denominator) * 100)}%`;
}

/**
 * Horizontal funnel rows.
 * stages: [{ key, label, hint?, value }]
 */
function PivotOpsFunnel({
  stages,
  ariaLabel = 'Conversion funnel',
  className = '',
}) {
  const max = useMemo(
    () => Math.max(1, ...(stages || []).map((stage) => stage.value ?? 0)),
    [stages],
  );

  if (!stages?.length) return null;

  return (
    <div
      className={`pivot-ops-funnel${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={ariaLabel}
    >
      {stages.map((stage, index) => {
        const prev = index > 0 ? stages[index - 1].value : null;
        const conversion =
          prev != null ? formatPercent(stage.value, prev) : null;
        return (
          <div className="pivot-ops-funnel__row" key={stage.key || stage.label}>
            <div className="pivot-ops-funnel__meta">
              <span className="pivot-ops-funnel__label">{stage.label}</span>
              {stage.hint ? (
                <span className="pivot-ops-funnel__hint">{stage.hint}</span>
              ) : null}
            </div>
            <div className="pivot-ops-funnel__track">
              <div
                className="pivot-ops-funnel__bar"
                style={{
                  width: `${Math.max(2, ((stage.value ?? 0) / max) * 100)}%`,
                }}
              />
              <span className="pivot-ops-funnel__value">{stage.value ?? 0}</span>
            </div>
            <span className="pivot-ops-funnel__conversion">
              {conversion ? `${conversion} of prev` : '\u00a0'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default PivotOpsFunnel;
