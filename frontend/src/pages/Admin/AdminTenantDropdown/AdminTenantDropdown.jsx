import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@iconify-icon/react';
import useAuth from '../../../hooks/useAuth';
import {
    getTenantDefinitions,
    getTenantRedirectUrl,
    getCurrentTenantKey,
    getCurrentTenantDisplayName,
    setLastTenant,
    setTenantConfigCache,
} from '../../../config/tenantRedirect';
import defaultAvatar from '../../../assets/defaultAvatar.svg';
import '../../ClubDash/OrgDropdown/OrgDropdown.scss';
import './AdminTenantDropdown.scss';

const DEV_OVERRIDE_KEY = 'devTenantOverride';

function AdminTenantDropdown() {
    const { user } = useAuth();
    const [showDrop, setShowDrop] = useState(false);
    const [tenants, setTenants] = useState(() => getTenantDefinitions());
    const [isAnimating, setIsAnimating] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);

    useEffect(() => {
        let cancelled = false;
        async function loadTenantConfig() {
            try {
                const response = await fetch('/api/tenant-config', { credentials: 'include' });
                if (!response.ok) return;
                const payload = await response.json();
                if (!payload?.success || !Array.isArray(payload?.data?.tenants)) return;
                setTenantConfigCache(payload.data.tenants);
                if (!cancelled) {
                    setTenants(getTenantDefinitions());
                }
            } catch (_) {
                /* ignore */
            }
        }
        loadTenantConfig();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (showDrop) {
            setShouldRender(true);
            setIsAnimating(true);
        } else {
            setIsAnimating(false);
            const timer = setTimeout(() => {
                setShouldRender(false);
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [showDrop]);

    const currentKey = getCurrentTenantKey();
    const displayLabel = getCurrentTenantDisplayName();
    const isLocalhostDev =
        process.env.NODE_ENV !== 'production' && typeof window !== 'undefined' && window.location.hostname === 'localhost';
    const hasDevOverride =
        isLocalhostDev &&
        (() => {
            try {
                return !!localStorage.getItem(DEV_OVERRIDE_KEY);
            } catch (_) {
                return false;
            }
        })();

    const handleSelectTenant = useCallback(
        (tenantKey) => {
            if (!tenantKey || tenantKey === currentKey) {
                setShowDrop(false);
                return;
            }
            setLastTenant(tenantKey);
            const path = `${window.location.pathname}${window.location.search || ''}`;
            if (isLocalhostDev) {
                try {
                    localStorage.setItem(DEV_OVERRIDE_KEY, tenantKey);
                } catch (_) {
                    /* ignore */
                }
                window.location.href = `${window.location.origin}${path}`;
                return;
            }
            window.location.href = getTenantRedirectUrl(
                tenantKey,
                window.location.pathname,
                window.location.search || ''
            );
        },
        [currentKey, isLocalhostDev]
    );

    const handleClearDevOverride = useCallback(() => {
        try {
            localStorage.removeItem(DEV_OVERRIDE_KEY);
        } catch (_) {
            /* ignore */
        }
        window.location.reload();
    }, []);

    return (
        <div
            className="org-dropdown admin-tenant-dropdown"
            onClick={() => setShowDrop(!showDrop)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setShowDrop(!showDrop);
                }
            }}
            aria-expanded={showDrop}
            aria-haspopup="listbox"
        >
            <img src={user?.picture || defaultAvatar} alt="" />
            <div className="admin-tenant-dropdown__titles">
                <h1 title={displayLabel}>{displayLabel}</h1>
                {currentKey ? (
                    <span className="admin-tenant-dropdown__key">{currentKey}</span>
                ) : null}
            </div>
            <Icon
                className="admin-tenant-dropdown__chevron"
                icon={showDrop ? 'ic:round-keyboard-arrow-up' : 'ic:round-keyboard-arrow-down'}
                width="24"
                height="24"
            />
            {shouldRender && (
                <div className={`dropdown ${!isAnimating ? 'dropdown-exit' : ''}`} onClick={(e) => e.stopPropagation()}>
                    <div className="org-list" role="listbox">
                        {tenants.map((tenant) => (
                            <div
                                className={`drop-option ${tenant.tenantKey === currentKey ? 'selected' : ''}`}
                                key={tenant.tenantKey}
                                role="option"
                                aria-selected={tenant.tenantKey === currentKey}
                                onClick={() => handleSelectTenant(tenant.tenantKey)}
                            >
                                <Icon icon="mdi:domain" width={22} height={22} className="admin-tenant-dropdown__row-icon" />
                                <div className="admin-tenant-dropdown__option-text">
                                    <p>{tenant.name}</p>
                                    {(tenant.status && tenant.status !== 'active') || tenant.location ? (
                                        <span className="admin-tenant-dropdown__meta">
                                            {tenant.status !== 'active'
                                                ? `${String(tenant.status).replace(/_/g, ' ')} · `
                                                : ''}
                                            {tenant.location || tenant.subdomain}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>
                    {isLocalhostDev && hasDevOverride && (
                        <button type="button" className="create-org" onClick={handleClearDevOverride}>
                            <p>Clear dev tenant override</p>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default AdminTenantDropdown;
