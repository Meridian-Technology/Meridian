import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useNotification } from './NotificationContext';
import apiRequest from './utils/postRequest';
import { analytics } from './services/analytics/analytics';
import { getAllAnonymousRegistrations, removeAnonymousRegistration } from './utils/anonymousRegistrationStorage';

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
                // Determine auth method frwom user data
                if (response.data.user.samlProvider) {
                    setAuthMethod('saml');
                } else if (response.data.user.googleId) {
                    setAuthMethod('google');
                } else if (response.data.user.appleId) {
                    setAuthMethod('apple');
                } else {
                    setAuthMethod('email');
                }
                // Identify user in analytics and set roles (for admin exclusion from tracking)
                if (response.data.user._id) {
                    analytics.identify(response.data.user._id);
                    analytics.setUserRoles(response.data.user.roles);
                }
                // Claim any anonymous event registrations from this browser and remove from localStorage
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
                // console.log(response.data.user);
                setIsAuthenticated(true);
                setIsAuthenticating(false);
                getCheckedIn();
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

    const login = async (credentials) => {
        try {
            const response = await axios.post('/login', credentials, {
                withCredentials: true
            });
            if (response.status === 200) {
                setIsAuthenticated(true);
                setUser(response.data.data.user);
                setAuthMethod('email');
                // Identify user in analytics and set roles (for admin exclusion from tracking)
                if (response.data.data.user._id) {
                    analytics.identify(response.data.data.user._id);
                    analytics.setUserRoles(response.data.data.user.roles);
                }
                // Set friend requests if provided (may not be included in login response)
                if (response.data.data.friendRequests) {
                    setFriendRequests({
                        received: response.data.data.friendRequests.received || [],
                        sent: response.data.data.friendRequests.sent || []
                    });
                }
                console.log(response.data);
                addNotification({ title:'Logged in successfully',type: 'success'});
                
                // Refresh pending invites so OrgInviteModal and invite flows have up-to-date data
                await validateToken();
                
                // Redirect admin users to admin dashboard
                if (response.data.data.user.roles && response.data.data.user.roles.includes('admin')) {
                    window.location.href = '/admin';
                }
            }
        } catch (error) {
            // console.error('Login failed:', error);
            // Handle login error
            throw error;
        }
    };

    const googleLogin = async (code, isRegister, codeVerifier = null, redirectUriOverride = null) => {
        try {
            const url = redirectUriOverride != null ? redirectUriOverride : window.location.href;
            const response = await axios.post('/google-login', { 
                code, 
                isRegister, 
                url,
                codeVerifier 
            }, {
                withCredentials: true
            });
            // Handle response from the backend (e.g., storing the token, redirecting the user)
            console.log('Backend response:', response.data);
            console.log('User object from Google login:', response.data.data.user);
            setIsAuthenticated(true);
            setUser(response.data.data.user);
            setAuthMethod('google');
            // Identify user in analytics and set roles (for admin exclusion from tracking)
            if (response.data.data.user._id) {
                analytics.identify(response.data.data.user._id);
                analytics.setUserRoles(response.data.data.user.roles);
            }
            // addNotification({title: 'Logged in successfully',type: 'success'});
            
            // Refresh pending invites so OrgInviteModal and invite flows have up-to-date data
            await validateToken();
            
            // Redirect admin users to admin dashboard
            if (response.data.data.user.roles && response.data.data.user.roles.includes('admin')) {
                window.location.href = '/admin';
            }
        } catch (error) {
            console.error('Error sending code to backend:', error);
            // Handle error
            throw error;
        }
    };

    const appleLogin = async (idToken, user) => {
        try {
            const response = await axios.post('/apple-login', { idToken, user }, {
                withCredentials: true
            });
            // Handle response from the backend
            console.log('Backend response:', response.data);
            console.log('User object from Apple login:', response.data.data.user);
            setIsAuthenticated(true);
            setUser(response.data.data.user);
            setAuthMethod('apple');
            // Identify user in analytics and set roles (for admin exclusion from tracking)
            if (response.data.data.user._id) {
                analytics.identify(response.data.data.user._id);
                analytics.setUserRoles(response.data.data.user.roles);
            }
            addNotification({ title: 'Logged in successfully', type: 'success' });
            
            // Refresh pending invites so OrgInviteModal and invite flows have up-to-date data
            await validateToken();
            
            // Redirect admin users to admin dashboard
            if (response.data.data.user.roles && response.data.data.user.roles.includes('admin')) {
                window.location.href = '/admin';
            }
        } catch (error) {
            console.error('Error sending Apple ID token to backend:', error);
            // Handle error
            throw error;
        }
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
            setPendingOrgInvites
        }}>
            {children}
        </AuthContext.Provider>
    );
};
