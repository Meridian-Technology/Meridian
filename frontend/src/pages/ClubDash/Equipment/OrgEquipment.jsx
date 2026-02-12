import React, { useEffect, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import apiRequest from '../../../utils/postRequest';
import Popup from '../../../components/Popup/Popup';
import { useGradient } from '../../../hooks/useGradient';
import './OrgEquipment.scss';

function OrgEquipment({ expandedClass, org }) {
    const { addNotification } = useNotification();
    const { AtlasMain } = useGradient();
    const [equipment, setEquipment] = useState([]);
    const [editingItem, setEditingItem] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [formData, setFormData] = useState({
        name: '',
        quantity: 1,
        storageLocation: '',
        managedByRole: ''
    });
    const roleOptions = (org?.positions || []).filter(role =>
        role?.permissions?.includes('manage_equipment') || role?.permissions?.includes('all')
    );
    const roleNameMap = (org?.positions || []).reduce((acc, role) => {
        acc[role.name] = role.displayName || role.name;
        return acc;
    }, {});

    const { data, loading, refetch } = useFetch(
        org?._id ? `/org-event-management/${org._id}/equipment` : null
    );

    useEffect(() => {
        if (data?.success) {
            setEquipment(data.data.equipment || []);
            setSelectedIds([]);
        }
    }, [data]);

    useEffect(() => {
        if (editingItem) {
            setFormData({
                name: editingItem.name || '',
                quantity: editingItem.quantity || 1,
                storageLocation: editingItem.storageLocation || '',
                managedByRole: editingItem.managedByRole || ''
            });
        }
    }, [editingItem]);

    const handleOpenNew = () => {
        setEditingItem({ isNew: true });
        setFormData({
            name: '',
            quantity: 1,
            storageLocation: '',
            managedByRole: ''
        });
    };

    const handleSave = async () => {
        if (!org?._id) return;

        try {
            const isEditing = Boolean(editingItem?._id);
            const endpoint = isEditing
                ? `/org-event-management/${org._id}/equipment/${editingItem._id}`
                : `/org-event-management/${org._id}/equipment`;
            const method = isEditing ? 'PUT' : 'POST';

            const response = await apiRequest(
                endpoint,
                {
                    name: formData.name,
                    quantity: isEditing ? 1 : formData.quantity,
                    storageLocation: formData.storageLocation || null,
                    managedByRole: formData.managedByRole || null
                },
                { method }
            );

            if (!response.success) {
                throw new Error(response.message || 'Failed to save equipment');
            }

            setEditingItem(null);
            if (refetch) refetch();
            addNotification({
                title: 'Success',
                message: `Equipment ${isEditing ? 'updated' : 'added'} successfully`,
                type: 'success'
            });
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to save equipment',
                type: 'error'
            });
        }
    };

    const allEquipmentIds = equipment.map(item => item._id);
    const isAllSelected = allEquipmentIds.length > 0 && selectedIds.length === allEquipmentIds.length;

    const handleToggleSelect = (equipmentId) => {
        setSelectedIds(prev => (
            prev.includes(equipmentId)
                ? prev.filter(id => id !== equipmentId)
                : [...prev, equipmentId]
        ));
    };

    const handleToggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedIds([]);
        } else {
            setSelectedIds(allEquipmentIds);
        }
    };

    const handleDeleteEquipment = async (equipmentId) => {
        if (!org?._id) return;
        if (!window.confirm('Delete this equipment item?')) return;

        try {
            const response = await apiRequest(
                `/org-event-management/${org._id}/equipment/${equipmentId}`,
                {},
                { method: 'DELETE' }
            );

            if (!response.success) {
                throw new Error(response.message || 'Failed to delete equipment');
            }

            if (refetch) refetch();
            addNotification({
                title: 'Success',
                message: 'Equipment deleted successfully',
                type: 'success'
            });
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to delete equipment',
                type: 'error'
            });
        }
    };

    const handleBatchDelete = async () => {
        if (selectedIds.length === 0 || !org?._id) return;
        if (!window.confirm(`Delete ${selectedIds.length} selected item(s)?`)) return;

        try {
            for (const equipmentId of selectedIds) {
                await apiRequest(
                    `/org-event-management/${org._id}/equipment/${equipmentId}`,
                    {},
                    { method: 'DELETE' }
                );
            }
            if (refetch) refetch();
            addNotification({
                title: 'Success',
                message: 'Selected equipment deleted',
                type: 'success'
            });
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to delete equipment',
                type: 'error'
            });
        }
    };

    const handleBatchDuplicate = async () => {
        if (selectedIds.length === 0 || !org?._id) return;

        try {
            const selectedItems = equipment.filter(item => selectedIds.includes(item._id));
            for (const item of selectedItems) {
                await apiRequest(
                    `/org-event-management/${org._id}/equipment`,
                    {
                        name: `${item.name} Copy`,
                        quantity: item.quantity,
                        storageLocation: item.storageLocation || null,
                        managedByRole: item.managedByRole || null
                    },
                    { method: 'POST' }
                );
            }

            if (refetch) refetch();
            addNotification({
                title: 'Success',
                message: 'Selected equipment duplicated',
                type: 'success'
            });
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to duplicate equipment',
                type: 'error'
            });
        }
    };

    if (loading) {
        return (
            <div className={`dash ${expandedClass}`}>
                <div className="org-equipment loading">
                    <div className="loader">Loading equipment...</div>
                </div>
            </div>
        );
    }

    return (
        <div className={`dash ${expandedClass}`}>
            <div className="org-equipment">
                <header className="header">
                    <h1>Equipment</h1>
                    <p>Manage your organization inventory</p>
                    <img src={AtlasMain} alt="" />
                </header>

                <div className="equipment-content">
                    <div className="equipment-toolbar">
                        <button className="btn-primary" onClick={handleOpenNew}>
                            <Icon icon="mdi:plus" />
                            Add Equipment
                        </button>
                        <div className="equipment-toolbar-actions">
                            <button
                                className="btn-secondary"
                                onClick={handleToggleSelectAll}
                                disabled={equipment.length === 0}
                            >
                                {isAllSelected ? 'Deselect All' : 'Select All'}
                            </button>
                            <button
                                className="btn-secondary"
                                onClick={handleBatchDuplicate}
                                disabled={selectedIds.length === 0}
                            >
                                Duplicate
                            </button>
                            <button
                                className="btn-danger"
                                onClick={handleBatchDelete}
                                disabled={selectedIds.length === 0}
                            >
                                Delete
                            </button>
                        </div>
                    </div>

                    {equipment.length === 0 ? (
                        <div className="empty-state">
                            <Icon icon="mdi:package-variant-closed" />
                            <h3>No equipment yet</h3>
                            <p>Add inventory items to make them available for event checkout.</p>
                        </div>
                    ) : (
                        <div className="equipment-list">
                            {equipment.map(item => (
                                <div key={item._id} className="equipment-card">
                                    <div className="equipment-card-content">
                                        <div className="equipment-selection">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(item._id)}
                                                onChange={() => handleToggleSelect(item._id)}
                                            />
                                        </div>
                                        <div className="equipment-info">
                                            <h4>{item.name}</h4>
                                            <div className="equipment-meta">
                                                {item.id && <span>ID: {item.id}</span>}
                                                {item.storageLocation && <span>Storage: {item.storageLocation}</span>}
                                                {item.managedByRole && (
                                                    <span>Managed by: {roleNameMap[item.managedByRole] || item.managedByRole}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                        <div className="equipment-actions">
                                            <button
                                                className="action-btn edit"
                                                onClick={() => setEditingItem(item)}
                                                title="Edit Equipment"
                                            >
                                                <Icon icon="mdi:pencil" />
                                            </button>
                                            <button
                                                className="action-btn delete"
                                                onClick={() => handleDeleteEquipment(item._id)}
                                                title="Delete Equipment"
                                            >
                                                <Icon icon="mdi:delete" />
                                            </button>
                                        </div>
                                    </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {editingItem && (
                <Popup isOpen={true} onClose={() => setEditingItem(null)} customClassName="equipment-editor-popup">
                    <div className="equipment-editor">
                        <div className="editor-header">
                            <h3>
                                <Icon icon="mdi:package-variant" />
                                {editingItem._id ? 'Edit' : 'Add'} Equipment
                            </h3>
                            <button className="close-btn" onClick={() => setEditingItem(null)}>
                                <Icon icon="mdi:close" />
                            </button>
                        </div>

                        <div className="editor-form">
                            <div className="form-group">
                                <label>Item Name *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    required
                                />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Storage Location</label>
                                    <input
                                        type="text"
                                        value={formData.storageLocation}
                                        onChange={(e) => setFormData(prev => ({ ...prev, storageLocation: e.target.value }))}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Managed by</label>
                                    <select
                                        value={formData.managedByRole || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, managedByRole: e.target.value }))}
                                    >
                                        <option value="">Unassigned</option>
                                        {roleOptions.map(role => (
                                            <option key={role.name} value={role.name}>
                                                {role.displayName || role.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Quantity</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={formData.quantity}
                                        onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value, 10) || 1 }))}
                                        disabled={Boolean(editingItem?._id)}
                                    />
                                </div>
                            </div>
                            <div className="form-actions">
                                <button className="btn-cancel" onClick={() => setEditingItem(null)}>
                                    Cancel
                                </button>
                                <button className="btn-save" onClick={handleSave} disabled={!formData.name.trim()}>
                                    <Icon icon="mdi:check" />
                                    Save Equipment
                                </button>
                            </div>
                        </div>
                    </div>
                </Popup>
            )}
        </div>
    );
}

export default OrgEquipment;
