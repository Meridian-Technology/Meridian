import React from 'react';
import './PivotOpsBanner.scss';

/**
 * Quiet alert / callout. tone: accent | warn | danger | info | muted
 */
function PivotOpsBanner({
  tone = 'accent',
  title,
  actions,
  className = '',
  children,
  role = 'status',
}) {
  return (
    <aside
      className={`pivot-ops-banner pivot-ops-banner--${tone}${
        className ? ` ${className}` : ''
      }`}
      role={role}
    >
      <div className="pivot-ops-banner__copy">
        {title ? <p className="pivot-ops-banner__title">{title}</p> : null}
        {children ? (
          <div className="pivot-ops-banner__body">{children}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="pivot-ops-banner__actions">{actions}</div>
      ) : null}
    </aside>
  );
}

export default PivotOpsBanner;
