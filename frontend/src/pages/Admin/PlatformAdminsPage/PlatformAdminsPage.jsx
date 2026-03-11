import React, { useState, useCallback } from 'react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import GradientHeader from '../../../assets/Gradients/ApprovalGrad.png';
import '../General/General.scss';
import './PlatformAdminsPage.scss';

function PlatformAdminsPage() {
  const [addEmail, setAddEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [mutationError, setMutationError] = useState(null);

  const { data: listResponse, loading, error: fetchError, refetch } = useFetch('/admin/platform-admins');
  const list = listResponse?.success ? (listResponse.data || []) : [];

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

  const error = fetchError || mutationError;

  return (
    <div className="platform-admins-page general">
      <img src={GradientHeader} alt="" className="grad" />
      <div className="simple-header">
        <h1>Platform Admins</h1>
        <p className="sub">Users with platform_admin can access admin features on every tenant.</p>
      </div>
      <div className="general-content">
        {error && <div className="platform-admins-error">{error}</div>}
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
