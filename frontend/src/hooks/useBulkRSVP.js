import { useState, useEffect, useCallback } from 'react';
import { useFetch } from './useFetch';
import useAuth from './useAuth';

const useBulkRSVP = (events) => {
    const { user } = useAuth();
    const [rsvpData, setRsvpData] = useState({});
    const [loading, setLoading] = useState(false);

    // Filter events that have RSVP enabled
    const rsvpEnabledEvents = events?.filter(event => event.rsvpEnabled) || [];

    // Create query string for event IDs
    const eventIds = rsvpEnabledEvents.map(event => event._id).join(',');

    // Fetch RSVP data for all events at once
    const { data, loading: fetchLoading } = useFetch(
        rsvpEnabledEvents.length > 0 && user ? `/my-rsvps?eventIds=${eventIds}` : null
    );

    // Update local state when data changes
    useEffect(() => {
        if (data?.success && data.rsvps) {
            setRsvpData(data.rsvps);
        }
    }, [data]);

    // Update loading state
    useEffect(() => {
        setLoading(fetchLoading);
    }, [fetchLoading]);

    // Get RSVP status for a specific event
    const getRSVPStatus = useCallback((eventId) => {
        return rsvpData[eventId] || null;
    }, [rsvpData]);

    // Update RSVP status for a specific event (called after successful RSVP update)
    const updateRSVPStatus = useCallback((eventId, rsvpStatus) => {
        setRsvpData(prev => ({
            ...prev,
            [eventId]: rsvpStatus
        }));
    }, []);

    return {
        rsvpData,
        loading,
        getRSVPStatus,
        updateRSVPStatus
    };
};

export default useBulkRSVP;
