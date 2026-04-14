import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { usePostMortemExport } from '../usePostMortemExport';
import './slides.scss';

function ExportSlide({
    event,
    stats,
    analytics,
    rsvpGrowth,
    funnelData,
    platform,
    eventId,
    orgId,
    pdfContentRef,
    actualRegistrations,
    registrationsForConversion,
    actualCheckIns,
    uniqueViewersForConversion,
    onClose,
    addNotification,
    formatNumber
}) {
    const [exporting, setExporting] = useState(false);
    const { exportToPdf } = usePostMortemExport();

    const handleExport = async () => {
        setExporting(true);
        try {
            await exportToPdf({
                event,
                stats,
                analytics,
                rsvpGrowth,
                funnelData,
                platform,
                eventId,
                actualRegistrations,
                registrationsForConversion,
                actualCheckIns,
                uniqueViewersForConversion,
                formatNumber,
                addNotification,
                pdfContentRef
            });
        } catch (err) {
            addNotification?.({
                title: 'Export failed',
                message: err.message || 'Failed to export PDF',
                type: 'error'
            });
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="event-post-mortem-slide">
            <h2 className="event-post-mortem-slide__title">Export Report</h2>
            <p className="event-post-mortem-slide__subtitle">
                Download a PDF summary for presentations or records
            </p>

            <div className="event-post-mortem-slide__card export-slide__content">
                <p className="export-slide__description">
                    Export a condensed PDF with key metrics, conversion stats, funnel data, and traffic sources.
                </p>
                <div className="export-slide__actions">
                    {/* <a
                        href={eventId && orgId ? `/post-mortem-preview/${orgId}/${eventId}` : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="export-slide__btn export-slide__btn-secondary"
                    >
                        <Icon icon="mdi:eye" />
                        Preview layout
                    </a> */}
                    <button
                        type="button"
                        className="export-slide__btn"
                        onClick={handleExport}
                        disabled={exporting}
                    >
                        <Icon icon={exporting ? 'mdi:loading' : 'mdi:file-pdf-box'} className={exporting ? 'spinner' : ''} />
                        {exporting ? 'Exporting...' : 'Export PDF'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ExportSlide;
