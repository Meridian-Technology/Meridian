import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import useAuth from '../../hooks/useAuth';
import { useGradient } from '../../hooks/useGradient';
import { authenticatedRequest, useFetch } from '../../hooks/useFetch';
import defaultAvatar from '../../assets/defaultAvatar.svg';
import KpiCard from '../../components/Analytics/Dashboard/KpiCard';
import './RootDashUserManagement.scss';

/**
 * People & access for root dashboard (classic + community). Search, grant/revoke admin, suspend (admins only).
 * @param {{ useBeaconHeaderImage?: boolean }} props
 */
function RootDashUserManagement({ useBeaconHeaderImage = false }) {
    const { user: currentUser } = useAuth();
    const { AdminGrad, BeaconMain } = useGradient();
    const headerSrc = useBeaconHeaderImage ? BeaconMain : AdminGrad;

    const [q, setQ] = useState('');
    const [debouncedQ, setDebouncedQ] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [users, setUsers] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const { data: statsRes, loading: statsLoading, refetch: refetchStats } = useFetch(
        '/org-management/root-operator-user-stats'
    );
    const stats = statsRes?.data;
    const responsesSummaryFetch = useFetch('/org-management/user-onboarding-responses-summary');
    const responsesSummary = responsesSummaryFetch.data?.data;
    const interestCounts = responsesSummary?.interests?.optionCounts || {};
    const sortedInterestCounts = Object.entries(interestCounts).sort((a, b) => b[1] - a[1]);

    const actorIsAdmin = (currentUser?.roles || []).includes('admin');

    useEffect(() => {
        const t = window.setTimeout(() => setDebouncedQ(q.trim()), 400);
        return () => window.clearTimeout(t);
    }, [q]);

    const searchUrl = useMemo(() => {
        if (debouncedQ.length < 2) return null;
        const params = new URLSearchParams();
        params.set('q', debouncedQ);
        params.set('limit', '25');
        if (roleFilter) params.set('role', roleFilter);
        return `/org-management/root-operator-users?${params.toString()}`;
    }, [debouncedQ, roleFilter]);

    const runSearch = useCallback(async () => {
        if (!searchUrl) {
            setUsers([]);
            setTotal(0);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        const { data: res, error: err } = await authenticatedRequest(searchUrl, { method: 'GET' });
        setLoading(false);
        if (err) {
            setError(typeof err === 'string' ? err : 'Search failed');
            setUsers([]);
            setTotal(0);
            return;
        }
        if (res?.success && res.data) {
            setUsers(res.data.users || []);
            setTotal(res.data.total ?? 0);
            setSelected((prev) => {
                if (!prev) return null;
                const still = (res.data.users || []).find((u) => String(u._id) === String(prev._id));
                return still || prev;
            });
        } else {
            setUsers([]);
            setTotal(0);
        }
    }, [searchUrl]);

    useEffect(() => {
        runSearch();
    }, [runSearch]);

    const mergeUser = useCallback((updated) => {
        if (!updated?._id) return;
        setUsers((prev) => prev.map((u) => (String(u._id) === String(updated._id) ? { ...u, ...updated } : u)));
        setSelected((prev) => (prev && String(prev._id) === String(updated._id) ? { ...prev, ...updated } : prev));
    }, []);

    const toggleRole = async (targetUser, role, assign) => {
        if (!targetUser || busy) return;
        setBusy(true);
        setError(null);
        const { data: res, error: err } = await authenticatedRequest(
            `/org-management/root-operator-users/${targetUser._id}/role`,
            { method: 'POST', data: { role, assign } }
        );
        setBusy(false);
        if (err || !res?.success) {
            setError(res?.message || (typeof err === 'string' ? err : 'Could not update role'));
            return;
        }
        mergeUser({ ...targetUser, roles: res.data?.roles || targetUser.roles });
        refetchStats({ silent: true });
    };

    const setSuspended = async (targetUser, accessSuspended) => {
        if (!targetUser || busy) return;
        setBusy(true);
        setError(null);
        const { data: res, error: err } = await authenticatedRequest(
            `/org-management/root-operator-users/${targetUser._id}/access`,
            { method: 'PATCH', data: { accessSuspended } }
        );
        setBusy(false);
        if (err || !res?.success) {
            setError(res?.message || (typeof err === 'string' ? err : 'Could not update access'));
            return;
        }
        mergeUser({
            ...targetUser,
            accessSuspended: res.data?.accessSuspended,
            accessSuspendedAt: res.data?.accessSuspendedAt,
        });
        refetchStats({ silent: true });
    };

    return (
        <div className="root-dash-user-management dash">
            <header className="header">
                <h1>People &amp; access</h1>
                <p>
                    Search people by name, username, or email. 
                </p>
                <img src={headerSrc} alt="" />
            </header>

            <div className="root-dash-user-management__body">
                <section className="root-dash-user-management__stats" aria-label="User statistics">
                    {statsLoading && !stats ? (
                        <div className="root-dash-user-management__stats-loading">
                            <Icon icon="mdi:loading" className="spin" aria-hidden />
                            Loading statistics…
                        </div>
                    ) : stats ? (
                        <div className="root-dash-user-management__kpis">
                            <KpiCard
                                title="Admins"
                                value={(stats.adminCount ?? 0).toLocaleString()}
                                subtitle="Can use this dashboard and operator tools"
                                icon="mdi:shield-account-outline"
                            />
                            <KpiCard
                                title="Normal users"
                                value={(stats.memberCount ?? 0).toLocaleString()}
                                subtitle={`${(stats.totalUsers ?? 0).toLocaleString()} registered total`}
                                icon="mdi:account-outline"
                            />
                        </div>
                    ) : null}
                </section>

                <section className="root-dash-user-management__onboarding-overview" aria-label="Onboarding response overview">
                    <div className="root-dash-user-management__overview-head">
                        <h2>Onboarding responses overview</h2>
                        <p>Onboarding questions are managed in <strong>Settings → User onboarding</strong>.</p>
                    </div>

                    {responsesSummaryFetch.loading ? (
                        <div className="root-dash-user-management__stats-loading">
                            <Icon icon="mdi:loading" className="spin" aria-hidden />
                            Loading onboarding responses…
                        </div>
                    ) : responsesSummaryFetch.error ? (
                        <div className="root-dash-user-management__banner" role="alert">
                            Unable to load onboarding response summary.
                        </div>
                    ) : (
                        <div className="root-dash-user-management__overview-grid">
                            <div className="root-dash-user-management__overview-stat">
                                <span>Total users</span>
                                <strong>{responsesSummary?.totalUsers ?? 0}</strong>
                            </div>
                            <div className="root-dash-user-management__overview-stat">
                                <span>Users with interests</span>
                                <strong>{responsesSummary?.interests?.totalTaggedUsers ?? 0}</strong>
                            </div>

                            <div className="root-dash-user-management__overview-block">
                                <h3>Interests (Event Tags)</h3>
                                {sortedInterestCounts.length === 0 ? (
                                    <p className="root-dash-user-management__hint">No interest selections yet.</p>
                                ) : (
                                    <div className="root-dash-user-management__chips">
                                        {sortedInterestCounts.map(([label, count]) => (
                                            <span key={label} className="root-dash-user-management__chip root-dash-user-management__chip--read">
                                                {label} <strong>{count}</strong>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="root-dash-user-management__overview-block">
                                <h3>Custom step responses</h3>
                                {(responsesSummary?.customSteps || []).length === 0 ? (
                                    <p className="root-dash-user-management__hint">No custom steps configured.</p>
                                ) : (
                                    <div className="root-dash-user-management__overview-questions">
                                        {(responsesSummary?.customSteps || []).map((step) => {
                                            const optionEntries = Object.entries(step.optionCounts || {}).sort((a, b) => b[1] - a[1]);
                                            return (
                                                <div key={step.id} className="root-dash-user-management__overview-question">
                                                    <div className="root-dash-user-management__overview-question-head">
                                                        <h4>{step.label}</h4>
                                                        <span>{step.responseCount || 0} responses</span>
                                                    </div>
                                                    {(step.type === 'single-select' || step.type === 'multi-select') ? (
                                                        optionEntries.length === 0 ? (
                                                            <p className="root-dash-user-management__hint">No selections yet.</p>
                                                        ) : (
                                                            <div className="root-dash-user-management__chips">
                                                                {optionEntries.map(([opt, count]) => (
                                                                    <span key={opt} className="root-dash-user-management__chip root-dash-user-management__chip--read">
                                                                        {opt} <strong>{count}</strong>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )
                                                    ) : (
                                                        (step.textSamples || []).length === 0 ? (
                                                            <p className="root-dash-user-management__hint">No text responses yet.</p>
                                                        ) : (
                                                            <ul className="root-dash-user-management__overview-samples">
                                                                {step.textSamples.slice(0, 5).map((sample, idx) => (
                                                                    <li key={`${step.id}-${idx}`}>{sample}</li>
                                                                ))}
                                                            </ul>
                                                        )
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </section>

                {error ? (
                    <div className="root-dash-user-management__banner" role="alert">
                        {error}
                    </div>
                ) : null}

                <div className="root-dash-user-management__toolbar">
                    <label className="root-dash-user-management__search">
                        <Icon icon="mdi:magnify" aria-hidden />
                        <input
                            type="search"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search (at least 2 characters)…"
                            autoComplete="off"
                        />
                    </label>
                    <div className="root-dash-user-management__filter">
                        <select
                            id="root-dash-user-role-filter"
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                        >
                            <option value="">Any role</option>
                            <option value="admin">Admins only</option>
                        </select>
                    </div>
                </div>

                <div className="root-dash-user-management__split">
                    <div className="root-dash-user-management__list-wrap">
                        <div className="root-dash-user-management__list-head">
                            <span>Results</span>
                            {debouncedQ.length >= 2 ? (
                                <span className="root-dash-user-management__count">
                                    {total.toLocaleString()} match{total === 1 ? '' : 'es'}
                                </span>
                            ) : null}
                        </div>
                        <ul className="root-dash-user-management__list">
                            {loading ? (
                                <li className="root-dash-user-management__state">
                                    <Icon icon="mdi:loading" className="spin" /> Searching…
                                </li>
                            ) : debouncedQ.length < 2 ? (
                                <li className="root-dash-user-management__state">Type at least 2 characters to search.</li>
                            ) : users.length === 0 ? (
                                <li className="root-dash-user-management__state">No people found.</li>
                            ) : (
                                users.map((u) => (
                                    <li key={String(u._id)}>
                                        <button
                                            type="button"
                                            className={`root-dash-user-management__row${
                                                selected && String(selected._id) === String(u._id) ? ' is-selected' : ''
                                            }`}
                                            onClick={() => setSelected(u)}
                                        >
                                            <img src={u.picture || defaultAvatar} alt="" className="root-dash-user-management__avatar" />
                                            <div className="root-dash-user-management__row-text">
                                                <span className="root-dash-user-management__name">{u.name || 'No name'}</span>
                                                <span className="root-dash-user-management__username">
                                                    @{u.username || '—'}
                                                </span>
                                                {u.email ? (
                                                    <span className="root-dash-user-management__email">{u.email}</span>
                                                ) : null}
                                                {u.accessSuspended ? (
                                                    <span className="root-dash-user-management__suspended-pill">Suspended</span>
                                                ) : null}
                                            </div>
                                        </button>
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>

                    <div className="root-dash-user-management__detail">
                        {!selected ? (
                            <p className="root-dash-user-management__placeholder">Select someone to manage access.</p>
                        ) : (
                            <div className="root-dash-user-management__card">
                                <div className="root-dash-user-management__card-head">
                                    <img
                                        src={selected.picture || defaultAvatar}
                                        alt=""
                                        className="root-dash-user-management__avatar-lg"
                                    />
                                    <div>
                                        <h2>{selected.name || 'No name'}</h2>
                                        <p className="root-dash-user-management__mono">@{selected.username || '—'}</p>
                                        {selected.email ? <p>{selected.email}</p> : null}
                                    </div>
                                </div>

                                <section className="root-dash-user-management__section">
                                    <h3>Dashboard access</h3>
                                    <p className="root-dash-user-management__hint">
                                        Admins can use this dashboard and the same operator setup tools you use.
                                    </p>
                                    <div className="root-dash-user-management__chips">
                                        <button
                                            type="button"
                                            className={`root-dash-user-management__chip${
                                                (selected.roles || []).includes('admin') ? ' is-on' : ''
                                            }`}
                                            disabled={busy || !actorIsAdmin}
                                            onClick={() =>
                                                toggleRole(
                                                    selected,
                                                    'admin',
                                                    !(selected.roles || []).includes('admin')
                                                )
                                            }
                                        >
                                            admin
                                            {(selected.roles || []).includes('admin') ? ' ✓' : ''}
                                        </button>
                                    </div>
                                    {!actorIsAdmin ? (
                                        <p className="root-dash-user-management__hint">
                                            Only admins can grant or remove <strong>admin</strong>.
                                        </p>
                                    ) : null}
                                </section>

                                <section className="root-dash-user-management__section">
                                    <h3>Account access</h3>
                                    <p className="root-dash-user-management__hint">
                                        Suspended people cannot sign in or use the app on this site.
                                    </p>
                                    {actorIsAdmin ? (
                                        <div className="root-dash-user-management__suspend-actions">
                                            {selected.accessSuspended ? (
                                                <button
                                                    type="button"
                                                    className="root-dash-user-management__btn root-dash-user-management__btn--primary"
                                                    disabled={busy}
                                                    onClick={() => setSuspended(selected, false)}
                                                >
                                                    Restore access
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="root-dash-user-management__btn root-dash-user-management__btn--danger"
                                                    disabled={busy || String(selected._id) === String(currentUser?._id)}
                                                    onClick={() => {
                                                        if (
                                                            window.confirm(
                                                                `Suspend ${selected.name || selected.username}? They will be signed out and cannot log in until access is restored.`
                                                            )
                                                        ) {
                                                            setSuspended(selected, true);
                                                        }
                                                    }}
                                                >
                                                    Suspend access
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="root-dash-user-management__hint">Only admins can suspend accounts.</p>
                                    )}
                                </section>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default RootDashUserManagement;
