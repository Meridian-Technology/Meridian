import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Icon } from '@iconify-icon/react';
import { useNotification } from '../../../../NotificationContext';
import { useGradient } from '../../../../hooks/useGradient';
import './GovernanceSettings.scss';

export default function GovernanceSettings({ org, expandedClass }) {
    const { AtlasMain } = useGradient();
    const { addNotification } = useNotification();
    const orgId = org?._id;
    const [requirements, setRequirements] = useState(null);
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploadKey, setUploadKey] = useState('');
    const [uploading, setUploading] = useState(false);

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        try {
            const [reqRes, docRes] = await Promise.all([
                axios.get(`/org-roles/${orgId}/governance/requirements`, { withCredentials: true }),
                axios.get(`/org-roles/${orgId}/governance`, { withCredentials: true })
            ]);
            if (reqRes.data?.success) {
                setRequirements(reqRes.data);
            }
            if (docRes.data?.success) {
                setDocuments(docRes.data.documents || []);
            }
        } catch (e) {
            addNotification({
                title: 'Error',
                message: e.response?.data?.message || 'Could not load governance data',
                type: 'error'
            });
        } finally {
            setLoading(false);
        }
    }, [orgId, addNotification]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (requirements?.requiredKeys?.length && !uploadKey) {
            setUploadKey(requirements.requiredKeys[0]);
        }
    }, [requirements, uploadKey]);

    const handleUpload = async (e) => {
        e.preventDefault();
        const file = e.target.file?.files?.[0];
        if (!orgId || !uploadKey || !file) {
            addNotification({ title: 'Missing file', message: 'Choose a PDF and document type.', type: 'error' });
            return;
        }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            await axios.post(`/org-roles/${orgId}/governance/${uploadKey}/upload`, fd, {
                withCredentials: true,
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            addNotification({ title: 'Uploaded', message: 'Document submitted as draft. Campus staff may need to approve it.', type: 'success' });
            e.target.reset();
            load();
        } catch (err) {
            addNotification({
                title: 'Upload failed',
                message: err.response?.data?.message || err.message,
                type: 'error'
            });
        } finally {
            setUploading(false);
        }
    };

    if (!orgId) return null;

    return (
        <div className={`dash settings-section ${expandedClass || ''}`}>
            <header className="header">
                <h1>Governance documents</h1>
                <p>
                    Upload PDF versions of required documents (e.g. constitution). New uploads are drafts until approved
                    by an administrator.
                </p>
                <img src={AtlasMain} alt="" />
            </header>
            <div className="settings-content">
                <div className="governance-settings">
                    {loading ? (
                        <p className="governance-settings__muted">Loading…</p>
                    ) : (
                        <>
                            {requirements?.requiredKeys?.length ? (
                                <ul className="governance-settings__required">
                                    {requirements.requiredKeys.map((k) => (
                                        <li key={k}>
                                            <Icon icon="mdi:file-document-outline" />
                                            <strong>{requirements.labels?.[k] || k}</strong>
                                            <span className="governance-settings__key">({k})</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="governance-settings__muted">
                                    No required document keys configured for this org type.
                                </p>
                            )}

                            <form className="governance-settings__form" onSubmit={handleUpload}>
                                <label>
                                    Document type
                                    <select value={uploadKey} onChange={(ev) => setUploadKey(ev.target.value)}>
                                        {(requirements?.requiredKeys || ['constitution']).map((k) => (
                                            <option key={k} value={k}>
                                                {requirements?.labels?.[k] || k}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    PDF file
                                    <input name="file" type="file" accept="application/pdf" />
                                </label>
                                <button type="submit" className="governance-settings__submit" disabled={uploading}>
                                    {uploading ? 'Uploading…' : 'Upload'}
                                </button>
                            </form>

                            <div className="governance-settings__versions">
                                <h3>Current uploads</h3>
                                {documents.length === 0 ? (
                                    <p className="governance-settings__muted">No documents yet.</p>
                                ) : (
                                    documents.map((slot) => (
                                        <div key={slot.key} className="governance-settings__slot">
                                            <h4>{requirements?.labels?.[slot.key] || slot.key}</h4>
                                            <ul>
                                                {(slot.versions || []).slice().reverse().map((v) => (
                                                    <li key={v.version}>
                                                        <span>v{v.version}</span>
                                                        <span
                                                            className={`governance-settings__status governance-settings__status--${v.status}`}
                                                        >
                                                            {v.status}
                                                        </span>
                                                        {v.storageUrl && (
                                                            <a href={v.storageUrl} target="_blank" rel="noreferrer">
                                                                View
                                                            </a>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
