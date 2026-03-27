import React, { useMemo, useState } from 'react';
import { authenticatedRequest, useFetch } from '../../../hooks/useFetch';
import './ClubInventory.scss';

export default function ClubInventory({ orgId }) {
    const inventoryResponse = useFetch(`/org-inventory/${orgId}`);
    const inventories = useMemo(() => inventoryResponse?.data?.data || [], [inventoryResponse?.data]);
    const [selectedInventoryId, setSelectedInventoryId] = useState(null);
    const [actionMessage, setActionMessage] = useState('');
    const itemsResponse = useFetch(
        selectedInventoryId ? `/org-inventory/${orgId}/${selectedInventoryId}/items` : null
    );
    const items = useMemo(() => itemsResponse?.data?.data || [], [itemsResponse?.data]);

    const runInventoryAction = async (itemId, action, payload = {}) => {
        const response = await authenticatedRequest(
            `/org-inventory/${orgId}/${selectedInventoryId}/items/${itemId}/${action}`,
            {
                method: 'PATCH',
                data: payload
            }
        );
        if (response.error) {
            setActionMessage(response.error);
            return;
        }
        setActionMessage(`${action} completed.`);
        itemsResponse.refetch({ silent: true });
    };

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
                    <article
                        className={`club-inventory__card ${selectedInventoryId === inventory._id ? 'club-inventory__card--selected' : ''}`}
                        key={inventory._id}
                        onClick={() => setSelectedInventoryId(inventory._id)}
                    >
                        <div className="club-inventory__card-title">{inventory.name}</div>
                        <p className="club-inventory__card-description">{inventory.description || 'No description provided.'}</p>
                    </article>
                ))}
            </div>
            {selectedInventoryId && (
                <section className="club-inventory__items">
                    <h3>Item lifecycle</h3>
                    {items.length === 0 && <div className="club-inventory__empty">No items in this collection.</div>}
                    <div className="club-inventory__items-grid">
                        {items.map((item) => (
                            <article className="club-inventory__item-card" key={item._id}>
                                <div className="club-inventory__item-header">
                                    <strong>{item.name}</strong>
                                    <span>{item.lifecycleStatus || 'active'}</span>
                                </div>
                                <p>{item.description || 'No description provided.'}</p>
                                <div className="club-inventory__item-meta">
                                    <span>Qty: {item.quantity}</span>
                                    <span>Checked out: {item.checkedOutQuantity || 0}</span>
                                    <span>Condition: {item.condition}</span>
                                </div>
                                <div className="club-inventory__item-actions">
                                    <button type="button" onClick={() => runInventoryAction(item._id, 'checkout', { quantity: 1, notes: 'ClubDash checkout' })}>Checkout</button>
                                    <button type="button" onClick={() => runInventoryAction(item._id, 'checkin', { quantity: 1, condition: 'good', notes: 'ClubDash checkin' })}>Checkin</button>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const response = await authenticatedRequest(
                                                `/org-inventory/${orgId}/${selectedInventoryId}/items/${item._id}/maintenance-events`,
                                                {
                                                    method: 'POST',
                                                    data: {
                                                        type: 'maintenance',
                                                        severity: 'medium',
                                                        status: 'open',
                                                        notes: 'Reported from ClubDash'
                                                    }
                                                }
                                            );
                                            if (response.error) {
                                                setActionMessage(response.error);
                                                return;
                                            }
                                            setActionMessage('Maintenance event logged.');
                                            itemsResponse.refetch({ silent: true });
                                        }}
                                    >
                                        Log maintenance
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                    {actionMessage && <p className="club-inventory__message">{actionMessage}</p>}
                </section>
            )}
        </div>
    );
}
