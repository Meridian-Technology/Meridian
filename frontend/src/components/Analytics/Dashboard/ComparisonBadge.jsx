import React from 'react';

function ComparisonBadge({ delta, previous, isPercent }) {
  const up = delta > 0;
  const flat = delta === 0;
  const color = flat ? '#64748b' : up ? '#16a34a' : '#dc2626';
  const arrow = flat ? '→' : up ? '↑' : '↓';
  const value = isPercent ? `${Math.round(delta * 100)}%` : `${Math.round(delta * 100)}%`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color, fontSize: 12, fontWeight: 600 }}>{arrow} {value} vs prev</span>
      {typeof previous !== 'undefined' && (
        <span style={{ color: '#94a3b8', fontSize: 12 }}>(prev {isPercent ? `${Math.round(previous * 100)}%` : previous})</span>
      )}
    </div>
  );
}

export default ComparisonBadge;


