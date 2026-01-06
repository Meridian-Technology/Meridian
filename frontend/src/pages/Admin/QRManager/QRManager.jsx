import React, { useState, useEffect } from 'react';
import apiRequest from '../../../utils/postRequest';
import { useFetch } from '../../../hooks/useFetch';
import { Icon } from '@iconify-icon/react';
import Popup from '../../../components/Popup/Popup';
import CreateQRModal from './components/CreateQRModal';
import EditQRModal from './components/EditQRModal';
import AnalyticsModal from './components/AnalyticsModal';
import './QRManager.scss';

const QRManager = () => {
    const [selectedQR, setSelectedQR] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
    
    // Pagination and filtering
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');
    const [sortBy, setSortBy] = useState('createdAt');
    const [sortOrder, setSortOrder] = useState('desc');

    // Build query parameters for QR codes
    const qrParams = new URLSearchParams({
        page: currentPage,
        limit: 10,
        sortBy,
        sortOrder
    });


    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    };

    if (searchTerm) qrParams.append('search', searchTerm);
    if (activeFilter !== 'all') qrParams.append('isActive', activeFilter === 'active');

    // Use useFetch for QR codes data
    const { data: qrData, loading: qrLoading, error: qrError, refetch: refetchQRCodes } = useFetch(`/api/qr?${qrParams}`);

    // Use useFetch for overview data
    const { data: overviewData, loading: overviewLoading } = useFetch('/api/qr/analytics/overview');

    // Update data when useFetch returns results
    useEffect(() => {
        if (qrData) {
            setTotalPages(qrData.pagination?.totalPages || 1);
        }
    }, [qrData]);

    const handleDeleteQR = async (qrName) => {
        if (window.confirm('Are you sure you want to delete this QR code?')) {
            try {
                const response = await apiRequest(`/api/qr/${qrName}`, null, { method: 'DELETE' });
                if (response.error) {
                    console.error('Failed to delete QR code:', response.error);
                } else {
                    refetchQRCodes();
                }
            } catch (err) {
                console.error('Failed to delete QR code:', err);
            }
        }
    };

    const openEditModal = (qr) => {
        setSelectedQR(qr);
        setShowEditModal(true);
    };

    const openAnalyticsModal = (qr) => {
        setSelectedQR(qr);
        setShowAnalyticsModal(true);
    };

    const getQRCodeUrl = (qrName) => {
        return `${window.location.origin}/qr/${qrName}`;
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        // You could add a toast notification here
    };



    if (qrLoading && (!qrData || qrData.qrCodes?.length === 0)) {
        return (
            <div className="qr-manager">
                <div className="loading">Loading QR codes...</div>
            </div>
        );
    }

    return (
        <div className="qr-manager">
            <div className="header">
                <h1>QR Code Management</h1>
                <button 
                    className="create-btn"
                    onClick={() => setShowCreateModal(true)}
                >
                    <Icon icon="material-symbols:add" />
                    Create QR Code
                </button>
            </div>

            {overviewData && !overviewLoading && (
                <div className="overview-cards">
                    <div className="card">
                        <div className="card-title">Total QR Codes</div>
                        <div className="card-value">{overviewData.totalQRCodes}</div>
                    </div>
                    <div className="card">
                        <div className="card-title">Active QR Codes</div>
                        <div className="card-value">{overviewData.activeQRCodes}</div>
                    </div>
                    <div className="card">
                        <div className="card-title">Total Scans</div>
                        <div className="card-value">{overviewData.totalScans}</div>
                    </div>
                    <div className="card">
                        <div className="card-title">Unique Scans</div>
                        <div className="card-value">{overviewData.totalUniqueScans}</div>
                    </div>
                </div>
            )}

            {/* <div className="filters">
                <div className="search-box">
                    <Icon icon="material-symbols:search" />
                    <input
                        type="text"
                        placeholder="Search QR codes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <select 
                    value={activeFilter} 
                    onChange={(e) => setActiveFilter(e.target.value)}
                >
                    <option value="all">All QR Codes</option>
                    <option value="active">Active Only</option>
                    <option value="inactive">Inactive Only</option>
                </select>
                <select 
                    value={sortBy} 
                    onChange={(e) => setSortBy(e.target.value)}
                >
                    <option value="createdAt">Created Date</option>
                    <option value="name">Name</option>
                    <option value="scans">Total Scans</option>
                    <option value="lastScanned">Last Scanned</option>
                </select>
                <button 
                    onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                    className="sort-btn"
                >
                    <Icon icon={sortOrder === 'desc' ? 'material-symbols:arrow-downward' : 'material-symbols:arrow-upward'} />
                </button>
            </div> */}

            {qrError && (
                <div className="error-message">
                    {qrError}
                    <button onClick={() => window.location.reload()}>×</button>
                </div>
            )}

            <div className="qr-list">
                {qrData?.qrCodes?.map((qr) => (
                    <div key={qr.name} className={`qr-item ${!qr.isActive ? 'inactive' : ''}`}>
                        <div className="qr-info">
                            <div className="qr-name">{qr.name}</div>
                            <div className="qr-description">{qr.description || 'No description'}</div>
                            <div className="qr-url">
                                <span>Redirects to:</span> {qr.redirectUrl}
                            </div>
                            <div className="qr-stats">
                                <span>Total: {qr.scans}</span>
                                <span>Unique: {qr.uniqueScans}</span>
                                <span>Repeat: {qr.repeated}</span>
                            </div>
                            <div className="qr-meta">
                                <span>Created: {formatDate(qr.createdAt)}</span>
                                {qr.lastScanned && (
                                    <span>Last scan: {formatDate(qr.lastScanned)}</span>
                                )}
                            </div>
                        </div>
                        <div className="qr-actions">
                            <div className="qr-link">
                                <span>QR Link:</span>
                                <div className="link-container">
                                    <input 
                                        type="text" 
                                        value={getQRCodeUrl(qr.name)} 
                                        readOnly 
                                    />
                                    <button onClick={() => copyToClipboard(getQRCodeUrl(qr.name))}>
                                        <Icon icon="material-symbols:content-copy" />
                                    </button>
                                </div>
                            </div>
                            <div className="action-buttons">
                                <button 
                                    onClick={() => openAnalyticsModal(qr)}
                                    className="analytics-btn"
                                >
                                    <Icon icon="material-symbols:analytics" />
                                    Analytics
                                </button>
                                <button 
                                    onClick={() => openEditModal(qr)}
                                    className="edit-btn"
                                >
                                    <Icon icon="material-symbols:edit" />
                                    Edit
                                </button>
                                <button 
                                    onClick={() => handleDeleteQR(qr.name)}
                                    className="delete-btn"
                                >
                                    <Icon icon="material-symbols:delete" />
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {totalPages > 1 && (
                <div className="pagination">
                    <button 
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1}
                    >
                        Previous
                    </button>
                    <span>Page {currentPage} of {totalPages}</span>
                    <button 
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                    >
                        Next
                    </button>
                </div>
            )}

            {/* Create Modal */}
            <Popup 
                isOpen={showCreateModal} 
                onClose={() => setShowCreateModal(false)}
                customClassName="wide-content"
            >
                <CreateQRModal
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={refetchQRCodes}
                />
            </Popup>

            {/* Edit Modal */}
            <Popup 
                isOpen={showEditModal} 
                onClose={() => setShowEditModal(false)}
                customClassName="wide-content"
            >
                <EditQRModal
                    qrCode={selectedQR}
                    onClose={() => setShowEditModal(false)}
                    onSuccess={refetchQRCodes}
                />
            </Popup>

            {/* Analytics Modal */}
            <Popup 
                isOpen={showAnalyticsModal} 
                onClose={() => setShowAnalyticsModal(false)}
                customClassName="wide-content"
            >
                <AnalyticsModal
                    qrCode={selectedQR}
                    onClose={() => setShowAnalyticsModal(false)}
                />
            </Popup>
        </div>
    );
};

export default QRManager;
