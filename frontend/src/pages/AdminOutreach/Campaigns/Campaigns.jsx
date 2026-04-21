import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import './Campaigns.scss';

const listParams = { page: 1, limit: 50 };

function formatMessageDate(m) {
    const d = m.sentAt || m.createdAt;
    if (!d) return '—';
    try {
        return new Date(d).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return '—';
    }
}

function statusLabel(status) {
    if (status === 'sent') return 'Sent';
    if (status === 'scheduled') return 'Scheduled';
    return 'Draft';
}

function Campaigns() {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState(null);

    const { data, loading, error, refetch } = useFetch('/admin/outreach/messages', {
        params: listParams,
    });

    const detailUrl = selectedId ? `/admin/outreach/messages/${selectedId}` : null;
    const analyticsUrl = selectedId ? `/admin/outreach/messages/${selectedId}/analytics` : null;

    const { data: messageRes, loading: messageLoading, error: messageFetchError } = useFetch(detailUrl);
    const { data: analyticsRes, loading: analyticsLoading, error: analyticsFetchError } = useFetch(analyticsUrl);

    const messages = useMemo(() => {
        if (!data?.success || !Array.isArray(data.data)) return [];
        const q = search.trim().toLowerCase();
        if (!q) return data.data;
        return data.data.filter((m) => (m.title || '').toLowerCase().includes(q));
    }, [data, search]);

    const totalCount = data?.pagination?.total ?? messages.length;
    const listSummary =
        search.trim() && data?.success
            ? `${messages.length} shown (${totalCount} total)`
            : `${totalCount} total`;

    const closeModal = useCallback(() => setSelectedId(null), []);

    const message =
        messageRes?.success && messageRes.data && String(messageRes.data._id) === String(selectedId)
            ? messageRes.data
            : null;
    const analytics =
        analyticsRes?.success && analyticsRes.data ? analyticsRes.data : null;

    return (
        <div className="campaigns">
            <header className="campaigns-header">
                <h2>Campaigns</h2>
                <p className="subtitle">View and manage past outreach</p>
            </header>

            <div className="campaigns-toolbar">
                <div className="search-wrapper">
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search by title..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => navigate('/admin-outreach?page=1')}
                    >
                        New Outreach
                    </button>
                </div>

                {error && (
                    <p className="campaigns-inline-error" role="alert">
                        {error}
                    </p>
                )}
                {data?.success === false && data?.message && (
                    <p className="campaigns-inline-error" role="alert">
                        {data.message}
                    </p>
                )}

                <div className="campaigns-list">
                    <div className="campaign-card">
                        <div className="campaign-header">
                            <p>Outreach messages</p>
                            <p>{loading ? 'Loading…' : listSummary}</p>
                        </div>

                        {!loading && messages.length === 0 && (
                            <div className="campaigns-empty">
                                <p>No messages yet. Create one from New Outreach.</p>
                            </div>
                        )}

                        {messages.map((m) => (
                            <div key={m._id} className="campaign-content">
                                <div className="campaign-content-body">
                                    <p>{m.title || '(Untitled)'}</p>
                                    <div className="campaign-content-stats">
                                        <p>{formatMessageDate(m)}</p>
                                        <p>•</p>
                                        <p>{statusLabel(m.status)}</p>
                                    </div>
                                </div>

                                <div className="campaign-contenats-right">
                                    <button type="button" className="btn btn-primary">
                                        {statusLabel(m.status)}
                                    </button>
                                    <button
                                        type="button"
                                        className="campaigns-view-link"
                                        onClick={() => setSelectedId(m._id)}
                                    >
                                        View
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {selectedId && (
                <div className="campaigns-modal-backdrop" role="presentation" onClick={closeModal}>
                    <div
                        className="campaigns-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="campaigns-modal-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="campaigns-modal-header">
                            <h3 id="campaigns-modal-title">Message details</h3>
                            <button type="button" className="campaigns-modal-close" onClick={closeModal}>
                                ×
                            </button>
                        </div>
                        <div className="campaigns-modal-body">
                            {(messageLoading || analyticsLoading) && <p>Loading…</p>}
                            {(messageFetchError || analyticsFetchError) && (
                                <p className="campaigns-inline-error" role="alert">
                                    {messageFetchError || analyticsFetchError}
                                </p>
                            )}
                            {!messageLoading && messageRes?.success === false && (
                                <p className="campaigns-inline-error">{messageRes?.message || 'Could not load message.'}</p>
                            )}
                            {message && (
                                <>
                                    <p className="campaigns-modal-title-text">{message.title}</p>
                                    <p className="campaigns-modal-meta">
                                        Status: {statusLabel(message.status)} ·{' '}
                                        {formatMessageDate(message)}
                                    </p>
                                    {message.subject && message.subject !== message.title && (
                                        <p className="campaigns-modal-subject">
                                            <strong>Subject:</strong> {message.subject}
                                        </p>
                                    )}
                                    <div className="campaigns-modal-body-text">{message.body}</div>
                                </>
                            )}
                            {message && message.status !== 'sent' && (
                                <p className="campaigns-modal-hint">Engagement metrics appear after the message is sent.</p>
                            )}
                            {analytics && message?.status === 'sent' && (
                                <div className="campaigns-analytics">
                                    <p>
                                        <strong>Recipients</strong> {analytics.total}
                                    </p>
                                    <p>
                                        Opened {analytics.opened} · Seen {analytics.seen} · Clicked{' '}
                                        {analytics.clicked}
                                    </p>
                                    <p>
                                        Open rate {Math.round((analytics.openRate || 0) * 100)}% · Click rate{' '}
                                        {Math.round((analytics.clickRate || 0) * 100)}%
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className="campaigns-modal-footer">
                            <button type="button" className="btn btn-primary" onClick={() => refetch({ silent: true })}>
                                Refresh list
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Campaigns;
