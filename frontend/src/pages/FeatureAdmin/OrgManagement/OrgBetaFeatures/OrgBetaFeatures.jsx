import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useFetch } from '../../../../hooks/useFetch';
import { useGradient } from '../../../../hooks/useGradient';
import { useNotification } from '../../../../NotificationContext';
import apiRequest from '../../../../utils/postRequest';
import { Icon } from '@iconify-icon/react';
import Popup from '../../../../components/Popup/Popup';
import {
    ORG_BETA_FEATURE_KEYS,
    ORG_BETA_FEATURE_CATALOG,
    ORG_BETA_DISABLED_MENU_BEHAVIOR_COMING_SOON,
    ORG_BETA_DISABLED_MENU_BEHAVIOR_HIDE
} from '../../../../constants/orgBetaFeatures';
import './OrgBetaFeatures.scss';

const PAGE_SIZE = 20;

function buildOrgListQuery(filters) {
    const p = new URLSearchParams();
    if (filters.search) p.set('search', filters.search);
    if (filters.verified === 'true' || filters.verified === 'false') {
        p.set('verified', filters.verified);
    }
    p.set('page', String(filters.page));
    p.set('limit', String(PAGE_SIZE));
    return p.toString();
}

function OrgBetaFeatures() {
    const { addNotification } = useNotification();
    const { AtlasMain, AdminGrad } = useGradient();
    const [searchDraft, setSearchDraft] = useState('');
    const [filters, setFilters] = useState({
        search: '',
        verified: '',
        page: 1
    });
    const [savingByOrgId, setSavingByOrgId] = useState({});
    const [savingDisabledBehavior, setSavingDisabledBehavior] = useState(false);
    const [showDisabledBehaviorPopup, setShowDisabledBehaviorPopup] = useState(false);

    useEffect(() => {
        const id = window.setTimeout(() => {
            setFilters((prev) =>
                prev.search === searchDraft ? prev : { ...prev, search: searchDraft, page: 1 }
            );
        }, 280);
        return () => window.clearTimeout(id);
    }, [searchDraft]);

    const listQuery = useMemo(() => buildOrgListQuery(filters), [filters]);
    const { data: catalogRes } = useFetch('/org-management/beta-feature-catalog');
    const features = useMemo(() => {
        const fromApi = catalogRes?.data?.features;
        if (Array.isArray(fromApi) && fromApi.length) return fromApi;
        return ORG_BETA_FEATURE_KEYS.map((key) => ({
            key,
            label: ORG_BETA_FEATURE_CATALOG[key]?.label || key,
            description: ORG_BETA_FEATURE_CATALOG[key]?.description || ''
        }));
    }, [catalogRes]);

    const { data: orgs, loading, error, refetch } = useFetch(
        `/org-management/organizations?${listQuery}`
    );
    const { data: configRes, refetch: refetchConfig } = useFetch('/org-management/config');
    const disabledMenuBehaviorByKey = useMemo(() => {
        const fromConfig = configRes?.data?.betaFeatures?.disabledMenuBehaviorByKey || {};
        return ORG_BETA_FEATURE_KEYS.reduce((acc, key) => {
            const mode = fromConfig[key];
            acc[key] =
                mode === ORG_BETA_DISABLED_MENU_BEHAVIOR_HIDE
                    ? ORG_BETA_DISABLED_MENU_BEHAVIOR_HIDE
                    : ORG_BETA_DISABLED_MENU_BEHAVIOR_COMING_SOON;
            return acc;
        }, {});
    }, [configRes]);

    const pagination = orgs?.pagination;
    const totalItems = pagination?.total ?? 0;
    const pageSize = pagination?.limit ?? PAGE_SIZE;
    const totalPages =
        pagination?.totalPages ?? Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(Math.max(1, filters.page), totalPages);
    const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const rangeEnd = totalItems === 0 ? 0 : Math.min(currentPage * pageSize, totalItems);

    useEffect(() => {
        if (pagination?.totalPages == null) return;
        const tp = pagination.totalPages;
        setFilters((f) => (f.page > tp ? { ...f, page: tp } : f));
    }, [pagination?.totalPages]);

    const patchOrgBetaFeatures = useCallback(
        async (orgId, enabledKeys) => {
            setSavingByOrgId((m) => ({ ...m, [orgId]: true }));
            try {
                const res = await apiRequest(
                    `/org-management/organizations/${orgId}/beta-features`,
                    { enabledKeys },
                    { method: 'PATCH' }
                );
                if (res.success) {
                    addNotification({
                        title: 'Saved',
                        message: 'Beta features updated for this organization.',
                        type: 'success'
                    });
                    refetch();
                } else {
                    addNotification({
                        title: 'Error',
                        message: res.message || 'Could not update beta features.',
                        type: 'error'
                    });
                }
            } catch (e) {
                addNotification({
                    title: 'Error',
                    message: e.message || 'Could not update beta features.',
                    type: 'error'
                });
            } finally {
                setSavingByOrgId((m) => {
                    const next = { ...m };
                    delete next[orgId];
                    return next;
                });
            }
        },
        [addNotification, refetch]
    );

    const handleToggle = useCallback(
        (org, featureKey, nextEnabled) => {
            const current = Array.isArray(org.betaFeatureKeys) ? [...org.betaFeatureKeys] : [];
            let nextKeys;
            if (nextEnabled) {
                nextKeys = [...new Set([...current, featureKey])];
            } else {
                nextKeys = current.filter((k) => k !== featureKey);
            }
            nextKeys = nextKeys.filter((k) => ORG_BETA_FEATURE_KEYS.includes(k));
            patchOrgBetaFeatures(org._id, nextKeys);
        },
        [patchOrgBetaFeatures]
    );

    const updateDisabledBehavior = useCallback(
        async (featureKey, nextMode) => {
            setSavingDisabledBehavior(true);
            try {
                const nextMap = {
                    ...disabledMenuBehaviorByKey,
                    [featureKey]: nextMode
                };
                const res = await apiRequest(
                    '/org-management/config',
                    { betaFeatures: { disabledMenuBehaviorByKey: nextMap } },
                    { method: 'PUT' }
                );
                if (res?.success) {
                    addNotification({
                        title: 'Saved',
                        message: 'Disabled beta menu behavior updated.',
                        type: 'success'
                    });
                    refetchConfig();
                } else {
                    addNotification({
                        title: 'Error',
                        message: res?.message || 'Could not save disabled menu behavior.',
                        type: 'error'
                    });
                }
            } catch (e) {
                addNotification({
                    title: 'Error',
                    message: e?.message || 'Could not save disabled menu behavior.',
                    type: 'error'
                });
            } finally {
                setSavingDisabledBehavior(false);
            }
        },
        [addNotification, disabledMenuBehaviorByKey, refetchConfig]
    );

    const isInitialLoad = loading && orgs == null;

    if (isInitialLoad) {
        return (
            <div className="org-beta-features">
                <div className="org-beta-features__loading">Loading…</div>
            </div>
        );
    }

    if (error && orgs == null) {
        return (
            <div className="org-beta-features">
                <div className="org-beta-features__error" role="alert">
                    {error}
                </div>
            </div>
        );
    }

    return (
        <div className="org-beta-features dash">
            <header className="header">
                <h1>Beta features</h1>
                <p>Grant per-organization access to features that are still in beta.</p>
                <img src={AdminGrad || AtlasMain} alt="" />
            </header>

            <div className="content">
                <div className="org-beta-features__toolbar">
                    <label className="org-beta-features__search">
                        <Icon icon="mdi:magnify" aria-hidden />
                        <input
                            type="search"
                            placeholder="Search organizations…"
                            value={searchDraft}
                            onChange={(e) => setSearchDraft(e.target.value)}
                            autoComplete="off"
                        />
                    </label>
                    <div className="org-beta-features__filter">
                        <select
                            value={filters.verified}
                            onChange={(e) =>
                                setFilters((f) => ({ ...f, verified: e.target.value, page: 1 }))
                            }
                        >
                            <option value="">All organizations</option>
                            <option value="true">Verified only</option>
                            <option value="false">Unverified only</option>
                        </select>
                    </div>
                    <button
                        type="button"
                        className="org-beta-features__config-btn"
                        onClick={() => setShowDisabledBehaviorPopup(true)}
                    >
                        <Icon icon="mdi:tune-variant" aria-hidden />
                        Configure disabled behavior
                    </button>
                </div>

                {error && orgs != null && (
                    <div className="org-beta-features__inline-error" role="alert">
                        Could not refresh: {error}
                    </div>
                )}

                {pagination && totalItems > 0 && (
                    <p className="org-beta-features__meta">
                        {totalItems} organization{totalItems === 1 ? '' : 's'}
                        {filters.search ? ` matching “${filters.search}”` : ''}
                    </p>
                )}

                <div className={`org-beta-features__table-wrap${loading ? ' org-beta-features__table-wrap--dim' : ''}`}>
                    <table className="org-beta-features__table">
                        <thead>
                            <tr>
                                <th scope="col">Organization</th>
                                {features.map((f) => (
                                    <th key={f.key} scope="col" className="org-beta-features__th-feature">
                                        <span className="org-beta-features__th-title">{f.label}</span>
                                        <span className="org-beta-features__th-badge">Beta</span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {!orgs?.data?.length ? (
                                <tr>
                                    <td colSpan={1 + features.length} className="org-beta-features__empty">
                                        No organizations match your filters.
                                    </td>
                                </tr>
                            ) : (
                                orgs.data.map((org) => (
                                    <tr key={org._id}>
                                        <td>
                                            <div className="org-beta-features__org-cell">
                                                <img
                                                    src={org.org_profile_image || '/Logo.svg'}
                                                    alt=""
                                                    className="org-beta-features__org-avatar"
                                                />
                                                <div>
                                                    <div className="org-beta-features__org-name">
                                                        {org.org_name}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        {features.map((f) => {
                                            const enabled =
                                                Array.isArray(org.betaFeatureKeys) &&
                                                org.betaFeatureKeys.includes(f.key);
                                            const busy = savingByOrgId[org._id];
                                            const inputId = `beta-${org._id}-${f.key}`;
                                            return (
                                                <td key={f.key} className="org-beta-features__td-toggle">
                                                    <input
                                                        id={inputId}
                                                        type="checkbox"
                                                        className="org-beta-features__checkbox"
                                                        checked={enabled}
                                                        disabled={busy}
                                                        onChange={(e) =>
                                                            handleToggle(org, f.key, e.target.checked)
                                                        }
                                                        aria-label={`${f.label} for ${org.org_name}`}
                                                    />
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {pagination && totalItems > 0 && (
                    <div className="org-beta-features__pagination">
                        <span>
                            Showing {rangeStart}–{rangeEnd} of {totalItems}
                        </span>
                        <div className="org-beta-features__pagination-btns">
                            <button
                                type="button"
                                disabled={currentPage <= 1 || loading}
                                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                            >
                                Previous
                            </button>
                            <button
                                type="button"
                                disabled={currentPage >= totalPages || loading}
                                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <Popup
                isOpen={showDisabledBehaviorPopup}
                onClose={() => setShowDisabledBehaviorPopup(false)}
                customClassName="org-beta-features__config-popup"
            >
                <section
                    className="org-beta-features__disabled-config"
                    aria-label="Disabled beta menu behavior"
                >
                    <h2>Disabled menu behavior</h2>
                    <p>
                        Choose what users see when a beta feature is disabled for an organization.
                    </p>
                    <div className="org-beta-features__disabled-grid">
                        {features.map((feature) => (
                            <label
                                key={`disabled-mode-${feature.key}`}
                                className="org-beta-features__disabled-item"
                            >
                                <span>{feature.label}</span>
                                <select
                                    value={
                                        disabledMenuBehaviorByKey[feature.key] ||
                                        ORG_BETA_DISABLED_MENU_BEHAVIOR_COMING_SOON
                                    }
                                    onChange={(e) => updateDisabledBehavior(feature.key, e.target.value)}
                                    disabled={savingDisabledBehavior}
                                >
                                    <option value={ORG_BETA_DISABLED_MENU_BEHAVIOR_COMING_SOON}>
                                        Show "Soon" item
                                    </option>
                                    <option value={ORG_BETA_DISABLED_MENU_BEHAVIOR_HIDE}>
                                        Hide item
                                    </option>
                                </select>
                            </label>
                        ))}
                    </div>
                </section>
            </Popup>

        </div>
    );
}

export default OrgBetaFeatures;
