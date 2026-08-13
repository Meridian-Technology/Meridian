import React, { useMemo } from 'react';
import './PivotOpsBarList.scss';

/**
 * Horizontal bar rows for ranked / rate data.
 * items: [{ key, label, value, max?, hint?, secondary? }]
 * value is used for bar width; pass max to share a scale across rows.
 */
function PivotOpsBarList({
  items,
  ariaLabel = 'Bar chart',
  valueFormat = (v) => String(v ?? 0),
  className = '',
  bare = false,
}) {
  const max = useMemo(() => {
    if (!items?.length) return 1;
    const explicit = items.map((item) => item.max).find((m) => m != null);
    if (explicit != null) return Math.max(1, explicit);
    return Math.max(1, ...items.map((item) => Number(item.value) || 0));
  }, [items]);

  if (!items?.length) return null;

  return (
    <div
      className={`pivot-ops-bar-list${bare ? ' pivot-ops-bar-list--bare' : ''}${
        className ? ` ${className}` : ''
      }`}
      role="img"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const numeric = Number(item.value) || 0;
        const width = Math.max(2, (numeric / max) * 100);
        return (
          <div className="pivot-ops-bar-list__row" key={item.key || item.label}>
            <div className="pivot-ops-bar-list__meta">
              <span className="pivot-ops-bar-list__label" title={item.label}>
                {item.label}
              </span>
              {item.hint ? (
                <span className="pivot-ops-bar-list__hint">{item.hint}</span>
              ) : null}
            </div>
            <div className="pivot-ops-bar-list__track">
              <div
                className={`pivot-ops-bar-list__bar${
                  item.tone === 'muted' ? ' pivot-ops-bar-list__bar--muted' : ''
                }${item.striped ? ' pivot-ops-bar-list__bar--striped' : ''}`}
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="pivot-ops-bar-list__value">
              {item.secondary != null ? (
                <>
                  {valueFormat(item.value)}
                  <span className="pivot-ops-bar-list__secondary">
                    {item.secondary}
                  </span>
                </>
              ) : (
                valueFormat(item.value)
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default PivotOpsBarList;
