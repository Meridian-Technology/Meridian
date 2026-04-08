import React, { useState } from 'react';
import { useFetch } from '../../../../hooks/useFetch';
import { useGradient } from '../../../../hooks/useGradient';
import { useNotification } from '../../../../NotificationContext';
import apiRequest from '../../../../utils/postRequest';
import Popup from '../../../../components/Popup/Popup';
import { Icon } from '@iconify-icon/react';
import './GovernanceApprovals.scss';

function GovernanceApprovals() {
    const { data: pendingRes, loading, error, refetch } = useFetch('/org-management/governance/pending-drafts');
    const { AtlasMain } = useGradient();
    const { addNotification } = useNotification();
    const [approvingKey, setApprovingKey] = useState(null);
    const [viewerFile, setViewerFile] = useState(null);

    const rows = pendingRes?.data || [];

    const formatDate = (dateString) => {
        if (!dateString) return '—';
        return new Date(dateString).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const handleApprove = async (orgId, docKey, version) => {
        const key = `${orgId}:${docKey}:${version}`;
        setApprovingKey(key);
        try {
            const encodedKey = encodeURIComponent(docKey);
            const response = await apiRequest(
                `/org-management/organizations/${orgId}/governance/${encodedKey}/versions/${version}/approve`,
                null,
                { method: 'PUT' }
            );
            if (response.success) {
                addNotification({
                    title: 'Approved',
                    message: `${docKey} v${version} is now the active version for that organization.`,
                    type: 'success'
                });
                refetch();
            } else {
                addNotification({
                    title: 'Could not approve',
                    message: response.message || 'Unknown error',
                    type: 'error'
                });
            }
        } catch (err) {
            const msg = err?.response?.data?.message || err?.message || 'Request failed';
            addNotification({ title: 'Could not approve', message: msg, type: 'error' });
        } finally {
            setApprovingKey(null);
        }
    };

    const openPdfViewer = (url, filename) => {
        if (!url) return;
        setViewerFile({ url, filename: filename || 'Governance document' });
    };

    if (loading) {
        return (
            <div className="governance-approvals">
                <div className="loading">Loading pending governance documents...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="governance-approvals">
                <div className="error">Error loading queue: {error}</div>
            </div>
        );
    }

    return (
        <div className="governance-approvals dash">
            <header className="header">
                <h1>Governance documents</h1>
                <p>Approve uploaded bylaws, constitutions, and other governance files after clubs submit them</p>
                <img src={AtlasMain} alt="" />
            </header>

            <div className="content">
                {rows.length === 0 ? (
                    <div className="empty-state">
                        <Icon icon="mdi:file-document-check-outline" />
                        <h3>No drafts awaiting approval</h3>
                        <p>When an organization uploads a new governance document, it appears here until you approve it.</p>
                    </div>
                ) : (
                    <div className="gov-table">
                        <div className="table-header">
                            <span className="col-org">Organization</span>
                            <span className="col-doc">Document</span>
                            <span className="col-ver">Version</span>
                            <span className="col-uploaded">Uploaded</span>
                            <span className="col-actions">Actions</span>
                        </div>
                        {rows.map((row) => {
                            const key = `${row.orgId}:${row.docKey}:${row.version}`;
                            return (
                                <div className="table-row" key={key}>
                                    <span className="col-org">
                                        {row.orgProfileImage ? (
                                            <img className="org-avatar" src={row.orgProfileImage} alt="" />
                                        ) : (
                                            <span className="org-avatar-placeholder">
                                                <Icon icon="mdi:account-group" />
                                            </span>
                                        )}
                                        <span className="org-name">{row.orgName || '—'}</span>
                                    </span>
                                    <span className="col-doc">
                                        <span className="doc-key">{row.docKey}</span>
                                        {row.originalFilename && (
                                            <span className="doc-file">{row.originalFilename}</span>
                                        )}
                                    </span>
                                    <span className="col-ver">v{row.version}</span>
                                    <span className="col-uploaded">{formatDate(row.uploadedAt)}</span>
                                    <span className="col-actions">
                                        {row.storageUrl && (
                                            <button
                                                type="button"
                                                className="btn-link btn-link-button"
                                                onClick={() => openPdfViewer(row.storageUrl, row.originalFilename || `${row.docKey} v${row.version}`)}
                                            >
                                                View file
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="btn-approve"
                                            disabled={approvingKey === key}
                                            onClick={() => handleApprove(row.orgId, row.docKey, row.version)}
                                        >
                                            <Icon icon="mdi:check" />
                                            {approvingKey === key ? 'Approving…' : 'Approve'}
                                        </button>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            <Popup
                isOpen={Boolean(viewerFile)}
                onClose={() => setViewerFile(null)}
                customClassName="pdf-viewer-popup"
            >
                <div className="pdf-viewer">
                    <div className="pdf-viewer-header">
                        <h3>{viewerFile?.filename || 'PDF viewer'}</h3>
                        {viewerFile?.url && (
                            <a
                                className="btn-link"
                                href={viewerFile.url}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Open in new tab
                            </a>
                        )}
                    </div>
                    {viewerFile?.url && (
                        <iframe
                            src={viewerFile.url}
                            title={viewerFile.filename || 'Governance PDF'}
                            className="pdf-viewer-frame"
                        />
                    )}
                </div>
            </Popup>
        </div>
    );
}

export default GovernanceApprovals;
