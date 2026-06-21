import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { analytics } from '../services/analytics/analytics';

export function useDemoSession() {
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const [credential, setCredential] = useState(null);
    const [manifest, setManifest] = useState(null);
    const [error, setError] = useState(null);

    const applySession = useCallback((data) => {
        if (!data?.user) {
            setIsAuthenticated(false);
            setUser(null);
            setCredential(null);
            setManifest(null);
            return;
        }
        setIsAuthenticated(true);
        setUser(data.user);
        setCredential(data.credential || null);
        setManifest(data.manifest || null);
        if (data.credential?.id) {
            analytics.identify(`demo:${data.credential.id}`);
        }
    }, []);

    const refreshMe = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get('/events-demo/auth/me', { withCredentials: true });
            if (response.data?.success) {
                applySession(response.data.data);
            } else {
                applySession(null);
            }
        } catch (err) {
            applySession(null);
            if (err.response?.status !== 401) {
                setError(err.response?.data?.message || 'Unable to load demo session');
            }
        } finally {
            setLoading(false);
        }
    }, [applySession]);

    useEffect(() => {
        refreshMe();
    }, [refreshMe]);

    const login = useCallback(async (email, password) => {
        setError(null);
        try {
            const response = await axios.post(
                '/events-demo/auth/login',
                { email, password },
                { withCredentials: true }
            );
            if (!response.data?.success) {
                const message = response.data?.message || 'Login failed';
                analytics.track('demo_login_failure', { reason: response.data?.code || 'unknown' });
                setError(message);
                return { success: false, message };
            }
            const data = response.data.data;
            applySession(data);
            analytics.track('demo_login_success', {
                credentialId: data.credential?.id,
                label: data.credential?.label || '',
            });
            return { success: true, data };
        } catch (err) {
            const message = err.response?.data?.message || 'Login failed';
            analytics.track('demo_login_failure', { reason: err.response?.data?.code || 'network' });
            setError(message);
            return { success: false, message };
        }
    }, [applySession]);

    const logout = useCallback(async () => {
        try {
            await axios.post('/events-demo/auth/logout', {}, { withCredentials: true });
        } catch (_) {
            // ignore
        }
        applySession(null);
    }, [applySession]);

    return {
        loading,
        isAuthenticated,
        user,
        credential,
        manifest,
        error,
        login,
        logout,
        refreshMe,
        setError,
    };
}
