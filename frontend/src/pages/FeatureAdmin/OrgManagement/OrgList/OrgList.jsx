import React, { useState, useEffect } from 'react';
import { useFetch } from '../../../../hooks/useFetch';
import { useGradient } from '../../../../hooks/useGradient';
import apiRequest from '../../../../utils/postRequest';
import { Icon } from '@iconify-icon/react';
import './OrgList.scss';

function OrgList() {
    const [filters, setFilters] = useState({
        search: '',
        verified: '',
        page: 1
    });
    const { AtlasMain } = useGradient();

    const { data: orgs, loading, error, refetch } = useFetch(
        `/org-management/organizations?${new URLSearchParams(filters).toString()}`
    );

    useEffect(()=>{
        console.log(filters);
    }, [filters])

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

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    if (loading) {
        return (
            <div className="org-list">
                <div className="loading">Loading organizations...</div>
            </div>
        );
    }

    if (error) {
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
                <div className="toolbar">
                    <div className="org-filters">
                        <div className="search-box">
                            <Icon icon="mdi:magnify" />
                            <input
                                type="text"
                                placeholder="Search organizations..."
                                value={filters.search}
                                onChange={(e) => setFilters({...filters, search: e.target.value, page: 1})}
                            />
                        </div>

                        <select
                            value={filters.verified}
                            onChange={(e) => setFilters({...filters, verified: e.target.value, page: 1})}
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

                {/* Organizations List */}
                <div className="orgs-grid">
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
                                    <button className="action-btn view">
                                        <Icon icon="mdi:eye" />
                                        View Details
                                    </button>
                                    <button className="action-btn edit">
                                        <Icon icon="mdi:pencil" />
                                        Edit
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Pagination */}
                {orgs?.pagination && orgs.pagination.totalPages > 1 && (
                    <div className="pagination">
                        <button 
                            className="page-btn"
                            disabled={filters.page <= 1}
                            onClick={() => setFilters({...filters, page: filters.page - 1})}
                        >
                            Previous
                        </button>
                        <span className="page-info">
                            Page {filters.page} of {orgs.pagination.totalPages}
                        </span>
                        <button 
                            className="page-btn"
                            disabled={filters.page >= orgs.pagination.totalPages}
                            onClick={() => setFilters({...filters, page: filters.page + 1})}
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default OrgList;
