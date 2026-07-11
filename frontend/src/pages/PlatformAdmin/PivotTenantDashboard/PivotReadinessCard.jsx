import React from 'react';
import { Link } from 'react-router-dom';
import './PivotReadinessCard.scss';

function formatComponentValue(component) {
  if (component == null || component.value == null) return '—';
  if (component.unit === 'ratio') {
    return `${Math.round(component.value * 100)}%`;
  }
  if (component.unit === 'hours') {
    return `${Math.round(component.value)}h`;
  }
  return String(component.value);
}

function formatBenchmark(component) {
  if (component?.benchmark == null) return null;
  if (component.unit === 'ratio') {
    return `${Math.round(component.benchmark * 100)}%`;
  }
  if (component.unit === 'hours') {
    return `${Math.round(component.benchmark)}h`;
  }
  return String(component.benchmark);
}

/**
 * @param {{ readiness: object|null, loading?: boolean, compact?: boolean, className?: string }} props
 */
function PivotReadinessCard({ readiness, loading = false, compact = false, className = '' }) {
  if (loading && !readiness) {
    return (
      <aside
        className={`pivot-readiness ${compact ? 'pivot-readiness--compact' : ''} ${className}`.trim()}
        aria-busy="true"
      >
        <p className="pivot-readiness__loading">Loading readiness…</p>
      </aside>
    );
  }

  if (!readiness) return null;

  const score = readiness.score ?? 0;
  const scoreTone =
    score >= 80 ? 'good' : score >= 55 ? 'ok' : 'low';

  return (
    <aside
      className={`pivot-readiness pivot-readiness--${scoreTone} ${
        compact ? 'pivot-readiness--compact' : ''
      } ${className}`.trim()}
      aria-label="Drop readiness"
    >
      <div className="pivot-readiness__score-block">
        <p className="pivot-readiness__label">Readiness</p>
        <p className="pivot-readiness__score" aria-label={`Score ${score} out of 100`}>
          {score}
          <span className="pivot-readiness__score-max">/100</span>
        </p>
        <p className="pivot-readiness__meta">
          {readiness.batchWeek}
          {readiness.targetEventCount != null
            ? ` · target ${readiness.metrics?.readyCount ?? 0}/${readiness.targetEventCount}`
            : null}
          {readiness.hoursUntilDrop != null
            ? ` · ${Math.round(readiness.hoursUntilDrop)}h to drop`
            : null}
        </p>
      </div>

      {!compact && Array.isArray(readiness.components) && readiness.components.length ? (
        <ul className="pivot-readiness__components">
          {readiness.components.map((component) => {
            const bench = formatBenchmark(component);
            return (
              <li
                key={component.key}
                className={`pivot-readiness__component pivot-readiness__component--${
                  component.status || 'on'
                }`}
              >
                <span className="pivot-readiness__component-label">{component.label}</span>
                <span className="pivot-readiness__component-value">
                  {formatComponentValue(component)}
                  {bench != null ? (
                    <span className="pivot-readiness__component-bench"> vs {bench}</span>
                  ) : null}
                </span>
                <span className="pivot-readiness__component-status">
                  {component.status || 'on'}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {Array.isArray(readiness.ctas) && readiness.ctas.length ? (
        <ul className="pivot-readiness__ctas">
          {readiness.ctas.slice(0, compact ? 2 : 4).map((cta) => (
            <li key={cta.id || cta.label}>
              {cta.href ? (
                <Link className="pivot-readiness__cta" to={cta.href}>
                  {cta.label}
                </Link>
              ) : (
                <span className="pivot-readiness__cta pivot-readiness__cta--static">
                  {cta.label}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="pivot-readiness__all-clear">On track for this drop.</p>
      )}

      {!compact && readiness.formula?.description ? (
        <p className="pivot-readiness__formula" title={readiness.formula.description}>
          Formula {readiness.formula.version}
          {readiness.benchmarkWeeksUsed
            ? ` · vs last ${readiness.benchmarkWeeksUsed} released week${
                readiness.benchmarkWeeksUsed === 1 ? '' : 's'
              }`
            : ' · no released-week benchmark yet'}
        </p>
      ) : null}
    </aside>
  );
}

export default PivotReadinessCard;
export { formatComponentValue };
