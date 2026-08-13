import React from 'react';
import PivotOpsCard from './PivotOpsCard';
import './PivotOpsSection.scss';

function PivotOpsSection({
  title,
  description,
  actions,
  titleId,
  className = '',
  bodyClassName = '',
  children,
  ...rest
}) {
  return (
    <PivotOpsCard
      as="section"
      className={`pivot-ops-section${className ? ` ${className}` : ''}`}
      aria-labelledby={titleId}
      {...rest}
    >
      {(title || description || actions) && (
        <div className="pivot-ops-section__head">
          <div className="pivot-ops-section__copy">
            {title ? (
              <h2 id={titleId} className="pivot-ops-section__title">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="pivot-ops-section__description">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="pivot-ops-section__actions">{actions}</div>
          ) : null}
        </div>
      )}
      <div
        className={`pivot-ops-section__body${
          bodyClassName ? ` ${bodyClassName}` : ''
        }`}
      >
        {children}
      </div>
    </PivotOpsCard>
  );
}

export default PivotOpsSection;
