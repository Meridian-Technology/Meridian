import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useNotification } from './NotificationContext';
import apiRequest from './utils/postRequest';
import { analytics } from './services/analytics/analytics';
import { getAllAnonymousRegistrations, removeAnonymousRegistration } from './utils/anonymousRegistrationStorage';
import { isWww, isPathAllowedOnWww, getTenantRedirectUrl, getLastTenant, hasDevTenantOverride } from './config/tenantRedirect';

/** 
documentation:
https://incongruous-reply-44a.notion.site/Frontend-AuthProvider-Component-AuthContext-951d04c042614f32a9052e9d57905e8d
*/

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(true); // [1
    const [user, setUser] = useState(null);
    const [checkedIn, setCheckedIn] = useState(null);
    const [authMethod, setAuthMethod] = useState(null); // 'google', 'saml', 'email'
    const [friendRequests, setFriendRequests] = useState({ received: [], sent: [] });
    const [pendingOrgInvites, setPendingOrgInvites] = useState([]);
    const [showOrgInviteModal, setShowOrgInviteModal] = useState(true);

    const { addNotification } = useNotification();

    const validateToken = async () => {
        try {
            // Make the GET request to the validate-token endpoint with cookies
            const response = await apiRequest('/validate-token', null, { method: 'GET' });
            console.log('Token validation response:', response);
            // console.log('Token validation response:', response.data);
            // Handle response...
            if (response.success) {
                // On www, if this path requires a tenant, redirect to tenant or school picker.
                // In dev with devTenantOverride, we're already on the tenant (same origin + X-Tenant);
                // skip redirect to avoid reload loop (getTenantRedirectUrl returns same origin in dev).
                if (isWww() && !hasDevTenantOverride() && !isPathAllowedOnWww(window.location.pathname)) {
                    const communities = response.data.communities || [];
                    const last = getLastTenant();
                    const tenant = communities.length === 1
                        ? communities[0]
                        : (communities.includes(last) ? last : communities[0]);
                    if (tenant) {
                        window.location.href = getTenantRedirectUrl(tenant);
                        return;
                    }
                    const path = window.location.pathname + (window.location.search || '');
                    const next = path !== '/' ? `?next=${encodeURIComponent(path)}` : '';
                    window.location.href = `/select-school${next}`;
                    return;
                }
                setUser(response.data.user);
                // Set friend requests if provided
                if (response.data.friendRequests) {
                    setFriendRequests({
                        received: response.data.friendRequests.received || [],
                        sent: response.data.friendRequests.sent || []
                    });
                }
                if (response.data.pendingOrgInvites) {
                    setPendingOrgInvites(response.data.pendingOrgInvites);
                    if (response.data.pendingOrgInvites.length > 0) {
                        setShowOrgInviteModal(true);
                    }
                } else {
                    setPendingOrgInvites([]);
                }
                // Determine auth method from user data (only when user exists)
                const u = response.data.user;
                if (u) {
                    if (u.samlProvider) {
                        setAuthMethod('saml');
                    } else if (u.googleId) {
                        setAuthMethod('google');
                    } else if (u.appleId) {
                        setAuthMethod('apple');
                    } else {
                        setAuthMethod('email');
                    }
                    // Identify user in analytics and set roles (for admin exclusion from tracking)
                    if (u._id) {
                        analytics.identify(u._id);
                        analytics.setUserRoles(u.roles);
                    }
                }
                // Claim any anonymous event registrations from this browser and remove from localStorage (only when we have a tenant user)
                if (u) {
                    const registrations = getAllAnonymousRegistrations();
                    if (registrations.length > 0) {
                        try {
                            const claimRes = await apiRequest('/claim-anonymous-registrations', { registrations }, { method: 'POST' });
                            if (claimRes && claimRes.success && Array.isArray(claimRes.claimed)) {
                                claimRes.claimed.forEach((id) => {
                                    removeAnonymousRegistration(id != null ? String(id) : '');
                                });
                            }
                        } catch (e) {
                            // non-fatal: leave anonymous regs in storage to retry next time
                        }
                    }
                    setIsAuthenticated(true);
                    getCheckedIn();
                }
                setIsAuthenticating(false);
            } else {
                setIsAuthenticated(false);
                setIsAuthenticating(false);
                setPendingOrgInvites([]);
            }
        } catch (error) {
            console.log('Token expired or invalid');
            setIsAuthenticated(false);
            setIsAuthenticating(false);
            setPendingOrgInvites([]);
            return error;
        }
    };

    const clearPendingOrgInvite = (inviteId) => {
        setPendingOrgInvites(prev => prev.filter(inv => inv._id !== inviteId));
    };

    const dismissOrgInviteModal = () => {
        setShowOrgInviteModal(false);
    };

    useEffect(() => {
        validateToken();
    }, []);

    const handleSuccessfulAuthResponse = async (responseData, authMethodName, successMessage = null) => {
        setIsAuthenticated(true);
        setUser(responseData.user);
        setAuthMethod(authMethodName);

        if (responseData.user && responseData.user._id) {
            analytics.identify(responseData.user._id);
            analytics.setUserRoles(responseData.user.roles);
        }

        if (responseData.friendRequests) {
            setFriendRequests({
                received: responseData.friendRequests.received || [],
                sent: responseData.friendRequests.sent || []
            });
        }

        if (successMessage) {
            addNotification({ title: successMessage, type: 'success' });
        }

        await validateToken();
        return responseData;
    };

    const login = async (credentials) => {
        try {
            const response = await axios.post('/login', credentials, {
                withCredentials: true
            });
            if (response.status === 200) {
                const payload = response.data?.data || {};
                if (payload.requiresMfa) {
                    return payload;
                }

                await handleSuccessfulAuthResponse(payload, 'email', 'Logged in successfully');

                if (isWww() && credentials.school) {
                    window.location.href = getTenantRedirectUrl(credentials.school);
                    return payload;
                }
                if (payload.user?.roles && payload.user.roles.includes('admin')) {
                    window.location.href = '/admin';
                }
                return payload;
            }
        } catch (error) {
            // console.error('Login failed:', error);
            // Handle login error
            throw error;
        }
    };

    const googleLogin = async (code, isRegister, codeVerifier = null, redirectUriOverride = null, options = {}) => {
        try {
            const url = redirectUriOverride != null ? redirectUriOverride : window.location.href;
            const body = { code, isRegister, url, codeVerifier };
            if (isWww() && options.school) body.school = options.school;
            const response = await axios.post('/google-login', body, {
                withCredentials: true
            });
            const payload = response.data?.data || {};
            if (payload.requiresMfa) {
                return payload;
            }

            await handleSuccessfulAuthResponse(payload, 'google');
            
            if (isWww() && options.school) {
                window.location.href = getTenantRedirectUrl(options.school);
                return payload;
            }
            // Redirect admin users to admin dashboard
            if (payload.user?.roles && payload.user.roles.includes('admin')) {
                window.location.href = '/admin';
            }
            return payload;
        } catch (error) {
            console.error('Error sending code to backend:', error);
            // Handle error
            throw error;
        }
    };

    const appleLogin = async (idToken, user, options = {}) => {
        try {
            const body = { idToken, user };
            if (isWww() && options.school) body.school = options.school;
            const response = await axios.post('/apple-login', body, {
                withCredentials: true
            });
            const payload = response.data?.data || {};
            if (payload.requiresMfa) {
                return payload;
            }

            await handleSuccessfulAuthResponse(payload, 'apple', 'Logged in successfully');
            
            if (isWww() && options.school) {
                window.location.href = getTenantRedirectUrl(options.school);
                return payload;
            }
            // Redirect admin users to admin dashboard
            if (payload.user?.roles && payload.user.roles.includes('admin')) {
                window.location.href = '/admin';
            }
            return payload;
        } catch (error) {
            console.error('Error sending Apple ID token to backend:', error);
            // Handle error
            throw error;
        }
    };

    const verifyAdminMfaTotp = async (code, mfaToken = null) => {
        const body = { code };
        if (mfaToken) body.mfaToken = mfaToken;
        const response = await axios.post('/mfa/verify-totp', body, { withCredentials: true });
        return handleSuccessfulAuthResponse(response.data.data, 'email', 'Logged in successfully');
    };

    const getAdminMfaPasskeyOptions = async (mfaToken = null) => {
        const body = {};
        if (mfaToken) body.mfaToken = mfaToken;
        const response = await axios.post('/mfa/passkey/authentication-options', body, { withCredentials: true });
        return response.data.data.options;
    };

    const verifyAdminMfaPasskey = async (credential, mfaToken = null) => {
        const body = { credential };
        if (mfaToken) body.mfaToken = mfaToken;
        const response = await axios.post('/mfa/verify-passkey', body, { withCredentials: true });
        return handleSuccessfulAuthResponse(response.data.data, 'email', 'Logged in successfully');
    };

    const samlLogin = async (relayState = null) => {
        try {
            // Redirect to SAML login endpoint
            const baseUrl = process.env.NODE_ENV === 'production' 
                ? window.location.origin 
                : 'http://localhost:5001'; // Use backend URL directly in development
            const loginUrl = `${baseUrl}/auth/saml/login${relayState ? `?relayState=${encodeURIComponent(relayState)}` : ''}`;
            window.location.href = loginUrl;
        } catch (error) {
            console.error('SAML login error:', error);
            throw error;
        }
    };

    const logout = async () => {
        try {
            // Use SAML logout if user authenticated via SAML
            if (authMethod === 'saml') {
                await axios.post('/auth/saml/logout', {}, { withCredentials: true });
            } else {
                await axios.post('/logout', {}, { withCredentials: true });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            setIsAuthenticated(false);
            setUser(null);
            setAuthMethod(null);
            // Reset analytics user identification
            analytics.reset();
            addNotification({title: 'Logged out successfully',type: 'success'});
        }
    };

    const getDeveloper = async () => {
        try {
            const response = await axios.get('/get-developer', {
                withCredentials: true
            });
            
            if (response.data.success) {
                const responseBody = response.data;
                console.log('Developer:', responseBody);
                return responseBody;
            } else {
                return { developer: null};
            }
        }
        catch (error) {
            console.error('Error fetching developer:', error);
        }
    }

    const getCheckedIn = async () => {
        try {
            const response = await axios.get('/checked-in', {
                withCredentials: true
            });

            if (response.data.success) {
                const responseBody = response.data;
                if(responseBody.classrooms.length === 0){
                    return { checkedIn: null };
                }
                console.log(responseBody.classrooms[0]);
                setCheckedIn(responseBody.classrooms[0]);
            } else {
                return { checkedIn: null };
            }
        } catch (error) {
            console.error('Error fetching checked in:', error);
        }
    }

    const refreshFriendRequests = async () => {
        try {
            const response = await apiRequest('/friend-requests', null, { method: 'GET' });
            if (response.success) {
                setFriendRequests({
                    received: response.data.received || [],
                    sent: response.data.sent || []
                });
                return response.data;
            }
        } catch (error) {
            console.error('Error refreshing friend requests:', error);
        }
    };

    return (
        <AuthContext.Provider value={{ 
            isAuthenticated, 
            user, 
            login, 
            logout, 
            googleLogin,
            appleLogin, 
            samlLogin,
            validateToken, 
            isAuthenticating, 
            getDeveloper, 
            checkedIn, 
            getCheckedIn,
            authMethod,
            friendRequests,
            refreshFriendRequests,
            pendingOrgInvites,
            clearPendingOrgInvite,
            showOrgInviteModal,
            dismissOrgInviteModal,
            setPendingOrgInvites,
            verifyAdminMfaTotp,
            getAdminMfaPasskeyOptions,
            verifyAdminMfaPasskey
        }}>
            {children}
        </AuthContext.Provider>
    );
};
