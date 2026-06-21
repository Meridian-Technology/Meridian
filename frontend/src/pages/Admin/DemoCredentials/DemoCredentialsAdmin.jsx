import React, { useCallback, useMemo, useState } from 'react';
import axios from 'axios';
import { Icon } from '@iconify-icon/react';
import { Link } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { DEMO_PHASES, getDemoEventsPortalUrl } from '../../../utils/demoTenant';
import Popup from '../../../components/Popup/Popup';
import './DemoCredentialsAdmin.scss';

const PHASE_LABELS = Object.fromEntries(DEMO_PHASES.map((phase) => [phase.id, phase.label]));

function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
}

function formatDuration(ms) {
    if (!ms || ms < 1000) return '< 1 min';
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

function statusTone(status) {
    if (status === 'active') return 'active';
    if (status === 'revoked') return 'revoked';
    return 'expired';
}

function DemoCredentialsAdmin() {
    const { addNotification } = useNotification();
    const [label, setLabel] = useState('');
    const [expiresAt, setExpiresAt] = useState('');
    const [creating, setCreating] = useState(false);
    const [revokingId, setRevokingId] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [createdCredential, setCreatedCredential] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const credentialsUrl = `/admin/demo-credentials?_=${refreshKey}`;
    const analyticsUrl = `/admin/demo-credentials/analytics?_=${refreshKey}`;
    const seedStatusUrl = `/admin/demo-seed-status?_=${refreshKey}`;
    const journeyUrl = selectedId ? `/admin/demo-credentials/${selectedId}/journey` : null;

    const { data: credentialsData, loading: credentialsLoading, refetch: refetchCredentials } = useFetch(credentialsUrl);
    const { data: analyticsData, loading: analyticsLoading } = useFetch(analyticsUrl);
    const { data: seedData } = useFetch(seedStatusUrl);
    const { data: journeyData, loading: journeyLoading } = useFetch(journeyUrl);

    const credentials = credentialsData?.data || [];
    const analytics = analyticsData?.data;
    const journey = journeyData?.data;
    const seeded = seedData?.data?.seeded;

    const phaseRows = useMemo(() => {
        const distribution = analytics?.phaseDistribution || {};
        return DEMO_PHASES.map((phase) => ({
            id: phase.id,
            label: phase.label,
            count: distribution[phase.id] || 0,
        }));
    }, [analytics?.phaseDistribution]);

    const maxPhaseCount = useMemo(
        () => Math.max(1, ...phaseRows.map((row) => row.count)),
        [phaseRows]
    );

    const refreshAll = useCallback(() => {
        setRefreshKey((value) => value + 1);
        refetchCredentials();
    }, [refetchCredentials]);

    const handleCreate = async (event) => {
        event.preventDefault();
        setCreating(true);
        try {
            const payload = { label: label.trim() };
            if (expiresAt) payload.expiresAt = new Date(expiresAt).toISOString();
            const response = await axios.post('/admin/demo-credentials', payload, { withCredentials: true });
            if (!response.data?.success) {
                throw new Error(response.data?.message || 'Failed to create credential');
            }
            setCreatedCredential(response.data.data);
            setLabel('');
            setExpiresAt('');
            refreshAll();
            addNotification({
                title: 'Credential created',
                message: 'Copy the password now — it will not be shown again.',
                type: 'success',
            });
        } catch (err) {
            addNotification({
                title: 'Create failed',
                message: err.response?.data?.message || err.message || 'Unable to create credential',
                type: 'error',
            });
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = async (credential) => {
        if (!credential?.id || credential.status !== 'active') return;
        const confirmed = window.confirm(`Revoke access for ${credential.email}?`);
        if (!confirmed) return;

        setRevokingId(credential.id);
        try {
            const response = await axios.patch(
                `/admin/demo-credentials/${credential.id}`,
                { revoke: true },
                { withCredentials: true }
            );
            if (!response.data?.success) {
                throw new Error(response.data?.message || 'Failed to revoke credential');
            }
            if (selectedId === credential.id) setSelectedId(null);
            refreshAll();
            addNotification({
                title: 'Credential revoked',
                message: `${credential.email} can no longer log in.`,
                type: 'success',
            });
        } catch (err) {
            addNotification({
                title: 'Revoke failed',
                message: err.response?.data?.message || err.message || 'Unable to revoke credential',
                type: 'error',
            });
        } finally {
            setRevokingId(null);
        }
    };

    const copyText = async (text, successMessage) => {
        try {
            await navigator.clipboard.writeText(text);
            addNotification({ title: 'Copied', message: successMessage, type: 'success' });
        } catch (_) {
            addNotification({ title: 'Copy failed', message: 'Could not copy to clipboard', type: 'error' });
        }
    };

    return (
        <div className="demo-credentials-admin dash">
            <header className="demo-credentials-admin__header">
                <div>
                    <p className="demo-credentials-admin__eyebrow">Demo tenant</p>
                    <h1>Demo credentials</h1>
                    <p>Generate shareable logins for the events-demo sandbox at <Link to="/events-demo">/events-demo</Link>.</p>
                </div>
                <a className="demo-credentials-admin__preview-link" href={getDemoEventsPortalUrl()} target="_blank" rel="noreferrer">
                    <Icon icon="mdi:open-in-new" />
                    Open demo portal
                </a>
            </header>

            {!seeded ? (
                <div className="demo-credentials-admin__banner demo-credentials-admin__banner--warn" role="status">
                    <Icon icon="mdi:alert-circle-outline" />
                    <div>
                        <strong>Demo tenant not seeded</strong>
                        <p>Run <code>POST /admin/seed-demo-tenant</code> with <code>{'{"reset": true}'}</code> before sharing credentials.</p>
                    </div>
                </div>
            ) : null}

            <section className="demo-credentials-admin__playbook" aria-label="Sales playbook">
                <h2>Sales playbook</h2>
                <ol>
                    <li>Generate <strong>one credential per prospect</strong> with a descriptive label (org + contact + month).</li>
                    <li>Copy email and password from the one-time modal — share via a secure channel.</li>
                    <li>
                        Send the portal URL:{' '}
                        <a href={getDemoEventsPortalUrl()} target="_blank" rel="noreferrer">
                            {getDemoEventsPortalUrl()}
                        </a>
                    </li>
                    <li>Set an expiry when appropriate (e.g. 14 days). Stale credentials are revoked hourly.</li>
                    <li>After the meeting, revoke the credential if it should not be reused.</li>
                    <li>Review credential journey below to see which phases and tabs they explored.</li>
                </ol>
                <p className="demo-credentials-admin__muted">
                    Ops runbook: <code>Meridian/docs/DEMO_EVENTS_OPS_RUNBOOK.md</code>
                </p>
            </section>

            <section className="demo-credentials-admin__metrics" aria-label="Demo analytics summary">
                <article className="demo-credentials-admin__metric">
                    <span>Active credentials</span>
                    <strong>{analyticsLoading ? '…' : analytics?.activeCredentials ?? 0}</strong>
                </article>
                <article className="demo-credentials-admin__metric">
                    <span>Total logins</span>
                    <strong>{analyticsLoading ? '…' : analytics?.totalLogins ?? 0}</strong>
                </article>
                <article className="demo-credentials-admin__metric">
                    <span>Used at least once</span>
                    <strong>{analyticsLoading ? '…' : analytics?.credentialsUsedAtLeastOnce ?? 0}</strong>
                </article>
                <article className="demo-credentials-admin__metric">
                    <span>Avg session (30d)</span>
                    <strong>{analyticsLoading ? '…' : formatDuration(analytics?.avgSessionDurationMs)}</strong>
                </article>
                <article className="demo-credentials-admin__metric">
                    <span>Login failures (30d)</span>
                    <strong>{analyticsLoading ? '…' : analytics?.loginFailuresLast30Days ?? 0}</strong>
                </article>
            </section>

            <section className="demo-credentials-admin__phase-panel">
                <h2>Phase views (30 days)</h2>
                <div className="demo-credentials-admin__phase-bars">
                    {phaseRows.map((row) => (
                        <div key={row.id} className="demo-credentials-admin__phase-row">
                            <span>{row.label}</span>
                            <div className="demo-credentials-admin__phase-bar-track">
                                <div
                                    className="demo-credentials-admin__phase-bar-fill"
                                    style={{ width: `${(row.count / maxPhaseCount) * 100}%` }}
                                />
                            </div>
                            <strong>{row.count}</strong>
                        </div>
                    ))}
                </div>
            </section>

            <div className="demo-credentials-admin__grid">
                <section className="demo-credentials-admin__card">
                    <h2>Generate credential</h2>
                    <form className="demo-credentials-admin__form" onSubmit={handleCreate}>
                        <label htmlFor="demoCredentialLabel">Label</label>
                        <input
                            id="demoCredentialLabel"
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="e.g. Investor preview — March"
                        />
                        <label htmlFor="demoCredentialExpiry">Expires (optional)</label>
                        <input
                            id="demoCredentialExpiry"
                            type="datetime-local"
                            value={expiresAt}
                            onChange={(e) => setExpiresAt(e.target.value)}
                        />
                        <button type="submit" disabled={creating}>
                            {creating ? 'Generating…' : 'Generate credential'}
                        </button>
                    </form>
                </section>

                <section className="demo-credentials-admin__card demo-credentials-admin__card--table">
                    <div className="demo-credentials-admin__card-head">
                        <h2>Credentials</h2>
                        <button type="button" className="demo-credentials-admin__refresh" onClick={refreshAll}>
                            <Icon icon="mdi:refresh" />
                            Refresh
                        </button>
                    </div>
                    {credentialsLoading ? (
                        <p className="demo-credentials-admin__muted">Loading credentials…</p>
                    ) : credentials.length === 0 ? (
                        <p className="demo-credentials-admin__muted">No credentials yet.</p>
                    ) : (
                        <div className="demo-credentials-admin__table-wrap">
                            <table className="demo-credentials-admin__table">
                                <thead>
                                    <tr>
                                        <th>Label / email</th>
                                        <th>Status</th>
                                        <th>Logins</th>
                                        <th>Last login</th>
                                        <th aria-label="Actions" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {credentials.map((credential) => (
                                        <tr
                                            key={credential.id}
                                            className={selectedId === credential.id ? 'is-selected' : ''}
                                        >
                                            <td>
                                                <div className="demo-credentials-admin__credential-label">
                                                    <strong>{credential.label || 'Untitled'}</strong>
                                                    <span>{credential.email}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`demo-credentials-admin__status demo-credentials-admin__status--${statusTone(credential.status)}`}>
                                                    {credential.status}
                                                </span>
                                            </td>
                                            <td>{credential.loginCount || 0}</td>
                                            <td>{formatDate(credential.lastLoginAt)}</td>
                                            <td>
                                                <div className="demo-credentials-admin__row-actions">
                                                    <button
                                                        type="button"
                                                        onClick={() => copyText(credential.email, 'Email copied')}
                                                        title="Copy email"
                                                    >
                                                        <Icon icon="mdi:email-outline" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedId(credential.id)}
                                                        title="View journey"
                                                    >
                                                        <Icon icon="mdi:map-marker-path" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={credential.status !== 'active' || revokingId === credential.id}
                                                        onClick={() => handleRevoke(credential)}
                                                        title="Revoke"
                                                    >
                                                        <Icon icon="mdi:cancel" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>

            {selectedId ? (
                <section className="demo-credentials-admin__journey">
                    <div className="demo-credentials-admin__journey-head">
                        <div>
                            <h2>Credential journey</h2>
                            <p>
                                {journey?.credential?.label || 'Credential'}
                                {' · '}
                                {journey?.credential?.email}
                            </p>
                        </div>
                        <button type="button" onClick={() => setSelectedId(null)}>Close</button>
                    </div>
                    {journeyLoading ? (
                        <p className="demo-credentials-admin__muted">Loading journey…</p>
                    ) : !journey?.events?.length ? (
                        <p className="demo-credentials-admin__muted">No demo analytics events yet for this credential.</p>
                    ) : (
                        <>
                            <div className="demo-credentials-admin__journey-summary">
                                <span>{journey.summary.sessionCount} sessions</span>
                                <span>{journey.summary.eventCount} events</span>
                                <span>Last activity {formatDate(journey.summary.lastEventAt)}</span>
                            </div>
                            <ol className="demo-credentials-admin__timeline">
                                {journey.events.map((item, index) => (
                                    <li key={`${item.ts}-${item.event}-${index}`}>
                                        <time>{formatDate(item.ts)}</time>
                                        <div>
                                            <strong>{item.event}</strong>
                                            {item.properties?.phase ? (
                                                <span>{PHASE_LABELS[item.properties.phase] || item.properties.phase}</span>
                                            ) : null}
                                            {item.properties?.tab ? <span>tab: {item.properties.tab}</span> : null}
                                            {item.properties?.durationMs ? (
                                                <span>{formatDuration(item.properties.durationMs)}</span>
                                            ) : null}
                                            {item.properties?.attemptedPath ? (
                                                <span>{item.properties.attemptedPath}</span>
                                            ) : null}
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </>
                    )}
                </section>
            ) : null}

            <Popup
                isOpen={Boolean(createdCredential)}
                onClose={() => setCreatedCredential(null)}
                customClassName="demo-credentials-admin__created-popup"
            >
                {createdCredential ? (
                    <div className="demo-credentials-admin__created">
                        <h3>Credential ready</h3>
                        <p>Share these details once. The password cannot be retrieved later.</p>
                        <dl>
                            <div>
                                <dt>Email</dt>
                                <dd>
                                    <code>{createdCredential.email}</code>
                                    <button type="button" onClick={() => copyText(createdCredential.email, 'Email copied')}>
                                        Copy
                                    </button>
                                </dd>
                            </div>
                            <div>
                                <dt>Password</dt>
                                <dd>
                                    <code>{createdCredential.password}</code>
                                    <button type="button" onClick={() => copyText(createdCredential.password, 'Password copied')}>
                                        Copy
                                    </button>
                                </dd>
                            </div>
                            {createdCredential.label ? (
                                <div>
                                    <dt>Label</dt>
                                    <dd>{createdCredential.label}</dd>
                                </div>
                            ) : null}
                        </dl>
                        <a href={getDemoEventsPortalUrl()} target="_blank" rel="noreferrer">Open demo portal</a>
                    </div>
                ) : null}
            </Popup>
        </div>
    );
}

export default DemoCredentialsAdmin;
