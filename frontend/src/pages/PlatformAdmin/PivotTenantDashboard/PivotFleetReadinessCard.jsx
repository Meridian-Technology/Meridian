import React from 'react';
import { Link } from 'react-router-dom';
import PivotOpsAnimateNumber from '../../../components/PivotOps/PivotOpsAnimateNumber';
import './PivotReadinessCard.scss';
import './PivotFleetReadinessCard.scss';

/**
 * Fleet mast: cities below target, worst score, hours to soonest drop.
 * Not a blended /100 score.
 */
function PivotFleetReadinessCard({ readiness, loading = false, className = '' }) {
  if (loading && !readiness) {
    return (
      <aside
        className={`pivot-readiness pivot-readiness--compact pivot-fleet-readiness ${className}`.trim()}
        aria-busy="true"
      >
        <p className="pivot-readiness__loading">Loading readiness…</p>
      </aside>
    );
  }

  if (!readiness) return null;

  const below = readiness.belowTarget ?? 0;
  const cityCount = readiness.cityCount ?? readiness.cities?.length ?? 0;
  const worst = readiness.worstScore;
  const hours = readiness.soonestHoursUntilDrop;
  const tone = below > 0 || (worst != null && worst < 55) ? 'low' : worst != null && worst < 80 ? 'ok' : 'good';

  return (
    <aside
      className={`pivot-readiness pivot-readiness--${tone} pivot-readiness--compact pivot-fleet-readiness ${className}`.trim()}
      aria-label="Fleet drop readiness"
    >
      <div className="pivot-readiness__score-block">
        <p className="pivot-readiness__label">Fleet readiness</p>
        <p className="pivot-readiness__score" aria-label={`${below} of ${cityCount} cities below target`}>
          <PivotOpsAnimateNumber value={below} />
          <span className="pivot-readiness__score-max">/{cityCount} below</span>
        </p>
        <p className="pivot-readiness__meta">
          {worst != null ? `worst ${worst}/100` : '—'}
          {hours != null ? ` · ${Math.round(hours)}h to next drop` : ''}
        </p>
      </div>
      {Array.isArray(readiness.cities) && readiness.cities.length ? (
        <ul className="pivot-fleet-readiness__cities">
          {readiness.cities.map((city) => (
            <li key={city.tenantKey}>
              <Link to={`/platform-admin/pivot/${encodeURIComponent(city.tenantKey)}`}>
                {city.cityDisplayName}
              </Link>
              <span>{city.score ?? '—'}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}

export default PivotFleetReadinessCard;
