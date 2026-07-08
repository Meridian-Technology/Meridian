import React, { useCallback, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch, authenticatedRequest } from '../../../../hooks/useFetch';
import { useNotification } from '../../../../NotificationContext';
import './PivotReferralCodesPanel.scss';

const EMPTY_CREATE = {
  code: '',
  cohortId: '',
  maxRedemptions: '50',
  batchWeek: '',
  active: true,
  expiresAt: '',
};

function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CodeStatusBadge({ row }) {
  if (!row.active) {
    return <span className="pivot-referral__status pivot-referral__status--inactive">Inactive</span>;
  }
  if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
    return <span className="pivot-referral__status pivot-referral__status--expired">Expired</span>;
  }
  if (row.redemptionCount >= row.maxRedemptions) {
    return <span className="pivot-referral__status pivot-referral__status--maxed">Maxed</span>;
  }
  if (row.redeemable) {
    return <span className="pivot-referral__status pivot-referral__status--ok">Redeemable</span>;
  }
  return <span className="pivot-referral__status">—</span>;
}

function ReferralCodeForm({ form, onChange, onSubmit, onCancel, submitLabel, saving }) {
  return (
    <form className="pivot-referral__form linear-form" onSubmit={onSubmit}>
      <div className="linear-form__grid">
        <label className="linear-field">
          <span className="linear-field__label">Code</span>
          <input
            className="linear-input"
            value={form.code}
            onChange={(e) => onChange('code', e.target.value.toUpperCase())}
            placeholder="NYC-PILOT-A"
            required
          />
        </label>
        <label className="linear-field">
          <span className="linear-field__label">Cohort ID</span>
          <input
            className="linear-input"
            value={form.cohortId}
            onChange={(e) => onChange('cohortId', e.target.value)}
            placeholder="pilot-a"
            required
          />
          <span className="linear-field__hint">
            Codes that share a cohort ID surface each other during onboarding
            (&quot;know any of these people?&quot;) so friend groups can connect
            before the first deck. Use the same cohort for a club or floor; use
            distinct cohorts when codes should not cross-suggest.
          </span>
        </label>
        <label className="linear-field">
          <span className="linear-field__label">Max redemptions</span>
          <input
            className="linear-input"
            type="number"
            min={0}
            value={form.maxRedemptions}
            onChange={(e) => onChange('maxRedemptions', e.target.value)}
            required
          />
        </label>
        <label className="linear-field">
          <span className="linear-field__label">Default batch week</span>
          <input
            className="linear-input"
            value={form.batchWeek}
            onChange={(e) => onChange('batchWeek', e.target.value)}
            placeholder="2026-W21"
          />
        </label>
        <label className="linear-field">
          <span className="linear-field__label">Expires at</span>
          <input
            className="linear-input"
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => onChange('expiresAt', e.target.value)}
          />
        </label>
        <label className="linear-field linear-field--checkbox">
          <span className="linear-field__label">Active</span>
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => onChange('active', e.target.checked)}
          />
        </label>
      </div>
      <div className="linear-form__actions">
        <button type="button" className="linear-btn linear-btn--ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="linear-btn linear-btn--primary" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

function PivotReferralCodesPanel({ tenantKey }) {
  const { addNotification } = useNotification();
  const listUrl = `/admin/platform/tenants/${tenantKey}/pivot-referral-codes`;
  const { data, loading, error, refetch } = useFetch(listUrl, {
    cache: { enabled: false },
  });

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const codes = data?.success ? data.data?.codes || [] : [];
  const currentBatchWeek = data?.data?.currentBatchWeek;

  const defaultBatchWeek = useMemo(() => currentBatchWeek || '', [currentBatchWeek]);

  const openCreate = () => {
    setEditing(null);
    setEditForm(null);
    setCreateForm({ ...EMPTY_CREATE, batchWeek: defaultBatchWeek });
    setShowCreate(true);
  };

  const handleCreateChange = (field, value) => {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditChange = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const buildPayload = (form, { includeCode = true } = {}) => {
    const payload = {
      cohortId: form.cohortId.trim(),
      maxRedemptions: Number(form.maxRedemptions),
      active: form.active,
      batchWeek: form.batchWeek.trim() || null,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
    };
    if (includeCode) payload.code = form.code.trim();
    return payload;
  };

  const handleCreate = useCallback(
    async (e) => {
      e.preventDefault();
      setSaving(true);
      const { data: res, error: reqError } = await authenticatedRequest(listUrl, {
        method: 'POST',
        data: buildPayload(createForm),
        headers: { 'Content-Type': 'application/json' },
      });
      setSaving(false);
      if (reqError || !res?.success) {
        addNotification({
          title: 'Create failed',
          message: res?.message || reqError || 'Unable to create referral code',
          type: 'error',
        });
        return;
      }
      addNotification({ title: 'Code created', message: res.data.code.code, type: 'success' });
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE);
      refetch();
    },
    [addNotification, createForm, listUrl, refetch]
  );

  const startEdit = (row) => {
    setShowCreate(false);
    setEditing(row._id);
    setEditForm({
      code: row.code,
      cohortId: row.cohortId,
      maxRedemptions: String(row.maxRedemptions),
      batchWeek: row.batchWeek || '',
      active: row.active,
      expiresAt: toDatetimeLocalValue(row.expiresAt),
      redemptionCount: String(row.redemptionCount),
    });
  };

  const handleUpdate = useCallback(
    async (e) => {
      e.preventDefault();
      if (!editing || !editForm) return;
      setSaving(true);
      const { data: res, error: reqError } = await authenticatedRequest(
        `${listUrl}/${editing}`,
        {
          method: 'PUT',
          data: {
            ...buildPayload(editForm),
            redemptionCount: Number(editForm.redemptionCount),
          },
          headers: { 'Content-Type': 'application/json' },
        }
      );
      setSaving(false);
      if (reqError || !res?.success) {
        addNotification({
          title: 'Update failed',
          message: res?.message || reqError || 'Unable to update referral code',
          type: 'error',
        });
        return;
      }
      addNotification({ title: 'Code updated', message: res.data.code.code, type: 'success' });
      setEditing(null);
      setEditForm(null);
      refetch();
    },
    [addNotification, editForm, editing, listUrl, refetch]
  );

  const handleDelete = useCallback(
    async (row) => {
      if (!window.confirm(`Delete referral code ${row.code}?`)) return;
      setSaving(true);
      const { data: res, error: reqError } = await authenticatedRequest(`${listUrl}/${row._id}`, {
        method: 'DELETE',
      });
      setSaving(false);
      if (reqError || !res?.success) {
        addNotification({
          title: 'Delete failed',
          message: res?.message || reqError || 'Unable to delete referral code',
          type: 'error',
        });
        return;
      }
      addNotification({ title: 'Deleted', message: row.code, type: 'success' });
      if (editing === row._id) {
        setEditing(null);
        setEditForm(null);
      }
      refetch();
    },
    [addNotification, editing, listUrl, refetch]
  );

  const panelId = `pivot-referral-${tenantKey}`;

  return (
    <section className="linear-section pivot-referral" aria-labelledby={panelId}>
      <div className="pivot-referral__head">
        <div>
          <h3 id={panelId} className="linear-section__title">Pivot referral codes</h3>
          <p className="pivot-referral__hint">
            Invite codes gate the Pivot mobile edition for this city.{' '}
            <strong>Cohort ID</strong> groups codes for analytics and onboarding:
            new users who redeemed codes with the same cohort see each other on the
            &quot;know any of these people?&quot; step and can send friend requests
            before their first week deck. Current ISO week:{' '}
            <code className="linear-code linear-code--inline">{currentBatchWeek || '—'}</code>
          </p>
        </div>
        <button
          type="button"
          className="linear-btn linear-btn--secondary linear-btn--sm"
          onClick={openCreate}
          disabled={showCreate || Boolean(editing)}
        >
          <Icon icon="mdi:ticket-confirmation-outline" />
          New code
        </button>
      </div>

      {error ? <p className="pivot-referral__error">{error}</p> : null}

      {showCreate ? (
        <div className="pivot-referral__editor">
          <p className="pivot-referral__editor-title">Create referral code</p>
          <ReferralCodeForm
            form={createForm}
            onChange={handleCreateChange}
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
            submitLabel="Create code"
            saving={saving}
          />
        </div>
      ) : null}

      {editing && editForm ? (
        <div className="pivot-referral__editor">
          <p className="pivot-referral__editor-title">Edit {editForm.code}</p>
          <ReferralCodeForm
            form={editForm}
            onChange={handleEditChange}
            onSubmit={handleUpdate}
            onCancel={() => {
              setEditing(null);
              setEditForm(null);
            }}
            submitLabel="Save changes"
            saving={saving}
          />
          <label className="linear-field pivot-referral__redemption-field">
            <span className="linear-field__label">Redemption count (ops override)</span>
            <input
              className="linear-input"
              type="number"
              min={0}
              value={editForm.redemptionCount}
              onChange={(e) => handleEditChange('redemptionCount', e.target.value)}
            />
          </label>
        </div>
      ) : null}

      {loading && codes.length === 0 ? (
        <p className="pivot-referral__empty">Loading referral codes…</p>
      ) : codes.length === 0 ? (
        <p className="pivot-referral__empty">No referral codes yet. Create one for pilot cohorts.</p>
      ) : (
        <div className="pivot-referral__table-wrap">
          <table className="pivot-referral__table">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Cohort</th>
                <th scope="col">Redemptions</th>
                <th scope="col">Batch week</th>
                <th scope="col">Status</th>
                <th scope="col" className="pivot-referral__actions-col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {codes.map((row) => (
                <tr key={row._id} className={editing === row._id ? 'is-editing' : ''}>
                  <td>
                    <code className="linear-code linear-code--inline">{row.code}</code>
                  </td>
                  <td>{row.cohortId}</td>
                  <td>
                    {row.redemptionCount} / {row.maxRedemptions}
                  </td>
                  <td>{row.batchWeek || '—'}</td>
                  <td>
                    <CodeStatusBadge row={row} />
                  </td>
                  <td className="pivot-referral__actions-col">
                    <button
                      type="button"
                      className="linear-btn linear-btn--ghost linear-btn--sm"
                      disabled={saving}
                      onClick={() => startEdit(row)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="linear-btn linear-btn--ghost linear-btn--sm pivot-referral__delete"
                      disabled={saving}
                      onClick={() => handleDelete(row)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default PivotReferralCodesPanel;
