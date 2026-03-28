import React, { useMemo, useState } from 'react';
import { authenticatedRequest, useFetch } from '../../../../hooks/useFetch';
import './AdminBudgetPermissions.scss';

export default function AdminBudgetPermissions() {
    const adminsResponse = useFetch('/admin/platform-admins');
    const catalogResponse = useFetch('/admin/permission-catalog');
    const admins = useMemo(() => adminsResponse?.data?.data || [], [adminsResponse?.data]);
    const catalog = useMemo(() => catalogResponse?.data?.data?.permissions || [], [catalogResponse?.data]);
    const [selectedAdminId, setSelectedAdminId] = useState('');
    const [status, setStatus] = useState('');
    const [tenantKey, setTenantKey] = useState('rpi');
    const [selectedPermissions, setSelectedPermissions] = useState([]);

    const selectedAdmin = useMemo(
        () => admins.find((admin) => String(admin.globalUserId) === String(selectedAdminId)) || null,
        [admins, selectedAdminId]
    );

    const loadPermissions = async (adminId) => {
        if (!adminId) return;
        const response = await authenticatedRequest(`/admin/platform-admins/${adminId}/permissions?tenantKey=${tenantKey}`);
        if (response.error) {
            setStatus(response.error);
            return;
        }
        setSelectedPermissions(response.data?.data?.permissions || []);
    };

    const togglePermission = (permission) => {
        setSelectedPermissions((current) => (
            current.includes(permission)
                ? current.filter((value) => value !== permission)
                : [...current, permission]
        ));
    };

    const savePermissions = async () => {
        if (!selectedAdminId) return;
        const response = await authenticatedRequest(`/admin/platform-admins/${selectedAdminId}/permissions`, {
            method: 'PUT',
            data: {
                tenantKey,
                permissions: selectedPermissions
            }
        });
        if (response.error) {
            setStatus(response.error);
            return;
        }
        setStatus('Admin permissions updated.');
    };

    return (
        <section className="atlas-admin-budget-permissions">
            <header className="atlas-admin-budget-permissions__header">
                <h2>Budget Admin Permissions</h2>
                <p>Assign budget reviewer and approval authority to admin-level users by tenant.</p>
            </header>

            <div className="atlas-admin-budget-permissions__toolbar">
                <label>
                    Tenant
                    <input
                        type="text"
                        value={tenantKey}
                        onChange={(event) => setTenantKey(event.target.value.toLowerCase())}
                    />
                </label>
                <label>
                    Admin user
                    <select
                        value={selectedAdminId}
                        onChange={(event) => {
                            const nextId = event.target.value;
                            setSelectedAdminId(nextId);
                            setStatus('');
                            setSelectedPermissions([]);
                            if (nextId) {
                                loadPermissions(nextId);
                            }
                        }}
                    >
                        <option value="">Select admin user</option>
                        {admins.map((admin) => (
                            <option value={admin.globalUserId} key={admin.globalUserId}>
                                {admin.name || admin.email}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {selectedAdmin && (
                <div className="atlas-admin-budget-permissions__panel">
                    <h3>{selectedAdmin.name || selectedAdmin.email}</h3>
                    <p>{selectedAdmin.email}</p>
                    <ul>
                        {catalog.map((permission) => (
                            <li key={permission}>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={selectedPermissions.includes(permission)}
                                        onChange={() => togglePermission(permission)}
                                    />
                                    {permission}
                                </label>
                            </li>
                        ))}
                    </ul>
                    <button type="button" onClick={savePermissions}>Save permissions</button>
                </div>
            )}

            {status && <p className="atlas-admin-budget-permissions__status">{status}</p>}
        </section>
    );
}
