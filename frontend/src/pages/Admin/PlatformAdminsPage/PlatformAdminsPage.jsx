import React, { useState, useCallback } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { useGradient } from '../../../hooks/useGradient';
import apiRequest from '../../../utils/postRequest';
import '../General/General.scss';
import './PlatformAdminsPage.scss';

const ADMIN_PAGE_CACHE_TTL_MS = 60 * 1000;

function PlatformAdminsPage() {
  const { addNotification } = useNotification();
  const { AdminGrad } = useGradient();
  const [addEmail, setAddEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [mutationError, setMutationError] = useState(null);
  const [savingAutoClaim, setSavingAutoClaim] = useState(false);
  const [runningOwnerRoleMigration, setRunningOwnerRoleMigration] = useState(false);

  const { data: listResponse, loading, error: fetchError, refetch } = useFetch('/admin/platform-admins', {
    cache: { enabled: true, ttlMs: ADMIN_PAGE_CACHE_TTL_MS },
  });
  const list = listResponse?.success ? (listResponse.data || []) : [];

  const { data: orgConfigResponse, refetch: refetchOrgConfig } = useFetch('/org-management/config', {
    cache: { enabled: true, ttlMs: ADMIN_PAGE_CACHE_TTL_MS },
  });
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

  const handleOwnerRoleMigration = useCallback(async () => {
    if (runningOwnerRoleMigration) return;
    setRunningOwnerRoleMigration(true);
    try {
      const response = await apiRequest('/admin/migrate-org-owner-roles', {}, { method: 'POST' });
      if (response?.success) {
        const data = response?.data || {};
        addNotification({
          title: 'Migration complete',
          message: `Scanned ${data.orgsScanned || 0} orgs. Created ${data.createdOwnerMemberships || 0}, repaired ${data.repairedOwnerMemberships || 0} owner memberships.`,
          type: 'success',
        });
      } else {
        addNotification({
          title: 'Migration failed',
          message: response?.message || response?.error || 'Unable to run owner role migration',
          type: 'error',
        });
      }
    } catch (error) {
      addNotification({
        title: 'Migration failed',
        message: error?.message || 'Unable to run owner role migration',
        type: 'error',
      });
    } finally {
      setRunningOwnerRoleMigration(false);
    }
  }, [addNotification, runningOwnerRoleMigration]);

  const error = fetchError || mutationError;

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
        <div className="admin-migration-section platform-admins-migrations">
          <h2>Org role migrations</h2>
          <p className="admin-migration-hint">
            Backfills owner memberships so every organization owner also has the immutable <code>owner</code> role.
          </p>
          <button
            type="button"
            className="admin-migration-btn"
            onClick={handleOwnerRoleMigration}
            disabled={runningOwnerRoleMigration}
          >
            {runningOwnerRoleMigration ? (
              <>
                <Icon icon="mdi:loading" className="spin" />
                Running owner role migration...
              </>
            ) : (
              'Assign owner role to all org owners'
            )}
          </button>
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
