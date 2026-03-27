import React, { useMemo, useState } from 'react';
import { authenticatedRequest, useFetch } from '../../../hooks/useFetch';
import './GovernancePanel.scss';

const LIFECYCLE_OPTIONS = ['pending', 'approved', 'active', 'sunset', 'archived'];

export default function GovernancePanel({ org }) {
    const orgId = org?._id;
    const lifecycleResponse = useFetch(orgId ? `/org-governance/${orgId}/lifecycle` : null);
    const documentsResponse = useFetch(orgId ? `/org-governance/${orgId}/documents` : null);
    const historyResponse = useFetch(orgId ? `/org-governance/${orgId}/membership-history` : null);
    const [newStatus, setNewStatus] = useState('active');
    const [newDocument, setNewDocument] = useState({ title: '', body: '', documentType: 'constitution' });
    const [message, setMessage] = useState('');

    const lifecycle = lifecycleResponse?.data?.data;
    const documents = useMemo(() => documentsResponse?.data?.data || [], [documentsResponse?.data]);
    const members = useMemo(() => historyResponse?.data?.data || [], [historyResponse?.data]);

    const updateLifecycle = async () => {
        if (!orgId) {
            return;
        }
        const result = await authenticatedRequest(`/org-governance/${orgId}/lifecycle`, {
            method: 'PATCH',
            data: { status: newStatus }
        });
        if (result.error) {
            setMessage(result.error);
            return;
        }
        setMessage('Lifecycle updated.');
        lifecycleResponse.refetch();
    };

    const createDocument = async () => {
        if (!orgId || !newDocument.title || !newDocument.body) {
            return;
        }
        const result = await authenticatedRequest(`/org-governance/${orgId}/documents`, {
            method: 'POST',
            data: newDocument
        });
        if (result.error) {
            setMessage(result.error);
            return;
        }
        setMessage('Governance document saved.');
        setNewDocument({ title: '', body: '', documentType: 'constitution' });
        documentsResponse.refetch();
    };

    return (
        <section className="club-governance">
            <header className="club-governance__header">
                <h2>Governance</h2>
                <p>Manage lifecycle states, constitution versions, and officer-term history.</p>
            </header>

            <div className="club-governance__grid">
                <article className="club-governance__card">
                    <h3>Lifecycle</h3>
                    <p className="club-governance__meta">Current: {lifecycle?.lifecycleStatus || org?.lifecycleStatus || 'active'}</p>
                    <div className="club-governance__controls">
                        <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                            {LIFECYCLE_OPTIONS.map((status) => (
                                <option value={status} key={status}>
                                    {status}
                                </option>
                            ))}
                        </select>
                        <button type="button" onClick={updateLifecycle}>Update lifecycle</button>
                    </div>
                </article>

                <article className="club-governance__card">
                    <h3>Governance document</h3>
                    <input
                        value={newDocument.title}
                        onChange={(e) => setNewDocument((prev) => ({ ...prev, title: e.target.value }))}
                        placeholder="Document title"
                    />
                    <textarea
                        value={newDocument.body}
                        onChange={(e) => setNewDocument((prev) => ({ ...prev, body: e.target.value }))}
                        placeholder="Document content"
                    />
                    <div className="club-governance__controls">
                        <select
                            value={newDocument.documentType}
                            onChange={(e) => setNewDocument((prev) => ({ ...prev, documentType: e.target.value }))}
                        >
                            <option value="constitution">Constitution</option>
                            <option value="charter">Charter</option>
                            <option value="policy">Policy</option>
                        </select>
                        <button type="button" onClick={createDocument}>Save version</button>
                    </div>
                    <ul className="club-governance__list">
                        {documents.map((document) => (
                            <li key={document._id}>
                                <span>{document.documentType}</span>
                                <span>v{document.version}</span>
                                <span>{document.status}</span>
                            </li>
                        ))}
                    </ul>
                </article>

                <article className="club-governance__card">
                    <h3>Membership audit timeline</h3>
                    <ul className="club-governance__history">
                        {members.map((member) => (
                            <li key={member._id}>
                                <strong>{member.user_id?.name || member.user_id?.username || 'Member'}</strong>
                                <span>{member.role}</span>
                                <span>{member.termStart ? `${new Date(member.termStart).toLocaleDateString()} - ${member.termEnd ? new Date(member.termEnd).toLocaleDateString() : 'Open'}` : 'No term set'}</span>
                            </li>
                        ))}
                    </ul>
                </article>
            </div>

            {message && <p className="club-governance__message">{message}</p>}
        </section>
    );
}
