import React, { useState, useEffect } from 'react';
import './FormResponses.scss';
import { Icon } from '@iconify-icon/react';
import { useDashboard } from '../../../contexts/DashboardContext';
import Popup from '../../../components/Popup/Popup';
import FormResponseViewer from '../../../components/FormResponseViewer/FormResponseViewer';

const FormResponses = ({ currentFormResponses}) => {
    const { hideOverlay } = useDashboard();
    const [currentForm, setCurrentForm] = useState(null);
    const [viewingResponseList, setViewingResponseList] = useState(true); // true = list view, false = detail view
    const [selectedResponseIndex, setSelectedResponseIndex] = useState(0);

    // Calculate statistics
    const numberOfResponses = currentFormResponses?.length || 0;
    const uniqueRespondents = currentFormResponses ? new Set(
        currentFormResponses
            .map(response => response.submittedBy?._id || response.submittedBy?.email || response.submittedBy?.name)
            .filter(Boolean)
    ).size : 0;
    
    const mostRecentResponse = currentFormResponses && currentFormResponses.length > 0
        ? currentFormResponses.reduce((latest, current) => {
            const latestDate = new Date(latest.submittedAt);
            const currentDate = new Date(current.submittedAt);
            return currentDate > latestDate ? current : latest;
          })
        : null;

    {/* Form Responses Viewer Popup */}
    console.log(currentFormResponses);
    return (<>
    {currentFormResponses && currentFormResponses.length > 0 ? (
        viewingResponseList ? (
            // List view - show all submissions
            <div className="responses-list-container">
                <button className="close-btn" onClick={hideOverlay}>
                    <Icon icon="mdi:arrow-left" />
                    Back
                </button>
                <h1>Form Responses</h1>
                
                {/* Statistics Section */}
                <div className="responses-statistics">
                    <div className="stat-item">
                        <Icon icon="mdi:file-document-multiple" className="stat-icon" />
                        <div className="stat-content">
                            <span className="stat-label">Total Responses</span>
                            <span className="stat-value">{numberOfResponses}</span>
                        </div>
                    </div>
                    <div className="stat-item">
                        <Icon icon="mdi:account-group" className="stat-icon" />
                        <div className="stat-content">
                            <span className="stat-label">Unique Respondents</span>
                            <span className="stat-value">{uniqueRespondents}</span>
                        </div>
                    </div>
                    <div className="stat-item">
                        <Icon icon="mdi:clock-check-outline" className="stat-icon" />
                        <div className="stat-content">
                            <span className="stat-label">Last Entry</span>
                            <span className="stat-value">
                                {mostRecentResponse 
                                    ? new Date(mostRecentResponse.submittedAt).toLocaleString()
                                    : 'N/A'
                                }
                            </span>
                        </div>
                    </div>
                </div>

                <div className="responses-list-header">
                    <h3>Form Submissions ({currentFormResponses.length})</h3>
                </div>
                <div className="responses-list">
                    {currentFormResponses.map((response, index) => (
                        <div 
                            key={response._id || index}
                            className="response-list-item"
                            onClick={() => {
                                setSelectedResponseIndex(index);
                                setViewingResponseList(false);
                            }}
                        >
                            <div className="response-item-content">
                                <div className="response-item-main">
                                    <div className="response-item-name">
                                        <Icon icon="mdi:account-circle" className="user-icon" />
                                        <span className="submitted-by-name">
                                            {response.submittedBy?.name || response.submittedBy?.email || 'Anonymous'}
                                        </span>
                                    </div>
                                    <div className="response-item-date">
                                        <Icon icon="mdi:clock-outline" className="date-icon" />
                                        <span>{new Date(response.submittedAt).toLocaleString()}</span>
                                    </div>
                                </div>
                                {/* <Icon icon="mdi:chevron-right" className="chevron-icon" /> */}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        ) : (
            // Detail view - show specific response
            <div className="responses-viewer-container">
                <div className="responses-header">
                    <button
                        className="back-btn"
                        onClick={() => setViewingResponseList(true)}
                    >
                        <Icon icon="mdi:arrow-left" />
                        <span>Back to List</span>
                    </button>
                    <div className="response-navigation">
                        <button
                            className="nav-btn"
                            onClick={() => {
                                const newIndex = Math.max(0, selectedResponseIndex - 1);
                                setSelectedResponseIndex(newIndex);
                            }}
                            disabled={selectedResponseIndex === 0}
                        >
                            <Icon icon="mdi:chevron-left" />
                        </button>
                        <span className="response-counter">
                            {selectedResponseIndex + 1} of {currentFormResponses.length}
                        </span>
                        <button
                            className="nav-btn"
                            onClick={() => {
                                const newIndex = Math.min(currentFormResponses.length - 1, selectedResponseIndex + 1);
                                setSelectedResponseIndex(newIndex);
                            }}
                            disabled={selectedResponseIndex === currentFormResponses.length - 1}
                        >
                            <Icon icon="mdi:chevron-right" />
                        </button>
                    </div>
                </div>
                <FormResponseViewer formResponse={currentFormResponses[selectedResponseIndex]} />
                    <div className="response-meta-info">
                        {currentFormResponses[selectedResponseIndex].submittedBy && (
                            <span className="submitted-by">
                                {currentFormResponses[selectedResponseIndex].submittedBy.name || currentFormResponses[selectedResponseIndex].submittedBy.email}
                            </span>
                        )}
                        <span className="submitted-date">
                            {new Date(currentFormResponses[selectedResponseIndex].submittedAt).toLocaleString()}
                        </span>
                    </div>
            </div>
        )
    ) : (
        <div className="no-responses">
            <p>No responses yet for this form.</p>
        </div>
    )}
    </>)

}

export default FormResponses;