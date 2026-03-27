import React, { useMemo } from 'react';
import { useFetch } from '../../../hooks/useFetch';
import './ClubInventory.scss';

export default function ClubInventory({ orgId }) {
    const inventoryResponse = useFetch(`/org-inventory/${orgId}`);
    const inventories = useMemo(() => inventoryResponse?.data?.data || [], [inventoryResponse?.data]);

    if (inventoryResponse.loading) {
        return <div className="club-inventory"><div className="club-inventory__loading">Loading inventory...</div></div>;
    }

    return (
        <div className="club-inventory">
            <div className="club-inventory__header">
                <h2 className="club-inventory__title">Inventory</h2>
                <p className="club-inventory__subtitle">Track assets, checkouts, and conditions by organization.</p>
            </div>
            <div className="club-inventory__grid">
                {inventories.length === 0 && <div className="club-inventory__empty">No inventory collections yet.</div>}
                {inventories.map((inventory) => (
                    <article className="club-inventory__card" key={inventory._id}>
                        <div className="club-inventory__card-title">{inventory.name}</div>
                        <p className="club-inventory__card-description">{inventory.description || 'No description provided.'}</p>
                    </article>
                ))}
            </div>
        </div>
    );
}
