import React from 'react';
import './PivotOpsCard.scss';

function PivotOpsCard({ as: Comp = 'div', className = '', children, ...rest }) {
  return (
    <Comp className={`pivot-ops-card${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </Comp>
  );
}

export default PivotOpsCard;
