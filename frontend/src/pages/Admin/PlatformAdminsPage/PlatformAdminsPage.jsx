import React, { useState, useCallback, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { setTenantConfigCache } from '../../../config/tenantRedirect';
import { useNotification } from '../../../NotificationContext';
import { useGradient } from '../../../hooks/useGradient';
import apiRequest from '../../../utils/postRequest';
import '../General/General.scss';
import './PlatformAdminsPage.scss';

function PlatformAdminsPage() {
  const { addNotification } = useNotification();
  const { AdminGrad } = useGradient();
  const [addEmail, setAddEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [mutationError, setMutationError] = useState(null);
  const [tenantDrafts, setTenantDrafts] = useState({});
  const [savingTenants, setSavingTenants] = useState(false);
  const [savingAutoClaim, setSavingAutoClaim] = useState(false);

  const { data: listResponse, loading, error: fetchError, refetch } = useFetch('/admin/platform-admins');
  const list = listResponse?.success ? (listResponse.data || []) : [];
  const {
    data: tenantConfigResponse,
    loading: tenantConfigLoading,
    error: tenantConfigFetchError,
    refetch: refetchTenantConfig,
  } = useFetch('/admin/tenant-config');
  const tenantRows = tenantConfigResponse?.success ? (tenantConfigResponse.data?.tenants || []) : [];

  const { data: orgConfigResponse, refetch: refetchOrgConfig } = useFetch('/org-management/config');
  const orgConfig = orgConfigResponse?.data;
  const autoClaimEnabled = orgConfig?.autoClaimEnabled ?? false;

  const handleAutoClaimToggle = useCallback(async (checked) => {
    setSavingAutoClaim(true);
    try {
      const res = await apiRequest('/org-management/config', { autoClaimEnabled: checked }, { method: 'PUT' });
      if (res?.success) {
        addNotification({ title: 'Saved', message: 'Auto-claim setting updated', type: 'success' });
        refetchOrgConfig();
      } else {
        addNotification({ title: 'Error', message: res?.message || 'Failed to save', type: 'error' });
      }
    } catch (e) {
      addNotification({ title: 'Error', message: e?.message || 'Failed to save', type: 'error' });
    } finally {
      setSavingAutoClaim(false);
    }
  }, [addNotification, refetchOrgConfig]);

  useEffect(() => {
    const nextDrafts = {};
    tenantRows.forEach((tenant) => {
      nextDrafts[tenant.tenantKey] = {
        status: tenant.status || 'active',
        statusMessage: tenant.statusMessage || '',
      };
    });
    setTenantDrafts(nextDrafts);
  }, [tenantConfigResponse]);

  const handleAdd = useCallback(async (e) => {
    e.preventDefault();
    const email = addEmail.trim();
    if (!email) return;
    setAdding(true);
    setMutationError(null);
    const { data, error } = await authenticatedRequest('/admin/platform-admins', {
      method: 'POST',
      data: { email },
      headers: { 'Content-Type': 'application/json' },
    });
    setAdding(false);
    if (error) {
      setMutationError(data?.message || error);
      return;
    }
    if (data?.success) {
      setAddEmail('');
      refetch();
    } else {
      setMutationError(data?.message || 'Failed to add');
    }
  }, [addEmail, refetch]);

  const handleRemove = useCallback(async (globalUserId) => {
    if (!window.confirm('Remove this platform admin?')) return;
    setMutationError(null);
    const { data, error } = await authenticatedRequest(`/admin/platform-admins/${globalUserId}`, { method: 'DELETE' });
    if (error) {
      setMutationError(data?.message || error);
      return;
    }
    if (data?.success) refetch();
    else setMutationError(data?.message || 'Failed to remove');
  }, [refetch]);

  const handleTenantDraftChange = useCallback((tenantKey, patch) => {
    setTenantDrafts((prev) => ({
      ...prev,
      [tenantKey]: {
        ...(prev[tenantKey] || {}),
        ...patch,
      },
    }));
  }, []);

  const handleTenantConfigSave = useCallback(async () => {
    if (tenantRows.length === 0) return;
    setSavingTenants(true);
    setMutationError(null);
    const tenants = tenantRows.map((tenant) => ({
      tenantKey: tenant.tenantKey,
      status: tenantDrafts[tenant.tenantKey]?.status || tenant.status || 'active',
      statusMessage: tenantDrafts[tenant.tenantKey]?.statusMessage || '',
    }));
    const { data, error } = await authenticatedRequest('/admin/tenant-config', {
      method: 'PUT',
      data: { tenants },
      headers: { 'Content-Type': 'application/json' },
    });
    setSavingTenants(false);
    if (error) {
      setMutationError(data?.message || error);
      return;
    }
    if (data?.success) {
      setTenantConfigCache(data?.data?.tenants || []);
      refetchTenantConfig();
    } else {
      setMutationError(data?.message || 'Failed to save tenant settings');
    }
  }, [refetchTenantConfig, tenantDrafts, tenantRows]);

  const error = fetchError || tenantConfigFetchError || mutationError;

  return (
    <div className="platform-admins-page general dash">
      <img src={AdminGrad} alt="" className="grad" />
      <header className="header">
        <h1>Platform Admins</h1>
        <p>Users with platform_admin can access admin features on every tenant.</p>
      </header>
      <div className="general-content">
        {error && <div className="platform-admins-error">{error}</div>}
        <div className="admin-migration-section platform-admins-auto-claim">
          <h2>Auto-claim event registrations</h2>
          <p className="admin-migration-hint">
            When enabled, anonymous event registrations are automatically linked to user accounts when they sign up
            with a matching email. Applies tenant-wide to events that use registration forms.
          </p>
          <label className="platform-admins-auto-claim__label">
            <input
              type="checkbox"
              checked={autoClaimEnabled}
              disabled={savingAutoClaim}
              onChange={(e) => handleAutoClaimToggle(e.target.checked)}
            />
            <span>Auto-claim registrations when user signs up with matching email</span>
            {savingAutoClaim ? <Icon icon="mdi:loading" className="spin" /> : null}
          </label>
        </div>
        <form onSubmit={handleAdd} className="platform-admins-add">
          <input
            type="email"
            placeholder="Add by email"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            disabled={adding}
          />
          <button type="submit" disabled={adding || !addEmail.trim()}>Add</button>
        </form>
        <div className="platform-admins-tenants">
          <div className="platform-admins-tenants-header">
            <h2>Tenant visibility</h2>
            <p>
              Control how tenants appear on the school picker:
              <strong> active</strong>, <strong>coming soon</strong>, <strong>under maintenance</strong>, or <strong>hidden</strong>.
            </p>
          </div>
          {tenantConfigLoading ? (
            <p>Loading tenant settings…</p>
          ) : (
            <>
              <div className="platform-admins-tenants-list">
                {tenantRows.map((tenant) => (
                  <div key={tenant.tenantKey} className="platform-admins-tenant-row">
                    <div className="platform-admins-tenant-meta">
                      <p className="name">{tenant.name}</p>
                      <p className="domain">{tenant.subdomain}.meridian.study</p>
                    </div>
                    <select
                      value={tenantDrafts[tenant.tenantKey]?.status || tenant.status || 'active'}
                      onChange={(e) => handleTenantDraftChange(tenant.tenantKey, { status: e.target.value })}
                    >
                      <option value="active">Active</option>
                      <option value="coming_soon">Coming soon</option>
                      <option value="maintenance">Under maintenance</option>
                      <option value="hidden">Hidden</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Optional status message"
                      value={tenantDrafts[tenant.tenantKey]?.statusMessage || ''}
                      onChange={(e) => handleTenantDraftChange(tenant.tenantKey, { statusMessage: e.target.value })}
                      maxLength={240}
                    />
                  </div>
                ))}
              </div>
              <button type="button" onClick={handleTenantConfigSave} disabled={savingTenants}>
                {savingTenants ? 'Saving…' : 'Save tenant settings'}
              </button>
            </>
          )}
        </div>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <ul className="platform-admins-list">
            {list.length === 0 ? (
              <li className="empty">No platform admins yet.</li>
            ) : (
              list.map((item) => (
                <li key={item.globalUserId}>
                  <span className="email">{item.email}</span>
                  {item.name && <span className="name">{item.name}</span>}
                  <button type="button" className="remove" onClick={() => handleRemove(item.globalUserId)}>Remove</button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

export default PlatformAdminsPage;
