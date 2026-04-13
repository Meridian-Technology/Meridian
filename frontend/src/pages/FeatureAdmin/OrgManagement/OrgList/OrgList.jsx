import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../../../../hooks/useFetch';
import { useGradient } from '../../../../hooks/useGradient';
import { Icon } from '@iconify-icon/react';
import OrgManageModal from './OrgManageModal';
import './OrgList.scss';

const ORG_LIST_PAGE_SIZE = 20;

function buildOrgListQuery(filters) {
    const p = new URLSearchParams();
    if (filters.search) p.set('search', filters.search);
    if (filters.verified === 'true' || filters.verified === 'false') {
        p.set('verified', filters.verified);
    }
    p.set('page', String(filters.page));
    p.set('limit', String(ORG_LIST_PAGE_SIZE));
    return p.toString();
}

function OrgList() {
    const navigate = useNavigate();
    const [manageOrgId, setManageOrgId] = useState(null);
    const [searchDraft, setSearchDraft] = useState('');
    const [filters, setFilters] = useState({
        search: '',
        verified: '',
        page: 1
    });
    const { AtlasMain } = useGradient();

    useEffect(() => {
        const id = window.setTimeout(() => {
            setFilters((prev) =>
                prev.search === searchDraft
                    ? prev
                    : { ...prev, search: searchDraft, page: 1 }
            );
        }, 280);
        return () => window.clearTimeout(id);
    }, [searchDraft]);

    const listQuery = useMemo(() => buildOrgListQuery(filters), [filters]);

    const { data: orgs, loading, error, refetch } = useFetch(
        `/org-management/organizations?${listQuery}`
    );

    const isInitialLoad = loading && orgs == null;

    const pagination = orgs?.pagination;
    const totalItems = pagination?.total ?? 0;
    const pageSize = pagination?.limit ?? ORG_LIST_PAGE_SIZE;
    const totalPages = pagination?.totalPages
        ?? Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(Math.max(1, filters.page), totalPages);

    const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const rangeEnd = totalItems === 0 ? 0 : Math.min(currentPage * pageSize, totalItems);

    useEffect(() => {
        if (pagination?.totalPages == null) return;
        const tp = pagination.totalPages;
        setFilters((f) => (f.page > tp ? { ...f, page: tp } : f));
    }, [pagination?.totalPages]);

    const handleExport = async (format = 'json') => {
        try {
            const response = await fetch(`/org-management/organizations/export?format=${format}`, {
                credentials: 'include'
            });
            
            if (format === 'csv') {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `organizations.${format}`;
                a.click();
                window.URL.revokeObjectURL(url);
            } else {
                const data = await response.json();
                const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `organizations.${format}`;
                a.click();
                window.URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Error exporting data:', error);
        }
    };

    const formatDate = (value) => {
        if (value == null || value === '') return '—';
        const d = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    if (isInitialLoad) {
        return (
            <div className="org-list">
                <div className="loading">Loading organizations...</div>
            </div>
        );
    }

    if (error && orgs == null) {
        return (
            <div className="org-list">
                <div className="error">Error loading organizations: {error}</div>
            </div>
        );
    }

    return (
        <div className="org-list dash">
            <header className="header">
                <h1>Organizations</h1>
                <p>Manage and monitor all student organizations</p>
                <img src={AtlasMain} alt="Organizations Grad" />
            </header>

            <div className="content">
                {/* Filters and Actions */}
                <div className={`toolbar${loading ? ' toolbar--refreshing' : ''}`}>
                    <div className="org-filters">
                        <div className="search-box">
                            <Icon icon="mdi:magnify" />
                            <input
                                type="search"
                                placeholder="Search by name or description..."
                                value={searchDraft}
                                onChange={(e) => setSearchDraft(e.target.value)}
                                autoComplete="off"
                            />
                        </div>

                        <select
                            value={filters.verified}
                            onChange={(e) =>
                                setFilters((f) => ({ ...f, verified: e.target.value, page: 1 }))
                            }
                        >
                            <option value="">All Organizations</option>
                            <option value="true">Verified Only</option>
                            <option value="false">Unverified Only</option>
                        </select>
                    </div>

                    <div className="actions">
                        <button className="export-btn" onClick={() => handleExport('csv')}>
                            <Icon icon="mdi:download" />
                            Export CSV
                        </button>
                        <button className="export-btn" onClick={() => handleExport('json')}>
                            <Icon icon="mdi:download" />
                            Export JSON
                        </button>
                    </div>
                </div>

                {error && orgs != null && (
                    <div className="inline-error" role="alert">
                        Could not refresh the list: {error}
                    </div>
                )}

                {pagination && totalItems > 0 && (
                    <p className="list-meta">
                        {totalItems} organization
                        {totalItems === 1 ? '' : 's'}
                        {filters.search ? ` matching “${filters.search}”` : ''}
                    </p>
                )}

                {/* Organizations List */}
                <div className={`orgs-grid${loading ? ' orgs-grid--dimmed' : ''}`}>
                    {orgs?.data?.length === 0 ? (
                        <div className="empty-state">
                            <Icon icon="mdi:account-group" />
                            <h3>No organizations found</h3>
                            <p>There are no organizations matching your current filters.</p>
                        </div>
                    ) : (
                        orgs?.data?.map((org) => (
                            <div key={org._id} className="org-card">
                                <div className="org-header">
                                    <img 
                                        src={org.org_profile_image || '/Logo.svg'} 
                                        alt={org.org_name}
                                        className="org-avatar"
                                    />
                                    <div className="org-info">
                                        <h3>{org.org_name}</h3>
                                        <p>{org.org_description}</p>
                                    </div>
                                    <div className="org-status">
                                        {org.verified && (
                                            <span className="verified-badge">
                                                <Icon icon="mdi:shield-check" />
                                                {org.verificationType ? org.verificationType.charAt(0).toUpperCase() + org.verificationType.slice(1) : 'Verified'}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="org-stats">
                                    <div className="stat">
                                        <Icon icon="mdi:account-multiple" />
                                        <span>{org.memberCount || 0} members</span>
                                    </div>
                                    <div className="stat">
                                        <Icon icon="mdi:calendar" />
                                        <span>{org.recentEventCount || 0} events this month</span>
                                    </div>
                                </div>

                                <div className="org-meta">
                                    <div className="meta-item">
                                        <span className="label">Created:</span>
                                        <span className="value">{formatDate(org.createdAt)}</span>
                                    </div>
                                    {org.verified && (
                                        <div className="meta-item">
                                            <span className="label">Verified:</span>
                                            <span className="value">{formatDate(org.verifiedAt)}</span>
                                        </div>
                                    )}
                                    {org.verificationType && org.verificationType !== 'basic' && (
                                        <div className="meta-item">
                                            <span className="label">Type:</span>
                                            <span className="value">{org.verificationType.charAt(0).toUpperCase() + org.verificationType.slice(1)}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="org-actions">
                                    <button
                                        className="action-btn view"
                                        onClick={() => setManageOrgId(org._id)}
                                    >
                                        <Icon icon="mdi:cog" />
                                        Manage
                                    </button>
                                    <button
                                        className="action-btn edit"
                                        onClick={() => navigate(`/club-dashboard/${encodeURIComponent(org.org_name)}?adminView=true`)}
                                    >
                                        <Icon icon="mdi:eye" />
                                        View as Admin
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Pagination */}
                {pagination && totalItems > 0 && (
                    <div className="pagination">
                        <span className="page-range">
                            Showing {rangeStart}–{rangeEnd} of {totalItems}
                        </span>
                        <div className="pagination-controls">
                            <button
                                type="button"
                                className="page-btn"
                                disabled={currentPage <= 1 || loading}
                                onClick={() =>
                                    setFilters((f) => ({ ...f, page: Math.max(1, currentPage - 1) }))
                                }
                            >
                                Previous
                            </button>
                            <span className="page-info">
                                Page {currentPage} of {totalPages}
                            </span>
                            <button
                                type="button"
                                className="page-btn"
                                disabled={currentPage >= totalPages || loading}
                                onClick={() =>
                                    setFilters((f) => ({
                                        ...f,
                                        page: Math.min(totalPages, currentPage + 1)
                                    }))
                                }
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <OrgManageModal
                orgId={manageOrgId}
                isOpen={!!manageOrgId}
                onClose={() => setManageOrgId(null)}
                onSuccess={() => refetch()}
            />
        </div>
    );
}

export default OrgList;
