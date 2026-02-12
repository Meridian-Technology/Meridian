import React, { useState, useMemo } from 'react';
import './Orgs.scss';
import { useFetch } from '../../../hooks/useFetch';
import OrgResult from './OrgResult/OrgResult';
import AtlasGradient from '../../../assets/Gradients/ATLAS/Main1.png';
import { Icon } from '@iconify-icon/react';

const Orgs = () => {
    const { data, loading, error } = useFetch('/get-orgs?exhaustive=true');
    const [searchQuery, setSearchQuery] = useState('');

    const orgs = data?.orgs || [];
    const filteredOrgs = useMemo(() => {
        if (!searchQuery.trim()) return orgs;
        const q = searchQuery.toLowerCase().trim();
        return orgs.filter(
            (org) =>
                org.org_name?.toLowerCase().includes(q) ||
                org.org_description?.toLowerCase().includes(q)
        );
    }, [orgs, searchQuery]);

    return (
        <div className="orgs dash">
            <header className="header">
                <img src={AtlasGradient} alt="" />
                <h1>Organizations</h1>
                <p>Explore organizations at RPI</p>
            </header>

            <div className="orgs__content">
                <div className="orgs__search">
                    <Icon icon="mdi:magnify" className="orgs__search-icon" />
                    <input
                        type="text"
                        placeholder="Search organizations..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="orgs__search-input"
                    />
                </div>

                {loading ? (
                    <div className="orgs__loading">Loading organizations...</div>
                ) : error ? (
                    <div className="orgs__error">Error loading organizations: {error}</div>
                ) : filteredOrgs.length === 0 ? (
                    <div className="orgs__empty">
                        <Icon icon="mdi:account-group-outline" />
                        <h3>No organizations found</h3>
                        <p>
                            {searchQuery
                                ? 'Try adjusting your search.'
                                : 'There are no organizations to display yet.'}
                        </p>
                    </div>
                ) : (
                    <div className="orgs__grid">
                        {filteredOrgs.map((org) => (
                            <OrgResult key={org._id || org.org_name} org={org} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Orgs;
