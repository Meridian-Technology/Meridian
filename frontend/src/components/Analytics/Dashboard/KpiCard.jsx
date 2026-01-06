import React from 'react';
import { Icon } from '@iconify-icon/react';
import './KpiCard.scss';

function KpiCard({ 
  title, 
  value, 
  subtitle, 
  icon, 
  iconClass,
  iconVariant, // 'approved', 'rejected', 'pending', or default
  className 
}) {
  // Support both value prop and number prop for flexibility
  const displayValue = value !== undefined ? value : null;
  
  return (
    <div className={`kpi-card ${className || ''}`}>
      {icon && (
        <div className={`kpi-card__icon ${iconClass || ''} ${iconVariant || ''}`}>
          <Icon icon={icon} />
        </div>
      )}
      <div className="kpi-card__content">
        {displayValue !== null && (
          <div className="kpi-card__value">{displayValue}</div>
        )}
        {title && <div className="kpi-card__title">{title}</div>}
        {subtitle && <div className="kpi-card__subtitle">{subtitle}</div>}
      </div>
    </div>
  );
}

export default KpiCard;


