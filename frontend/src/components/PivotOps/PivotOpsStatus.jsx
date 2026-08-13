import React from 'react';
import './PivotOpsStatus.scss';

const TONE_ALIASES = {
  ok: 'ok',
  success: 'ok',
  good: 'ok',
  info: 'info',
  warn: 'warn',
  warning: 'warn',
  critical: 'danger',
  danger: 'danger',
  error: 'danger',
  muted: 'muted',
  default: 'muted',
};

/**
 * Sentence-case status chip. Prefer tone props over inventing ad-hoc pill classes.
 */
function PivotOpsStatus({ tone = 'muted', children, className = '' }) {
  const resolved = TONE_ALIASES[tone] || 'muted';
  return (
    <span
      className={`pivot-ops-status pivot-ops-status--${resolved}${
        className ? ` ${className}` : ''
      }`}
    >
      {children}
    </span>
  );
}

export default PivotOpsStatus;
