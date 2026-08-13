import React from 'react';
import './PivotOpsMetric.scss';

function PivotOpsMetric({ label, value, hint, delta, className = '' }) {
  const deltaClass =
    delta == null
      ? ''
      : delta > 0
        ? ' pivot-ops-metric__delta--up'
        : delta < 0
          ? ' pivot-ops-metric__delta--down'
          : '';

  return (
    <div className={`pivot-ops-metric${className ? ` ${className}` : ''}`}>
      <span className="pivot-ops-metric__label">{label}</span>
      <span className="pivot-ops-metric__value">{value}</span>
      {hint ? <span className="pivot-ops-metric__hint">{hint}</span> : null}
      {delta != null ? (
        <span className={`pivot-ops-metric__delta${deltaClass}`}>
          {delta > 0 ? '+' : ''}
          {delta} vs prev
        </span>
      ) : null}
    </div>
  );
}

function PivotOpsMetricGrid({ className = '', children }) {
  return (
    <div className={`pivot-ops-metric-grid${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}

export { PivotOpsMetric, PivotOpsMetricGrid };
export default PivotOpsMetric;
