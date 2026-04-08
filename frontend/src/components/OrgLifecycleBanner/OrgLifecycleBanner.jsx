import React from 'react';
import { Icon } from '@iconify-icon/react';
import './OrgLifecycleBanner.scss';

const MESSAGES = {
    sunset: 'This organization is in sunset status. Some actions may be limited by campus policy.',
    inactive: 'This organization is inactive. Event creation may be blocked until status is restored.'
};

export default function OrgLifecycleBanner({ lifecycleStatus }) {
    if (!lifecycleStatus || lifecycleStatus === 'active') return null;
    const msg = MESSAGES[lifecycleStatus] || `Organization lifecycle status: ${lifecycleStatus}.`;
    return (
        <div className={`org-lifecycle-banner org-lifecycle-banner--${lifecycleStatus}`} role="status">
            <Icon icon="mdi:information-outline" className="org-lifecycle-banner__icon" />
            <span className="org-lifecycle-banner__text">{msg}</span>
        </div>
    );
}
