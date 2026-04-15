import React, { useEffect, useMemo, useState } from 'react';
import apiRequest from '../../../utils/postRequest';
import './ReservationOpsPanel.scss';

function ReservationOpsPanel({ orgId = null, eventId = null, compact = false }) {
    const [loading, setLoading] = useState(false);
    const [conflicts, setConflicts] = useState([]);
    const [metrics, setMetrics] = useState(null);
    const [error, setError] = useState('');

    const conflictsEndpoint = useMemo(() => (
        orgId
            ? `/org-event-management/${orgId}/reservations/conflicts`
            : '/reservation-conflicts'
    ), [orgId]);

    const metricsEndpoint = useMemo(() => (
        orgId
            ? `/org-event-management/${orgId}/reservations/metrics`
            : '/reservation-metrics'
    ), [orgId]);

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            const [conflictsResp, metricsResp] = await Promise.all([
                apiRequest(conflictsEndpoint, null, { method: 'GET' }),
                apiRequest(metricsEndpoint, null, { method: 'GET' })
            ]);
            if (conflictsResp?.success) {
                let list = conflictsResp.data || [];
                if (eventId) list = list.filter((entry) => String(entry._id) === String(eventId));
                setConflicts(list);
            }
            if (metricsResp?.success) {
                setMetrics(metricsResp.data || null);
            }
        } catch (e) {
            setError(e?.message || 'Failed to load reservation operations data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conflictsEndpoint, metricsEndpoint, eventId]);

    const topConflicts = compact ? conflicts.slice(0, 3) : conflicts.slice(0, 8);

    return (
        <section className={`reservation-ops-panel ${compact ? 'reservation-ops-panel--compact' : ''}`}>
            <div className="reservation-ops-panel__header">
                <h4>Reservation operations</h4>
                <button type="button" onClick={fetchData} disabled={loading}>
                    {loading ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            {error ? <div className="reservation-ops-panel__error">{error}</div> : null}

            {metrics ? (
                <div className="reservation-ops-panel__metrics">
                    <div><span>Total</span><strong>{metrics.totalReservations || 0}</strong></div>
                    <div><span>Conflicts</span><strong>{metrics.conflicts || 0}</strong></div>
                    <div><span>Unresolved</span><strong>{metrics.unresolved || 0}</strong></div>
                </div>
            ) : null}

            <div className="reservation-ops-panel__list">
                {topConflicts.length === 0 ? (
                    <p>No unresolved reservation conflicts.</p>
                ) : (
                    topConflicts.map((item) => (
                        <article key={String(item._id)} className="reservation-ops-panel__item">
                            <div className="reservation-ops-panel__title">{item.name}</div>
                            <div className="reservation-ops-panel__meta">
                                {item.reservation?.conflictSummary?.reason || 'Conflict detected'}
                            </div>
                        </article>
                    ))
                )}
            </div>
        </section>
    );
}

export default ReservationOpsPanel;
