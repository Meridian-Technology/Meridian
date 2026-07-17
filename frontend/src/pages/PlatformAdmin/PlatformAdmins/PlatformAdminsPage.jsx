import React, { useCallback, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import '../TenantManagement/TenantManagementPage.scss';
import './PlatformAdminsPage.scss';

const NO_CACHE = { enabled: false };

function PlatformAdminsPage() {
  const { addNotification } = useNotification();
  const [email, setEmail] = useState('');
  const [nominating, setNominating] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const { data, loading, error, refetch } = useFetch('/admin/platform-admins', {
    cache: NO_CACHE,
  });

  const admins = useMemo(() => {
    const payload = data?.success ? data.data : null;
    if (Array.isArray(payload?.admins)) return payload.admins;
    if (Array.isArray(payload)) return payload;
    return [];
  }, [data]);

  const nominations = useMemo(() => {
    const payload = data?.success ? data.data : null;
    return Array.isArray(payload?.nominations) ? payload.nominations : [];
  }, [data]);

  const awaitingSignup = useMemo(
    () => nominations.filter((row) => row.status === 'pending_signup'),
    [nominations],
  );
  const readyToApprove = useMemo(
    () => nominations.filter((row) => row.status === 'ready_for_approval'),
    [nominations],
  );

  const handleNominate = useCallback(
    async (event) => {
      event.preventDefault();
      const nextEmail = email.trim().toLowerCase();
      if (!nextEmail || nominating) return;

      setNominating(true);
      const { data: res, error: reqError } = await authenticatedRequest(
        '/admin/platform-admins/nominate',
        {
          method: 'POST',
          data: { email: nextEmail },
          headers: { 'Content-Type': 'application/json' },
        },
      );
      setNominating(false);

      if (reqError || !res?.success) {
        addNotification({
          title: 'Could not nominate',
          message: res?.message || reqError || 'Request failed',
          type: 'error',
        });
        return;
      }

      const status = res.data?.status;
      addNotification({
        title: 'Nominated',
        message:
          status === 'ready_for_approval'
            ? `${nextEmail} is ready to approve — no access until you approve.`
            : `${nextEmail} is awaiting signup — approve after they register.`,
        type: 'success',
      });
      setEmail('');
      refetch();
    },
    [addNotification, email, nominating, refetch],
  );

  const handleApprove = useCallback(
    async (invite) => {
      if (!invite?.id || busyId) return;
      const label = invite.name
        ? `${invite.name} (${invite.email})`
        : invite.email;
      if (
        !window.confirm(
          `Approve platform admin for ${label}?\n\nThey will get Ops access across all pivot cities.`,
        )
      ) {
        return;
      }

      setBusyId(invite.id);
      const { data: res, error: reqError } = await authenticatedRequest(
        `/admin/platform-admins/nominations/${encodeURIComponent(invite.id)}/approve`,
        { method: 'POST' },
      );
      setBusyId(null);

      if (reqError || !res?.success) {
        addNotification({
          title: 'Approve failed',
          message: res?.message || reqError || 'Request failed',
          type: 'error',
        });
        return;
      }

      addNotification({
        title: 'Approved',
        message: `${res.data?.email || invite.email} is now a platform admin.`,
        type: 'success',
      });
      refetch();
    },
    [addNotification, busyId, refetch],
  );

  const handleCancelNomination = useCallback(
    async (invite) => {
      if (!invite?.id || busyId) return;
      if (!window.confirm(`Cancel nomination for ${invite.email}?`)) return;

      setBusyId(invite.id);
      const { data: res, error: reqError } = await authenticatedRequest(
        `/admin/platform-admins/nominations/${encodeURIComponent(invite.id)}`,
        { method: 'DELETE' },
      );
      setBusyId(null);

      if (reqError || !res?.success) {
        addNotification({
          title: 'Cancel failed',
          message: res?.message || reqError || 'Request failed',
          type: 'error',
        });
        return;
      }

      addNotification({
        title: 'Cancelled',
        message: `Nomination for ${invite.email} cancelled.`,
        type: 'success',
      });
      refetch();
    },
    [addNotification, busyId, refetch],
  );

  const handleRemoveAdmin = useCallback(
    async (admin) => {
      if (!admin?.globalUserId || busyId) return;
      if (
        !window.confirm(
          `Remove platform admin ${admin.email || admin.globalUserId}?`,
        )
      ) {
        return;
      }

      const id = String(admin.globalUserId);
      setBusyId(id);
      const { data: res, error: reqError } = await authenticatedRequest(
        `/admin/platform-admins/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );
      setBusyId(null);

      if (reqError || !res?.success) {
        addNotification({
          title: 'Remove failed',
          message: res?.message || reqError || 'Request failed',
          type: 'error',
        });
        return;
      }

      addNotification({
        title: 'Removed',
        message: `${admin.email || 'User'} is no longer a platform admin.`,
        type: 'success',
      });
      refetch();
    },
    [addNotification, busyId, refetch],
  );

  return (
    <div className="platform-admin-admins linear-admin">
      <header className="platform-admin-admins__header">
        <h1 className="platform-admin-admins__title">Platform admins</h1>
        <p className="platform-admin-admins__lede">
          Nominate by email, then approve after they have an account. Approval
          grants Ops across all Just Go cities. Nomination alone grants nothing.
          MFA is recommended.
        </p>
      </header>

      {error ? (
        <p className="platform-admin-admins__error" role="alert">
          {typeof error === 'string' ? error : 'Unable to load platform admins.'}
        </p>
      ) : null}

      <section className="linear-section" aria-labelledby="nominate-platform-admin">
        <h2 id="nominate-platform-admin" className="linear-section__title">
          Nominate
        </h2>
        <form className="platform-admin-admins__form" onSubmit={handleNominate}>
          <label className="linear-field platform-admin-admins__field">
            <span className="linear-field__label">Email</span>
            <input
              className="linear-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              disabled={nominating}
              required
            />
          </label>
          <button
            type="submit"
            className="linear-btn linear-btn--primary"
            disabled={nominating || !email.trim()}
          >
            {nominating ? (
              <>
                <Icon icon="mdi:loading" className="spin" />
                Nominating…
              </>
            ) : (
              'Nominate'
            )}
          </button>
        </form>
      </section>

      <section className="linear-section" aria-labelledby="ready-platform-admin">
        <h2 id="ready-platform-admin" className="linear-section__title">
          Ready to approve
        </h2>
        <p className="platform-admin-admins__hint">
          Account exists — click Approve to grant live platform admin access.
        </p>
        {loading && !readyToApprove.length ? (
          <p className="platform-admin-admins__muted">Loading…</p>
        ) : readyToApprove.length ? (
          <ul className="platform-admin-admins__list">
            {readyToApprove.map((invite) => (
              <li key={invite.id} className="platform-admin-admins__row">
                <div className="platform-admin-admins__identity">
                  <span className="platform-admin-admins__email">{invite.email}</span>
                  {invite.name ? (
                    <span className="platform-admin-admins__name">{invite.name}</span>
                  ) : null}
                </div>
                <div className="platform-admin-admins__actions">
                  <button
                    type="button"
                    className="linear-btn linear-btn--primary"
                    disabled={busyId === invite.id}
                    onClick={() => handleApprove(invite)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="linear-btn linear-btn--secondary"
                    disabled={busyId === invite.id}
                    onClick={() => handleCancelNomination(invite)}
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="platform-admin-admins__muted">No nominations ready to approve.</p>
        )}
      </section>

      <section className="linear-section" aria-labelledby="awaiting-platform-admin">
        <h2 id="awaiting-platform-admin" className="linear-section__title">
          Awaiting signup
        </h2>
        <p className="platform-admin-admins__hint">
          They must register with this email before you can approve.
        </p>
        {awaitingSignup.length ? (
          <ul className="platform-admin-admins__list">
            {awaitingSignup.map((invite) => (
              <li key={invite.id} className="platform-admin-admins__row">
                <div className="platform-admin-admins__identity">
                  <span className="platform-admin-admins__email">{invite.email}</span>
                  <span className="linear-badge">pending signup</span>
                </div>
                <div className="platform-admin-admins__actions">
                  <button
                    type="button"
                    className="linear-btn linear-btn--secondary"
                    disabled={busyId === invite.id}
                    onClick={() => handleCancelNomination(invite)}
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="platform-admin-admins__muted">No nominations awaiting signup.</p>
        )}
      </section>

      <section className="linear-section" aria-labelledby="active-platform-admin">
        <h2 id="active-platform-admin" className="linear-section__title">
          Active platform admins
        </h2>
        {loading && !admins.length ? (
          <p className="platform-admin-admins__muted">Loading…</p>
        ) : admins.length ? (
          <ul className="platform-admin-admins__list">
            {admins.map((admin) => (
              <li
                key={String(admin.globalUserId)}
                className="platform-admin-admins__row"
              >
                <div className="platform-admin-admins__identity">
                  <span className="platform-admin-admins__email">
                    {admin.email || String(admin.globalUserId)}
                  </span>
                  {admin.name ? (
                    <span className="platform-admin-admins__name">{admin.name}</span>
                  ) : null}
                </div>
                <div className="platform-admin-admins__actions">
                  <button
                    type="button"
                    className="linear-btn linear-btn--secondary"
                    disabled={busyId === String(admin.globalUserId)}
                    onClick={() => handleRemoveAdmin(admin)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="platform-admin-admins__muted">No active platform admins.</p>
        )}
      </section>
    </div>
  );
}

export default PlatformAdminsPage;
